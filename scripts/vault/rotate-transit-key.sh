#!/usr/bin/env bash
# Rotate Vault transit key material (keeps decrypt for old versions via min_decryption_version).
set -euo pipefail

: "${VAULT_ADDR:?Set VAULT_ADDR}"
: "${VAULT_TOKEN:?Set VAULT_TOKEN (admin-transit policy)}"

KEY_NAME="${1:-app-field-encryption}"

echo "Rotating transit key: ${KEY_NAME}"
vault write -f "transit/keys/${KEY_NAME}/rotate"

CURRENT=$(vault read -field=latest_version "transit/keys/${KEY_NAME}")
echo "Latest version: ${CURRENT}"
echo "Ensure min_decryption_version allows prior versions for in-flight ciphertext."
