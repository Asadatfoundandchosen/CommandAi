# Platform API — encrypt/decrypt only (no rotate, no delete).
path "transit/encrypt/app-field-encryption" {
  capabilities = ["update"]
}

path "transit/decrypt/app-field-encryption" {
  capabilities = ["update"]
}

path "transit/keys/app-field-encryption" {
  capabilities = ["read"]
}

# Optional search-index HMAC key
path "transit/hmac/app-search-index" {
  capabilities = ["update"]
}

path "transit/keys/app-search-index" {
  capabilities = ["read"]
}

# Read FIELD_ENCRYPTION_KEY from KV (External Secrets uses this path too)
path "secret/data/platform/*/encryption" {
  capabilities = ["read"]
}
