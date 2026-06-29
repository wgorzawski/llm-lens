import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env["SMTP_HOST"];
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env["SMTP_PORT"] ?? "587"),
    secure: process.env["SMTP_SECURE"] === "true",
    auth: process.env["SMTP_USER"]
      ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] ?? "" }
      : undefined,
  });
}

const FROM = process.env["SMTP_FROM"] ?? "LLM Lens <noreply@llmlens.dev>";

export async function sendSigninAlert(to: string, ip: string, userAgent: string): Promise<void> {
  const transport = getTransport();
  if (!transport) return;
  await transport.sendMail({
    from: FROM,
    to,
    subject: "New sign-in to your LLM Lens account",
    text: [
      `A new sign-in to your account was detected.`,
      `IP: ${ip}`,
      `Device: ${userAgent}`,
      `If this wasn't you, change your password immediately.`,
    ].join("\n\n"),
  });
}
