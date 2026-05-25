import { config } from "@config/index.js";

export type MagicLinkEmailInput = {
  to: string;
  link: string;
  expiresIn: string;
};

/** Sends passwordless sign-in email via SendGrid when configured. */
export async function sendMagicLinkEmail(input: MagicLinkEmailInput): Promise<boolean> {
  const apiKey = config.sendgrid?.apiKey;
  const from = config.sendgrid?.fromEmail;
  if (!apiKey || !from) {
    process.stdout.write(
      "[magic-link] SendGrid not configured — skip email (set SENDGRID_API_KEY, SENDGRID_FROM_EMAIL)\n",
    );
    return false;
  }

  const subject = "Sign in to 1CommandAI";
  const text = [
    "Use the link below to sign in to 1CommandAI.",
    "",
    input.link,
    "",
    `This link expires in ${input.expiresIn} and can only be used once.`,
    "",
    "If you did not request this email, you can ignore it.",
  ].join("\n");

  const html = [
    "<p>Use the link below to sign in to 1CommandAI.</p>",
    `<p><a href="${input.link}">Sign in</a></p>`,
    `<p>This link expires in ${input.expiresIn} and can only be used once.</p>`,
    "<p>If you did not request this email, you can ignore it.</p>",
  ].join("");

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: from },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    process.stderr.write(
      `[magic-link] SendGrid failed status=${res.status} body=${body.slice(0, 200)}\n`,
    );
    return false;
  }

  return true;
}
