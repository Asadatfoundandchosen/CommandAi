#!/usr/bin/env bash
# Generate a new FIELD_ENCRYPTION_KEY, store in Vault KV, and document re-encryption steps.
# Does NOT automatically re-encrypt MongoDB — run migration job after deploy.
set -euo pipefail

: "${VAULT_ADDR:?Set VAULT_ADDR}"
: "${VAULT_TOKEN:?Set VAULT_TOKEN (admin)}"

ENV="${1:-prod}"
KV_PATH="secret/platform/${ENV}/encryption"

NEW_KEY="$(openssl rand -hex 32)"
PREVIOUS_VERSION="$(date -u +%Y%m%dT%H%M%SZ)"

echo "Writing new field_encryption_key to ${KV_PATH} (previous_key_version=${PREVIOUS_VERSION})..."
vault kv patch "${KV_PATH}" \
  field_encryption_key="${NEW_KEY}" \
  previous_key_version="${PREVIOUS_VERSION}" \
  rotated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Next steps:"
echo "  1. Rolling restart platform-api pods (External Secrets refresh)."
echo "  2. Run MongoDB field re-encryption migration (docs/runbooks/key-management.md)."
echo "  3. Archive previous key in Vault: secret/platform/${ENV}/encryption/archive/${PREVIOUS_VERSION}"
