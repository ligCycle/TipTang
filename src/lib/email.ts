import "server-only";
import nodemailer from "nodemailer";

// Where replies land. Resets and tip alerts go out from the support address
// (or, on a Gmail fallback, at least point replies at it).
const REPLY_TO = (process.env.EMAIL_REPLY_TO ?? "support@tiptang.com").trim();

/**
 * Low-level email sender.
 * Provider precedence: Resend (verified tiptang.com domain) -> SMTP (Gmail
 * app password, the original bootstrap) -> dev console fallback. Resend wins
 * when both are configured so switching production over is a matter of
 * adding RESEND_* on Vercel — no need to unset the SMTP variables first.
 * With no provider configured the message is logged to the server console so
 * flows stay testable in development.
 */
async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  devLabel: string;
}): Promise<void> {
  const { to, subject, text, html, devLabel } = opts;

  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: (process.env.RESEND_FROM ?? "TipTang <support@tiptang.com>").trim(),
        to,
        reply_to: REPLY_TO,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);
    return;
  }

  if (process.env.SMTP_HOST) {
    // Trim env values — a stray tab/space (e.g. from copy-paste) in SMTP_HOST
    // otherwise causes an EBADNAME DNS failure.
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(),
      port: Number((process.env.SMTP_PORT ?? "587").trim()),
      secure: (process.env.SMTP_SECURE ?? "").trim() === "true",
      auth: {
        user: process.env.SMTP_USER?.trim(),
        pass: process.env.SMTP_PASS?.trim(),
      },
    });
    await transport.sendMail({
      from: (process.env.SMTP_FROM ?? process.env.SMTP_USER)?.trim(),
      to,
      replyTo: REPLY_TO,
      subject,
      text,
      html,
    });
    return;
  }

  console.log(`[email:dev] ${devLabel} -> ${to}: ${text}`);
}

// Escape untrusted text before embedding in the HTML email body.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Send a password-reset email. */
export async function sendPasswordResetEmail(
  to: string,
  link: string,
  locale: string,
): Promise<void> {
  const subject =
    locale === "th"
      ? "รีเซ็ตรหัสผ่าน TipTang"
      : "Reset your TipTang password";
  const intro =
    locale === "th"
      ? "มีการขอรีเซ็ตรหัสผ่านของคุณ คลิกลิงก์ด้านล่างเพื่อตั้งรหัสใหม่ (ลิงก์หมดอายุใน 1 ชั่วโมง) หากคุณไม่ได้เป็นคนขอ ไม่ต้องทำอะไร"
      : "A password reset was requested for your account. Click the link below to set a new password (expires in 1 hour). If you didn't request this, ignore this email.";
  await sendEmail({
    to,
    subject,
    text: `${intro}\n\n${link}`,
    html: `<p>${intro}</p><p><a href="${link}">${link}</a></p>`,
    devLabel: "Password reset link",
  });
}

/** Notify a creator that a new tip has arrived. Best-effort (caller ignores errors). */
export async function sendTipNotificationEmail(opts: {
  to: string;
  creatorName: string;
  supporterName: string;
  amount: string;
  message: string | null;
  confirmed: boolean;
  dashboardUrl: string;
}): Promise<void> {
  const { to, creatorName, supporterName, amount, message, confirmed, dashboardUrl } =
    opts;
  const who = supporterName || "ผู้ไม่ประสงค์ออกนาม";
  const statusTh = confirmed
    ? "ยืนยันอัตโนมัติแล้ว"
    : "รอคุณยืนยันสลิป";
  const subject = `ได้รับทิป ${amount} จาก ${who}`;
  const lines = [
    `สวัสดี ${creatorName},`,
    ``,
    `คุณได้รับทิปใหม่ ${amount} จาก ${who}`,
    message ? `ข้อความ: "${message}"` : ``,
    `สถานะ: ${statusTh}`,
    ``,
    `ดูรายละเอียดในแดชบอร์ด: ${dashboardUrl}`,
  ].filter(Boolean);
  const html = `
    <p>สวัสดี ${esc(creatorName)},</p>
    <p>คุณได้รับทิปใหม่ <strong>${esc(amount)}</strong> จาก <strong>${esc(who)}</strong></p>
    ${message ? `<p>ข้อความ: “${esc(message)}”</p>` : ""}
    <p>สถานะ: ${statusTh}</p>
    <p><a href="${dashboardUrl}">เปิดแดชบอร์ด</a></p>`;
  await sendEmail({
    to,
    subject,
    text: lines.join("\n"),
    html,
    devLabel: "Tip notification",
  });
}

/**
 * One-time "you're stuck here" reminder, sent by the admin from the
 * activation table. Thai only (creators are Thai), one call to action, and
 * an explicit invitation to reply — the reply is the point.
 */
export async function sendActivationNudgeEmail(opts: {
  to: string;
  displayName: string;
  template: "NO_PROMPTPAY" | "NO_OVERLAY";
}): Promise<void> {
  const { to, displayName, template } = opts;
  const name = displayName.trim() || "ครีเอเตอร์";
  const subject = "ติดตรงไหนบอกเราได้นะ — TipTang";

  const SETTINGS = "https://tiptang.com/th/dashboard/settings";
  const OVERLAY = "https://tiptang.com/th/dashboard/overlay";
  // Each template: an intro paragraph, then one link per remaining step.
  const body =
    template === "NO_PROMPTPAY"
      ? {
          intro: `สวัสดี ${name} เห็นว่าสมัคร TipTang ไว้แล้ว แต่ยังไม่ได้ใส่พร้อมเพย์ — เหลืออีกแค่ 2 ขั้นก็รับทิปได้แล้ว: 1) ใส่เบอร์โทรหรือเลขบัตรพร้อมเพย์ในหน้าตั้งค่า เงินจะเข้าบัญชีคุณตรง ๆ 2) เอา URL overlay ไปใส่ใน OBS แล้วทิปจะเด้งบนจอไลฟ์ ทั้งหมดใช้เวลาไม่เกิน 5 นาที`,
          links: [
            { label: "ขั้นที่ 1 — ใส่พร้อมเพย์", url: SETTINGS },
            { label: "ขั้นที่ 2 — ตั้ง overlay ใน OBS", url: OVERLAY },
          ],
        }
      : {
          intro: `สวัสดี ${name} พร้อมเพย์เรียบร้อยแล้ว เหลือแค่เอา URL overlay ไปใส่ใน OBS ใช้เวลาแค่ 1 นาที แล้วทิปจะเด้งบนจอไลฟ์ได้เลย`,
          links: [{ label: "ดูวิธีตั้ง OBS", url: OVERLAY }],
        };
  const outro = "ถ้าติดตรงไหน ตอบเมลนี้บอกได้เลย เราอ่านทุกฉบับ";

  await sendEmail({
    to,
    subject,
    text: [
      body.intro,
      ...body.links.map((l) => `${l.label}: ${l.url}`),
      outro,
    ].join("\n\n"),
    html: [
      `<p>${esc(body.intro)}</p>`,
      ...body.links.map((l) => `<p><a href="${l.url}">${esc(l.label)}</a></p>`),
      `<p>${esc(outro)}</p>`,
    ].join(""),
    devLabel: `Activation nudge (${template})`,
  });
}
