import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { fileMatchesType } from "@/lib/filetype";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTipNotificationEmail } from "@/lib/email";
import { formatBaht } from "@/lib/format";
import { tipSchema, usernameSchema } from "@/lib/validators";
import {
  uploadSlip,
  uploadVoice,
  deleteVoices,
  deleteSlip,
  deleteFile,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { verifySlip, receiverMatches, type SlipVerifyResult } from "@/lib/slip-verify";
import { judgePaypalReceipt } from "@/lib/paypal";
import { readPaypalReceipt } from "@/lib/paypal-receipt";
import { censorText } from "@/lib/profanity";
import { linkBase } from "@/lib/site";
import { applySubathonTip, type TimerEffect } from "@/lib/subathon";
import { validatePick } from "@/lib/alert-sets";
import { spinFloor } from "@/lib/wheel";
import { startSpinTx, wheelForFans } from "@/lib/wheel-server";
import { onTipConfirmedTx, TIP_TX } from "@/lib/tip-hooks";
import { validChoice } from "@/lib/goal-server";
import { extrasFloor } from "@/lib/wishlist";
import {
  clampVoiceSec,
  isVideoId,
  parseStart,
  voiceBaseType,
  VOICE_MAX_BYTES,
  VOICE_MIN_BYTES,
  type VoiceType,
} from "@/lib/media";
import { bytesMatchType } from "@/lib/filetype";
import { fetchOEmbed, type OEmbedResult } from "@/lib/youtube";
import { mediaQueueConfirmTx } from "@/lib/media-queue";
import { lockCreator } from "@/lib/combo-server";
import { forgetGachaPull, gachaSnapshot, gachaStartTx } from "@/lib/gacha-server";
import { fanSide } from "@/lib/pk-server";
import { getActiveSetId } from "@/lib/alert-sets-server";

/**
 * Lock the tip and say whether it is still CONFIRMED. The auto-confirm retries
 * run after the tip is already visible, so the creator may have rejected it in
 * between — a retry must then do nothing.
 */
async function stillConfirmed(tx: Prisma.TransactionClient, tipId: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status"::text AS "status" FROM "Tip" WHERE "id" = ${tipId} FOR UPDATE`;
  return row?.status === "CONFIRMED";
}

export async function POST(req: Request) {
  const limit = await rateLimit(`tip:${clientIp(req)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const username = usernameSchema.safeParse(form.get("username"));
  if (!username.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const creator = await prisma.user.findUnique({
    where: { username: username.data },
    select: {
      id: true,
      promptpayId: true,
      autoConfirmTips: true,
      email: true,
      displayName: true,
      timerEnabled: true,
      timerReduceEnabled: true,
      timerReduceMinAmount: true,
      minTipAmount: true,
      paypalHandle: true,
      soundPickEnabled: true,
      alertsEnabled: true,
      mediaEnabled: true,
      mediaMinAmount: true,
      voiceEnabled: true,
      voiceMinAmount: true,
    },
  });
  if (!creator?.promptpayId) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }


  const parsed = tipSchema.safeParse({
    supporterName: form.get("supporterName") ?? "",
    message: form.get("message") ?? "",
    amount: form.get("amount"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  // Parse checkbox manually (see note in validators.ts).
  const isMessagePublic = form.get("isMessagePublic") === "true";

  // Creator-chosen floor. Checked here (not in the zod schema) because it is
  // per-creator data that only exists after the lookup above.
  if (parsed.data.amount < creator.minTipAmount) {
    return NextResponse.json({ error: "below_minimum" }, { status: 400 });
  }

  // What the supporter wants this tip to do to the subathon clock. ADD is the
  // default (and what any old client sends). REDUCE is only honoured when the
  // creator has opened it up and the amount clears their minimum — otherwise
  // refuse loudly rather than silently turning a sabotage into a boost.
  const effectRaw = form.get("timerEffect");
  const timerEffect: TimerEffect =
    effectRaw === "REDUCE" ? "REDUCE" : effectRaw === "NONE" ? "NONE" : "ADD";
  if (
    timerEffect === "REDUCE" &&
    !(
      creator.timerEnabled &&
      creator.timerReduceEnabled &&
      // The sabotage minimum can never sit below the general minimum.
      parsed.data.amount >= Math.max(creator.timerReduceMinAmount, creator.minTipAmount)
    )
  ) {
    return NextResponse.json({ error: "reduce_not_allowed" }, { status: 400 });
  }

  // The sound the fan picked (src/lib/alert-sets.ts). It must be a fan-
  // pickable sound of today's set that the amount covers. If not — usually
  // the creator switched sets mid-payment — the tip still goes through (the
  // fan has paid) without the pick, and the fan is told a random one plays.
  const pickRaw = form.get("pickedSoundId");
  const pickId = typeof pickRaw === "string" && pickRaw.length > 0 ? pickRaw : null;
  let pickedSoundId: string | null = null;
  let pickedSoundPrice: number | null = null;
  let pickDropped = false;
  if (pickId) {
    const items =
      creator.soundPickEnabled && creator.alertsEnabled
        ? await prisma.alertSetItem.findMany({
            where: { setId: await getActiveSetId(creator.id) },
            select: { assetId: true, fanPickable: true, minAmount: true, asset: { select: { kind: true } } },
          })
        : [];
    const pick = validatePick(
      items.map((i) => ({ assetId: i.assetId, kind: i.asset.kind, fanPickable: i.fanPickable, minAmount: i.minAmount })),
      pickId,
      parsed.data.amount,
      creator.minTipAmount,
    );
    if (pick.ok) {
      pickedSoundId = pick.assetId;
      pickedSoundPrice = items.find((i) => i.assetId === pick.assetId)?.minAmount ?? 0;
    } else pickDropped = true;
  }

  // "หมุนวงล้อ" (src/lib/wheel.ts): `spinWheel` is the wheel the fan saw. It
  // stands only if that is still the wheel in use (card on, segments left)
  // and the amount covers spin + picked sound. The draw happens on confirm.
  let spinWheelId: string | null = null;
  let spinPrice: number | null = null;
  let spinDropped = false;
  const spinRaw = form.get("spinWheel");
  if (typeof spinRaw === "string" && spinRaw.length > 0) {
    const wheel = await wheelForFans(creator.id);
    if (
      wheel?.id === spinRaw &&
      parsed.data.amount >= spinFloor(creator.minTipAmount, wheel.price, pickedSoundPrice)
    ) {
      spinWheelId = wheel.id;
      spinPrice = wheel.price;
    } else spinDropped = true;
  }

  // "PK": the side the fan chose, kept only for this creator's own running
  // two-sides match (never an error — the tip itself is unaffected).
  const pk = await fanSide(creator.id, form.get("pkMatchId"), form.get("pkSide"), new Date());

  // "กาชา" (src/lib/gacha.ts): `gachaSeen` is the box version the fan saw.
  // The pull stands if that is still the box (K1), the card is on and the
  // amount covers it on top of the sound and spin; the box is saved on the
  // tip and the draw at confirm uses it. Otherwise the fan is told.
  let gachaPrice: number | null = null;
  let gachaBox: Awaited<ReturnType<typeof gachaSnapshot>> = null;
  let gachaDropped = false;
  if (form.get("gachaPull") === "1") {
    const seen = Number(form.get("gachaSeen"));
    const snap = Number.isInteger(seen) ? await gachaSnapshot(creator.id, seen) : null;
    if (snap && parsed.data.amount >= extrasFloor(creator.minTipAmount, [pickedSoundPrice, spinPrice, snap.price])) {
      gachaBox = snap;
      gachaPrice = snap.price;
    } else gachaDropped = true;
  }

  // "ขอคลิป/เพลง" (src/lib/media.ts): the form sends only the video ID and
  // start (never the URL). One kind of fan media per tip. The clip stands if
  // the card is on and the amount covers it on top of the sound and spin; the
  // oEmbed check runs alongside the slip check below. Otherwise the tip goes
  // through without it and the fan is told (never an error — they've paid).
  const mediaRaw = form.get("mediaVideoId");
  const voiceRaw = form.get("voice");
  if (isVideoId(mediaRaw) && voiceRaw instanceof File && voiceRaw.size > 0) {
    return NextResponse.json({ error: "media_both" }, { status: 400 });
  }
  let mediaDropped = false;
  let mediaCheck: Promise<OEmbedResult> | null = null;
  let mediaVideoId: string | null = null;
  let mediaStart = 0;
  if (typeof mediaRaw === "string" && mediaRaw.length > 0) {
    const startRaw = form.get("mediaStart");
    if (
      isVideoId(mediaRaw) &&
      creator.mediaEnabled &&
      parsed.data.amount >= extrasFloor(creator.minTipAmount, [pickedSoundPrice, spinPrice, gachaPrice, creator.mediaMinAmount])
    ) {
      mediaVideoId = mediaRaw;
      mediaStart = parseStart(typeof startRaw === "string" ? startRaw : null);
      mediaCheck = fetchOEmbed(mediaVideoId);
    } else mediaDropped = true;
  }

  // "ฝากเสียง" (src/lib/media.ts): a voice message recorded in the browser.
  // It stands if the card is on, the file is a real webm/mp4/ogg recording of
  // a sane size, and the amount covers it on top of the sound and spin.
  // Otherwise the tip goes through without it and the fan is told.
  let voiceDropped = false;
  let voiceFile: { file: File; type: VoiceType; sec: number } | null = null;
  if (voiceRaw instanceof File && voiceRaw.size > 0) {
    const type = voiceBaseType(voiceRaw.type);
    const head = new Uint8Array(await voiceRaw.slice(0, 16).arrayBuffer());
    if (
      type &&
      voiceRaw.size >= VOICE_MIN_BYTES &&
      voiceRaw.size <= VOICE_MAX_BYTES &&
      bytesMatchType(type, head) &&
      creator.voiceEnabled &&
      parsed.data.amount >= extrasFloor(creator.minTipAmount, [pickedSoundPrice, spinPrice, gachaPrice, creator.voiceMinAmount])
    ) {
      voiceFile = { file: voiceRaw, type, sec: clampVoiceSec(form.get("voiceSec")) };
    } else voiceDropped = true;
  }

  // Goal "หลายชิ้น": the item the fan chose to help. Kept only if it still
  // stands (card on, item live and not full); otherwise the tip simply counts
  // as "no choice" (never an error).
  const wishRaw = form.get("wishItemId");
  const wishItemId = await validChoice(creator.id, typeof wishRaw === "string" && wishRaw.length > 0 ? wishRaw : null);

  // PAYPAL only when the creator has a PayPal.me; anything else is PromptPay.
  const paymentMethod: "PROMPTPAY" | "PAYPAL" =
    form.get("paymentMethod") === "PAYPAL" ? "PAYPAL" : "PROMPTPAY";
  if (paymentMethod === "PAYPAL" && !creator.paypalHandle) {
    return NextResponse.json({ error: "paypal_not_enabled" }, { status: 400 });
  }

  // Censor offensive words in the public-facing name + message (keeps the
  // stream/overlay/leaderboard clean).
  const cleanName = censorText(parsed.data.supporterName);
  const cleanMessage = censorText(parsed.data.message);

  // Validate the slip file.
  const slip = form.get("slip");
  if (!(slip instanceof File) || slip.size === 0) {
    return NextResponse.json({ error: "slip_required" }, { status: 400 });
  }
  if (slip.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(slip.type) || !(await fileMatchesType(slip))) {
    return NextResponse.json({ error: "bad_type" }, { status: 415 });
  }

  // Screen the slip with the verifier (Gemini/SlipOK/EasySlip — no-op unless a
  // provider is configured). We compute a verdict for EVERY slip and store it
  // as a dashboard flag; auto-confirm is reserved for a clean "match".
  // PayPal receipts are not bank slips — the PayPal branch below judges them.
  const verify: SlipVerifyResult =
    paymentMethod === "PAYPAL"
      ? { ok: false, reason: "disabled" }
      : await verifySlip(slip);
  if (!verify.ok && verify.reason === "duplicate") {
    return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
  }
  // The clip's oEmbed check ran alongside: 401/404 = it can't play on stream.
  const media = mediaCheck ? await mediaCheck : null;
  if (media && !media.ok) {
    mediaVideoId = null;
    mediaDropped = true;
  }
  // Did a verifier actually run? (false only when no provider is configured.)
  const verifierRan = verify.ok || verify.reason !== "disabled";

  let status: "PENDING" | "CONFIRMED" = "PENDING";
  let transRef: string | null = null;
  let autoVerified = false;
  let confirmedAt: Date | null = null;
  // Verdict flag for the dashboard. NULL when no verifier ran.
  let verifyCode: string | null = null;
  let verifyDetail: string | null = null;

  if (verify.ok) {
    transRef = verify.transRef;
    // Block reuse of the same bank slip.
    const dup = await prisma.tip.findUnique({
      where: { transRef },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
    }
    const amountOk = Math.abs(verify.amount - parsed.data.amount) < 0.01;
    const receiverOk = receiverMatches(creator.promptpayId, verify.receiverRaw);
    if (amountOk && receiverOk) {
      verifyCode = "match";
      // Read by the AI (Gemini), not checked with the bank: the dashboard shows
      // "AI: ตรวจแล้วตรง" instead of the bank-verified "auto" badge.
      if (verify.tier === "ocr") verifyDetail = "ocr";
    } else if (!amountOk) {
      // The slip's amount differs from what the supporter entered.
      verifyCode = "amount";
      verifyDetail = formatBaht(verify.amount, "th-TH");
    } else {
      // Amount is right but the money didn't go to this creator.
      verifyCode = "receiver";
    }
  } else if (verify.reason === "invalid") {
    // Verifier read the image but it isn't a (matching) transfer slip.
    verifyCode = "notslip";
  } else if (verify.reason === "timeout" || verify.reason === "error") {
    // Verifier couldn't finish (slow/blurry/network) — hold for manual review.
    verifyCode = "unreadable";
  }

  // Auto-confirm ONLY a clean match, and ONLY when the creator opted in. Every
  // other verdict (mismatch / unreadable) stays PENDING so a suspicious slip is
  // never signed off automatically — the creator reviews it (guided by the flag).
  if (verifyCode === "match" && creator.autoConfirmTips) {
    status = "CONFIRMED";
    autoVerified = true;
    confirmedAt = new Date();
  } else if (!verifierRan && creator.autoConfirmTips) {
    // Backward-compat: no verifier configured + creator trusts slips (they watch
    // their bank) — confirm on arrival, as before. NOT slip verification.
    status = "CONFIRMED";
    confirmedAt = new Date();
  }

  // PayPal: level-1 read of the receipt for the dashboard flag, duplicate
  // guard on the transaction id, and NEVER auto-confirm (a screenshot can be
  // edited and we can't ask PayPal whether the money moved).
  if (paymentMethod === "PAYPAL") {
    const judged = judgePaypalReceipt(
      await readPaypalReceipt(slip),
      parsed.data.amount,
    );
    if (judged.transRef) {
      const dup = await prisma.tip.findUnique({
        where: { transRef: judged.transRef },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
      }
    }
    status = "PENDING";
    autoVerified = false;
    confirmedAt = null;
    transRef = judged.transRef;
    verifyCode = judged.verifyCode;
    verifyDetail = judged.verifyDetail;
  }

  // Private bucket — the dashboard reaches it via /api/tips/[id]/slip only.
  const slipKey = await uploadSlip(slip);
  // Same private bucket; removed again below if the tip can't be written.
  let voiceKey: string | null = null;
  if (voiceFile) {
    voiceKey = await uploadVoice(voiceFile.file, voiceFile.type).catch((err) => {
      console.error("[voice] upload failed:", err);
      return null;
    });
    if (!voiceKey) voiceDropped = true;
  }

  // The slip is already in storage; if the row cannot be written (a concurrent
  // duplicate hitting the unique transRef, a DB error, a creator deleted
  // mid-request) nothing else references the object, so remove it here.
  let tip: { id: string };
  try {
    tip = await prisma.tip.create({
      data: {
        creatorId: creator.id,
        supporterName: cleanName,
        message: cleanMessage,
        amount: parsed.data.amount,
        isMessagePublic,
        slipKey,
        timerEffect,
        paymentMethod,
        pickedSoundId,
        spinWheelId,
        ...(gachaBox ? { gachaPull: true, gachaBox: gachaBox.box } : {}),
        ...(pk ?? {}),
        wishItemId,
        ...(mediaVideoId
          ? {
              mediaRequest: {
                create: {
                  userId: creator.id,
                  videoId: mediaVideoId,
                  title: media?.ok && media.title ? censorText(media.title) : "",
                  startSec: mediaStart,
                },
              },
            }
          : voiceKey && voiceFile
            ? {
                mediaRequest: {
                  create: {
                    userId: creator.id,
                    kind: "voice",
                    title: "",
                    audioKey: voiceKey,
                    durationSec: voiceFile.sec,
                  },
                },
              }
            : {}),
        status,
        transRef,
        autoVerified,
        confirmedAt,
        verifyCode,
        verifyDetail,
      },
      select: { id: true },
    });
  } catch (e) {
    await deleteSlip(slipKey);
    if (voiceKey && !(await deleteVoices([voiceKey]))) console.error("[voice] cleanup after failed tip failed");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
    }
    throw e;
  }

  // Confirmed on arrival (auto-verified or auto-confirm) → add subathon time.
  if (status === "CONFIRMED") {
    after(() => applySubathonTip(creator.id, parsed.data.amount, timerEffect));
    // Run every tip feature now (not after the response) so the overlays see it
    // on their next poll — one transaction, same pipeline and lock order as the
    // confirm button (src/lib/tip-hooks.ts). Never fails the tip itself. Another
    // tip may have taken the wheel's last segment since the check above: the fan
    // is told the spin didn't happen (the tip row says so too).
    const tipId = tip.id;
    const spun = await prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Tip" WHERE "id" = ${tipId} FOR UPDATE`;
        const now = new Date();
        const spin = spinWheelId ? await startSpinTx(tx, tipId, now) : null;
        const pull = gachaBox ? await gachaStartTx(tx, tipId, now) : null;
        await onTipConfirmedTx(tx, tipId, now);
        return { spin, pull };
      }, TIP_TX)
      .catch(async (err) => {
        console.error("[tip-hooks] auto-confirm features failed:", err);
        // The fan's clip must still reach the queue: retry it on its own.
        if (mediaVideoId || voiceKey) {
          await prisma
            .$transaction(async (tx) => {
              if (!(await stillConfirmed(tx, tipId))) return;
              await lockCreator(tx, creator.id);
              await mediaQueueConfirmTx(tx, tipId, new Date());
            }, TIP_TX)
            .catch(async (err2) => {
              console.error("[media] queue retry failed:", err2);
              if (voiceKey) voiceDropped = true;
              else mediaDropped = true;
              // The fan was told it won't play: make sure no later reject +
              // re-confirm brings it back.
              await prisma.mediaRequest
                .updateMany({ where: { tipId, status: "HELD" }, data: { status: "REMOVED", endedAt: new Date() } })
                .catch((err3) => console.error("[media] drop failed:", err3));
              // The fan was told the voice won't play: its file goes now.
              if (voiceKey && (await deleteVoices([voiceKey]))) {
                await prisma.mediaRequest
                  .updateMany({ where: { tipId }, data: { audioKey: null, audioPurgedAt: new Date() } })
                  .catch(() => {});
              }
            });
        }
        // A failure elsewhere (combo, wishlist…) must not cost the fan a paid
        // gacha pull or spin: retry each draw on its own.
        const pull = gachaBox
          ? await prisma
              .$transaction(async (tx) => {
                if (!(await stillConfirmed(tx, tipId))) return "none" as const;
                return gachaStartTx(tx, tipId, new Date());
              }, TIP_TX)
              .catch((err2) => {
                console.error("[gacha] pull retry failed:", err2);
                return "none" as const;
              })
          : null;
        if (!spinWheelId) return { spin: null, pull };
        const spin = await prisma
          .$transaction(async (tx) => {
            if (!(await stillConfirmed(tx, tipId))) return "empty" as const;
            return startSpinTx(tx, tipId, new Date());
          }, TIP_TX)
          .catch((err2) => {
            console.error("[wheel] spin retry failed:", err2);
            return "empty" as const;
          });
        return { spin, pull };
      });
    if (spinWheelId && spun.spin !== "started") spinDropped = true;
    if (gachaBox && spun.pull !== "started" && spun.pull !== "restored") {
      gachaDropped = true;
      // Told it didn't happen: a later reject + confirm must not draw it.
      await forgetGachaPull(prisma, tipId).catch((err) => console.error("[gacha] forget failed:", err));
    }
  }

  // Notify the creator by email after the response is sent (best-effort — never
  // block or fail the tip on email problems).
  const origin = linkBase(req);
  const amountLabel = formatBaht(parsed.data.amount, "th-TH");
  after(async () => {
    try {
      await sendTipNotificationEmail({
        to: creator.email,
        creatorName: creator.displayName,
        supporterName: cleanName,
        amount: amountLabel,
        message: cleanMessage || null,
        confirmed: status === "CONFIRMED",
        dashboardUrl: `${origin}/th/dashboard`,
      });
    } catch (err) {
      console.error("[tip-email] failed:", err);
    }
  });

  return NextResponse.json({
    ok: true,
    id: tip.id,
    autoVerified,
    confirmed: status === "CONFIRMED",
    pickDropped,
    spinDropped,
    gachaDropped,
    mediaDropped,
    voiceDropped,
  });
}

// Bulk-clear the signed-in creator's REJECTED tips (dashboard "clear all
// rejected" button). Confirmed tips are never touched.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const where = { creatorId: session.user.id, status: "REJECTED" as const };
  // Collect the slip files first so they can be removed after the rows are.
  const doomed = await prisma.tip.findMany({
    where,
    select: { id: true, slipKey: true, slipUrl: true, mediaRequest: { select: { audioKey: true } } },
  });
  // Delete exactly the rows whose files were collected (a tip rejected in
  // between waits for the next clear-out, files and all).
  const result = await prisma.tip.deleteMany({ where: { ...where, id: { in: doomed.map((t) => t.id) } } });
  after(async () => {
    for (const t of doomed) {
      await deleteSlip(t.slipKey);
      await deleteFile(t.slipUrl);
    }
    if (!(await deleteVoices(doomed.map((t) => t.mediaRequest?.audioKey)))) {
      console.error("[voice] delete with rejected tips failed");
    }
  });
  return NextResponse.json({ ok: true, count: result.count });
}
