import "server-only";
import nodemailer from "nodemailer";

/**
 * Send a password-reset email.
 * Provider precedence: SMTP (e.g. Gmail) -> Resend -> dev console fallback.
 * With no provider configured the link is logged to the server console so the
 * flow is still testable in development.
 */
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
  const text = `${intro}\n\n${link}`;
  const html = `<p>${intro}</p><p><a href="${link}">${link}</a></p>`;

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

  console.log(`[email:dev] Password reset link for ${to}: ${link}`);
}
