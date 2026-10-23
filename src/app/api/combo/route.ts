import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanRows, COUNTDOWN_MS, isDifficulty, LIVE_MS, sizeAt, sizesFor, type LevelRow } from "@/lib/combo";
import { difficultyOf, endIfExpired, rowsOf, typicalFor } from "@/lib/combo-server";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Everything the combo settings page shows, after applying any expired countdown. */
async function settings(userId: string) {
  const now = new Date();
  await endIfExpired(userId, now);
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      comboEnabled: true,
      comboDifficulty: true,
      comboRows: true,
      comboColor: true,
      comboOverlaySeenAt: true,
      comboCooldownUntil: true,
      alertColor: true,
      autoConfirmTips: true,
      minTipAmount: true,
    },
  });
  if (!u) return null;
  const difficulty = difficultyOf(u.comboDifficulty);
  const rows = rowsOf(u.comboRows, difficulty);
  const typical = await typicalFor(prisma, userId, u.minTipAmount, now);
  const active = await prisma.combo.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { level: true, progress: true, sizes: true, lastTipAt: true },
  });
  return {
    enabled: u.comboEnabled,
    difficulty,
    rows,
    color: u.comboColor,
    alertColor: u.alertColor,
    autoConfirm: u.autoConfirmTips,
    typical,
    sizes: sizesFor(rows, difficulty, typical),
    live: Boolean(u.comboOverlaySeenAt && u.comboOverlaySeenAt.getTime() >= now.getTime() - LIVE_MS),
    current: active
      ? {
          level: active.level,
          progress: active.progress,
          size: sizeAt(active.sizes, active.level),
          endsAt: new Date(active.lastTipAt.getTime() + COUNTDOWN_MS).toISOString(),
        }
      : null,
    cooldownUntil: u.comboCooldownUntil && u.comboCooldownUntil > now ? u.comboCooldownUntil.toISOString() : null,
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await settings(user.id);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(s);
}

/**
 * Change any of `{ difficulty, rows, color }`. Switching to "custom" keeps the
 * current numbers as the starting baht of each row. Edits apply to the next
 * combo (a running one keeps its copy).
 */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const cur = await settings(user.id);
  if (!cur) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: { comboDifficulty?: string; comboRows?: LevelRow[]; comboColor?: string | null } = {};
  let difficulty = cur.difficulty;
  if (body.difficulty !== undefined) {
    if (!isDifficulty(body.difficulty)) return NextResponse.json({ error: "invalid" }, { status: 400 });
    difficulty = body.difficulty;
    data.comboDifficulty = difficulty;
  }
  if (body.rows !== undefined) {
    const rows = cleanRows(body.rows, difficulty === "custom");
    if (!rows) return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.comboRows = rows;
  } else if (difficulty === "custom" && cur.difficulty !== "custom") {
    // Start "ตั้งเอง" from the numbers the creator was just looking at.
    data.comboRows = cur.rows.map((r, i) => ({ amount: cur.sizes[i], reward: r.reward }));
  }
  if (body.color !== undefined) {
    if (body.color !== null && (typeof body.color !== "string" || !HEX.test(body.color))) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    data.comboColor = body.color;
  }
  await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json(await settings(user.id));
}
