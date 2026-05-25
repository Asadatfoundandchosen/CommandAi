import { config } from "@config/index.js";

export type CreditAlertEmailInput = {
  to: string;
  orgName: string;
  level: string;
  percentRemaining: number;
  balance: number;
  allocationBaseline: number;
  message: string;
};

/** Sends low-balance alert email via SendGrid HTTP API when configured. */
export async function sendCreditAlertEmail(
  input: CreditAlertEmailInput,
): Promise<boolean> {
  const apiKey = config.sendgrid?.apiKey;
  const from = config.sendgrid?.fromEmail;
  if (!apiKey || !from) {
    process.stdout.write(
      "[credit-alert] SendGrid not configured — skip email (set SENDGRID_API_KEY, SENDGRID_FROM_EMAIL)\n",
    );
    return false;
  }

  const subject = `[1CommandAI] Credit alert: ${input.percentRemaining.toFixed(1)}% remaining`;
  const body = [
    `Organization: ${input.orgName}`,
    `Alert level: ${input.level}`,
    "",
    input.message,
    "",
    `Balance: ${input.balance.toLocaleString()} credits`,
    `Allocation baseline: ${input.allocationBaseline.toLocaleString()} credits`,
    `Remaining: ${input.percentRemaining.toFixed(1)}%`,
  ].join("\n");

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
      content: [{ type: "text/plain", value: body }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    process.stderr.write(
      `[credit-alert] SendGrid failed status=${res.status} body=${text.slice(0, 200)}\n`,
    );
    return false;
  }

  process.stdout.write(`[credit-alert] email sent to=${input.to} level=${input.level}\n`);
  return true;
}
