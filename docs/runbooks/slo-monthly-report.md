# Monthly SLO report (automation)

## What gets emailed

The workflow **`slo-monthly-report`** runs **`scripts/slo-monthly-report.sh`**, which queries Prometheus for:

- 30d availability SLI (`slo:platform_api:request_success_ratio:30d`)
- 30d latency SLI (`slo:platform_api:latency_under_200ms_ratio:30d`)
- Error ratio (`slo:platform_api:error_ratio:30d`)
- Error budget consumed (availability + latency)

Output is a Markdown summary suitable for leadership / postmortem archives.

## Setup

1. **Prometheus** reachable from GitHub Actions: expose a read-only URL (VPN, reverse proxy, or internal runner with network access).
2. Repository **secrets**:
   - `PROMETHEUS_URL` — base URL, e.g. `https://prometheus.example.com` (no trailing slash).
   - Optional: `PROMETHEUS_BEARER_TOKEN` if auth is required (export in script if you extend it).
3. **Email**: configure **`SLO_REPORT_SMTP_*`** secrets and recipients (see workflow). For **SendGrid / SES / Office365**, use SMTP or replace the email step with **send-mail** action that matches your provider.

## Manual run

**Actions** → **SLO monthly report** → **Run workflow**.

## Grafana alternative

Use **Grafana Reporting** (Enterprise) or **scheduled dashboard PDF** if you prefer visuals over raw PromQL in email.
