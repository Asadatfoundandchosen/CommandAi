import { config } from "@config/index.js";

import { AUDIT_EXPORT_DOWNLOAD_LINK_TTL } from "./audit-export.constants.js";

export type AuditExportReadyEmailInput = {
  to: string;
  downloadUrl: string;
  format: "csv" | "json";
  total: number;
};

/** Sends presigned S3 download link for a completed async audit export. */
export async function sendAuditExportReadyEmail(
  input: AuditExportReadyEmailInput,
): Promise<boolean> {
  const apiKey = config.sendgrid?.apiKey;
  const from = config.sendgrid?.fromEmail;
  if (!apiKey || !from) {
    process.stdout.write(
      "[audit-export] SendGrid not configured — skip email (set SENDGRID_API_KEY, SENDGRID_FROM_EMAIL)\n",
    );
    return false;
  }

  const subject = "Your 1CommandAI audit log export is ready";
  const text = [
    "Your audit log export is ready to download.",
    "",
    `Format: ${input.format.toUpperCase()}`,
    `Events: ${String(input.total)}`,
    "",
    input.downloadUrl,
    "",
    `This signed download link expires in ${AUDIT_EXPORT_DOWNLOAD_LINK_TTL}.`,
    "",
    "If you did not request this export, contact your organization administrator.",
  ].join("\n");

  const html = [
    "<p>Your audit log export is ready to download.</p>",
    `<p><strong>Format:</strong> ${input.format.toUpperCase()}<br/>`,
    `<strong>Events:</strong> ${String(input.total)}</p>`,
    `<p><a href="${input.downloadUrl}">Download export</a></p>`,
    `<p>This signed download link expires in ${AUDIT_EXPORT_DOWNLOAD_LINK_TTL}.</p>`,
    "<p>If you did not request this export, contact your organization administrator.</p>",
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
      `[audit-export] SendGrid failed status=${res.status} body=${body.slice(0, 200)}\n`,
    );
    return false;
  }

  return true;
}
