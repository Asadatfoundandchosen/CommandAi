#!/usr/bin/env bash
# =============================================================================
# Create a MongoDB Atlas point-in-time restore (PITR) job (Admin API v2).
# Requires: curl, python3
#
# API key must have Project Backup Manager / Recovery Operator (or higher).
# PITR instant must fall inside the cluster’s PITR window (IaC default: 7 days).
# Target cluster name must be **new** and unique in the target project.
#
#   export ATLAS_PUBLIC_KEY=...
#   export ATLAS_PRIVATE_KEY=...
#   export ATLAS_GROUP_ID=<24-hex project id>
#   export ATLAS_SOURCE_CLUSTER=app-main
#   export ATLAS_TARGET_CLUSTER=app-restored-pitr-20250115
#   export PITR_UTC=2025-12-15T14:32:00Z
#   # or: export PITR_UNIX_SECONDS=1734273120
#
#   ./scripts/restore-mongodb.sh [--wait]
#
# --wait  poll until the job has finishedAt or failed/cancelled.
# =============================================================================
set -euo pipefail

ATLAS_BASE_URL="${ATLAS_BASE_URL:-https://cloud.mongodb.com}"
API_VERSION_HEADER="application/vnd.atlas.2023-11-15+json"
WAIT=0
if [[ " $* " == *" --wait "* ]]; then
  WAIT=1
fi

: "${ATLAS_PUBLIC_KEY:?Set ATLAS_PUBLIC_KEY}"
: "${ATLAS_PRIVATE_KEY:?Set ATLAS_PRIVATE_KEY}"
: "${ATLAS_GROUP_ID:?Set ATLAS_GROUP_ID}"
: "${ATLAS_SOURCE_CLUSTER:?Set ATLAS_SOURCE_CLUSTER}"
: "${ATLAS_TARGET_CLUSTER:?Set ATLAS_TARGET_CLUSTER}"

if [[ -n "${PITR_UNIX_SECONDS:-}" ]]; then
  SECONDS_TS="${PITR_UNIX_SECONDS}"
elif [[ -n "${PITR_UTC:-}" ]]; then
  SECONDS_TS="$(PITR_UTC="${PITR_UTC}" python3 -c 'import os, datetime
s = os.environ["PITR_UTC"].strip()
if s.endswith("Z"):
  s = s[:-1] + "+00:00"
dt = datetime.datetime.fromisoformat(s)
if dt.tzinfo is None:
  dt = dt.replace(tzinfo=datetime.timezone.utc)
print(int(dt.timestamp()))')"
else
  echo "Set PITR_UTC (ISO-8601 UTC) or PITR_UNIX_SECONDS" >&2
  exit 1
fi

PAYLOAD="$(
  ATLAS_TARGET_CLUSTER="$ATLAS_TARGET_CLUSTER" \
  ATLAS_GROUP_ID="$ATLAS_GROUP_ID" \
  SECONDS_TS="$SECONDS_TS" \
  python3 -c 'import json,os; print(json.dumps({
    "deliveryType": "pointInTime",
    "targetClusterName": os.environ["ATLAS_TARGET_CLUSTER"],
    "targetGroupId": os.environ["ATLAS_GROUP_ID"],
    "pointInTimeUTCSeconds": int(os.environ["SECONDS_TS"]),
  }))'
)"

URL="${ATLAS_BASE_URL}/api/atlas/v2/groups/${ATLAS_GROUP_ID}/clusters/${ATLAS_SOURCE_CLUSTER}/backup/restoreJobs"

echo "POST $URL" >&2
echo "PITR UTC seconds (epoch): $SECONDS_TS" >&2

RESP_FILE="$(mktemp)"
HTTP_CODE="$(
  curl -sS -o "$RESP_FILE" -w "%{http_code}" --digest \
    -u "${ATLAS_PUBLIC_KEY}:${ATLAS_PRIVATE_KEY}" \
    -H "Accept: ${API_VERSION_HEADER}" \
    -H "Content-Type: ${API_VERSION_HEADER}" \
    -X POST "$URL" \
    -d "$PAYLOAD"
)"

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  echo "Atlas API error HTTP $HTTP_CODE" >&2
  cat "$RESP_FILE" >&2
  rm -f "$RESP_FILE"
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  cat "$RESP_FILE" | jq .
  JOB_ID="$(cat "$RESP_FILE" | jq -r '.id // empty')"
else
  cat "$RESP_FILE"
  JOB_ID=""
fi
rm -f "$RESP_FILE"

if [[ -z "$JOB_ID" ]]; then
  echo "Could not read job id from response; see JSON above for id" >&2
  exit 0
fi

echo "Restore job id: $JOB_ID" >&2

POLL_URL="${ATLAS_BASE_URL}/api/atlas/v2/groups/${ATLAS_GROUP_ID}/clusters/${ATLAS_SOURCE_CLUSTER}/backup/restoreJobs/${JOB_ID}"
if [[ "$WAIT" -ne 1 ]]; then
  echo "GET $POLL_URL" >&2
  echo "Re-run with --wait to block until complete (often 15–30+ minutes)." >&2
  exit 0
fi

while true; do
  R2="$(mktemp)"
  if ! curl -sS -o "$R2" --digest -u "${ATLAS_PUBLIC_KEY}:${ATLAS_PRIVATE_KEY}" \
    -H "Accept: ${API_VERSION_HEADER}" \
    -X GET "$POLL_URL"
  then
    echo "poll failed, retry in 30s" >&2
    rm -f "$R2"
    sleep 30
    continue
  fi
  if command -v jq >/dev/null 2>&1; then
    if [[ "$(jq -r '.failed // false' "$R2")" == "true" ]]; then
      echo "Restore job failed" >&2
      jq . "$R2" >&2
      rm -f "$R2"
      exit 1
    fi
    if [[ "$(jq -r '.cancelled // false' "$R2")" == "true" ]]; then
      echo "Restore job cancelled" >&2
      rm -f "$R2"
      exit 1
    fi
    if [[ "$(jq -r 'if .finishedAt then "yes" else "no" end' "$R2")" == "yes" ]]; then
      echo "Restore job finished."
      jq . "$R2"
      rm -f "$R2"
      exit 0
    fi
  else
    cat "$R2"
  fi
  rm -f "$R2"
  echo "… waiting 30s" >&2
  sleep 30
done
