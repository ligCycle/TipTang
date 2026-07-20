import "server-only";
import nodemailer from "nodemailer";

/**
 * Low-level email sender.
 * Provider precedence: SMTP (e.g. Gmail) -> Resend -> dev console fallback.
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
      subject,
      text,
      html,
    });
    return;
  }

  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "TipTang <onboarding@resend.dev>",
        to,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${await res.text()}`);
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
    ? "ยืนยันอัตโนมัติแล้ว ✅"
    : "รอคุณยืนยันสลิป ⏳";
  const subject = `💸 ได้รับทิป ${amount} จาก ${who}`;
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
