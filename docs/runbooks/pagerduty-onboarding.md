# PagerDuty onboarding (P1)

Use PagerDuty for **P1** only; **P2/P3** stay in Slack per platform policy.

## 1. Create a service

1. **Services** → **Service Directory** → **New Service**.
2. Name e.g. `1CommandAI Platform`, description links to this repo and Grafana.
3. **Integration**: **Events API v2** — copy the **Integration Key** (routing key) into Kubernetes Secret `pagerduty_routing_key` (see `infrastructure/k8s/monitoring/secrets/alertmanager-external-secrets.example.yaml`).

## 2. Escalation policy

1. **People** → **Escalation Policies** → **New Escalation Policy**.
2. Name e.g. `Platform P1`.
3. Add **escalation rules**: first tier (primary on-call), second tier (manager/backup) after **5 minutes** if unacknowledged (story acceptance: escalation after **5m** — tune in PagerDuty, not in Alertmanager `group_interval`).
4. Attach the policy to the **service** created above.

## 3. On-call schedule

1. **People** → **Schedules** → **New Schedule** (e.g. `Platform Primary`).
2. Add rotation members and handoff (daily/weekly as agreed).
3. Link the schedule to the **escalation policy** as the first tier.

## 4. Slack for P2/P3

Create an Incoming Webhook (or Slack app) and store the webhook URL in the same Secret as `slack_api_url`. Do not commit real URLs or keys.

## 5. Verify (acceptance: test alert → notification)

1. **PagerDuty (P1):** open the service **Integrations** tab → **Send test event** (Events API v2). Confirm an incident is created and the **current on-call** is notified (push/email/SMS per user profile).
2. **Slack (P2/P3):** from Prometheus/Alertmanager UI, **Silence** nothing; instead use a **short-lived** `PrometheusRule` or `amtool` to post a test notification, or temporarily fire a known P3 rule in a sandbox. Alternatively, use Alertmanager **API** `POST /api/v1/alerts` with payload including `labels: { severity: p2 }` and `annotations: { summary, description }` so the route hits `slack-p2-p3`.
3. **Escalation (5 min):** create a **non-prod** test incident, do **not** acknowledge, wait **5 minutes**, confirm the **second tier** in the escalation policy is notified.
4. **Runbook links:** confirm the Slack message and PagerDuty incident body include the **Runbook:** line (templates in `alertmanager-routing.example.yaml` read `runbook_url` from rule annotations).
5. **On-call schedule visible:** in PagerDuty, **People → Schedules** → open **Platform Primary** (or your schedule); confirm rotation and **who is on call now** are visible to your team.
