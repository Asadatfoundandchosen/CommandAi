# Runbook: Node disk space low (>70% full)

## Symptoms

- Alert **NodeDiskSpaceLow** (P3) on a given `instance` / `mountpoint`.

## Checks

1. Large logs, container images, emptyDir, or etcd/data growth on control plane nodes.
2. `df -h` on the node (SSH / SSM) for the reported mount.

## Mitigation

- Prune old images/logs per your retention policy; expand volume or add disk.
- Move write-heavy workloads; ensure log rotation on nodes.
