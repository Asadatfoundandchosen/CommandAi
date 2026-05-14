# Runbook: Node memory pressure (>80%)

## Symptoms

- Alert **NodeMemoryPressure** (P3).

## Checks

1. `kubectl top node` and node details; identify memory-heavy pods (`kubectl top pods -A | sort`).
2. Check for memory leaks or missing limits on workloads.
3. Eviction / OOM events: `kubectl get events -A --field-selector reason=OOMKilled`.

## Mitigation

- Cordon/drain problematic node if hardware fault; add nodes if sustained growth.
- Set appropriate **requests/limits**; fix leaks; scale or reschedule heavy pods.
