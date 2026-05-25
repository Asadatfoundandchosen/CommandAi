import { Counter, type Registry } from "prom-client";

let mismatchCounter: Counter | undefined;

export function registerAuditIntegrityMetrics(register: Registry): void {
  if (!mismatchCounter) {
    mismatchCounter = new Counter({
      name: "audit_checksum_mismatch_total",
      help: "Audit log checksum verification failures (possible tampering).",
      labelNames: ["source"],
      registers: [register],
    });
  }
}

export function recordAuditChecksumMismatch(source: "mongodb" | "opensearch"): void {
  mismatchCounter?.labels(source).inc();
}
