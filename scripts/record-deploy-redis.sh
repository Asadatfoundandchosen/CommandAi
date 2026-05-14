#!/usr/bin/env bash
# Append one JSON record per deployment to Redis list deploy:history:<env> (requires REDIS_URL).
set -euo pipefail
export DEPLOY_ENV="${1:?environment arg required (dev|staging|prod)}"
[ -n "${REDIS_URL:-}" ] || exit 0
PAYLOAD="$(python3 <<'PY'
import json, os, datetime
e = os.environ["DEPLOY_ENV"]
print(json.dumps({
  "sha": os.environ.get("GITHUB_SHA", ""),
  "env": e,
  "time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "actor": os.environ.get("GITHUB_ACTOR", ""),
  "run_id": os.environ.get("GITHUB_RUN_ID", ""),
  "workflow": os.environ.get("GITHUB_WORKFLOW", ""),
}))
PY
)"
printf '%s' "$PAYLOAD" | docker run -i --rm -e REDIS_URL -e DEPLOY_ENV redis:7-alpine sh -c \
  'read -r PAYLOAD && redis-cli -u "$REDIS_URL" LPUSH "deploy:history:${DEPLOY_ENV}" "$PAYLOAD"'
