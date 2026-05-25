import { config } from "@config/index.js";

import { MFA_SETUP_PATH } from "./mfa-policy.constants.js";

export type MfaPolicyReminderEmailInput = {
  to: string;
  orgName: string;
  daysRemaining: number;
  gracePeriodEnd: Date;
  requiredFor: string;
};

/** Sends grace-period MFA setup reminder via SendGrid when configured. */
export async function sendMfaPolicyReminderEmail(
  input: MfaPolicyReminderEmailInput,
): Promise<boolean> {
  const apiKey = config.sendgrid?.apiKey;
  const from = config.sendgrid?.fromEmail;
  if (!apiKey || !from) {
    process.stdout.write(
      "[mfa-policy] SendGrid not configured — skip reminder email\n",
    );
    return false;
  }

  const setupUrl = `${config.appUrl.replace(/\/$/, "")}${MFA_SETUP_PATH}`;
  const endDate = input.gracePeriodEnd.toISOString().slice(0, 10);

  const subject = `[1CommandAI] Set up MFA for ${input.orgName}`;
  const text = [
    `Your organization (${input.orgName}) requires multi-factor authentication.`,
    `Scope: ${input.requiredFor}.`,
    "",
    `You have ${input.daysRemaining} day(s) remaining to enable MFA before access is restricted.`,
    `Deadline: ${endDate} (UTC).`,
    "",
    `Set up MFA: ${setupUrl}`,
  ].join("\n");

  const html = [
    `<p>Your organization (<strong>${input.orgName}</strong>) requires multi-factor authentication.</p>`,
    `<p><strong>${input.daysRemaining}</strong> day(s) left to enable MFA (deadline <strong>${endDate}</strong> UTC).</p>`,
    `<p><a href="${setupUrl}">Set up MFA</a></p>`,
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
      `[mfa-policy] SendGrid reminder failed status=${res.status} body=${body.slice(0, 200)}\n`,
    );
    return false;
  }

  return true;
}
