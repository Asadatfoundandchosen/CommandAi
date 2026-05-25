# Security / platform admin — key lifecycle and rotation.
path "transit/keys/*" {
  capabilities = ["create", "read", "update", "list"]
}

path "transit/keys/app-field-encryption/rotate" {
  capabilities = ["update"]
}

path "transit/keys/app-field-encryption/config" {
  capabilities = ["read", "update"]
}

path "transit/keys/app-search-index/rotate" {
  capabilities = ["update"]
}

path "secret/data/platform/*/encryption" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Audit: read-only on sys paths (optional break-glass)
path "sys/audit" {
  capabilities = ["read", "list"]
}
