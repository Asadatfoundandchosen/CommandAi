#!/usr/bin/env bash
# Enable Vault transit engine and create application encryption keys.
# Requires VAULT_ADDR and VAULT_TOKEN (admin).
set -euo pipefail

: "${VAULT_ADDR:?Set VAULT_ADDR}"
: "${VAULT_TOKEN:?Set VAULT_TOKEN}"

echo "Enabling transit secrets engine (idempotent)..."
vault secrets enable -path=transit transit 2>/dev/null || true

echo "Creating app-field-encryption key (AES-256-GCM96)..."
vault write -f transit/keys/app-field-encryption \
  type=aes256-gcm96 \
  exportable=false \
  allow_plaintext_backup=false

vault write transit/keys/app-field-encryption/config \
  min_decryption_version=1

echo "Creating app-search-index key (HMAC, searchable blind index)..."
vault write -f transit/keys/app-search-index \
  type=hmac \
  exportable=false

echo "Applying Vault policies..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vault policy write app-transit "${SCRIPT_DIR}/../../infrastructure/vault/policies/app-transit-policy.hcl"
vault policy write admin-transit "${SCRIPT_DIR}/../../infrastructure/vault/policies/admin-transit-policy.hcl"

echo "Done. Bind app-transit to platform-api Kubernetes auth role."
