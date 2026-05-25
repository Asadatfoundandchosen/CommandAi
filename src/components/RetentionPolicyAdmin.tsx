import { useCallback, useEffect, useState } from 'react';
import { Archive, RefreshCw, Shield } from 'lucide-react';

type RetentionPolicy = {
  org_id: string;
  audit_retention_days: number;
  archive_before_delete: boolean;
  archive_location: string;
  is_default: boolean;
  min_retention_days: number;
  max_retention_days: number;
  updated_at: string | null;
};

type ComplianceReport = {
  compliance_status: 'compliant' | 'action_required';
  cutoff: string;
  counts: {
    within_retention: number;
    past_cutoff: number;
    archived_total: number;
  };
  notes: string[];
  last_run: {
    status: string;
    archived_count: number;
    deleted_mongo_count: number;
  } | null;
};

const DAYS_PER_YEAR = 365;
const DEFAULT_RETENTION_YEARS = 3;

/**
 * Org admin audit retention policy — `GET/PUT /api/v1/organization/retention-policy`.
 * Compliance summary from `GET …/retention-policy/compliance-report`.
 * Mount at `/settings/compliance/retention` for org_admin users.
 */
export function RetentionPolicyAdmin() {
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [retentionDays, setRetentionDays] = useState(365 * DEFAULT_RETENTION_YEARS);
  const [archiveBeforeDelete, setArchiveBeforeDelete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [policyRes, reportRes] = await Promise.all([
        fetch('/api/v1/organization/retention-policy', { credentials: 'include' }),
        fetch('/api/v1/organization/retention-policy/compliance-report', {
          credentials: 'include',
        }),
      ]);
      if (!policyRes.ok) {
        throw new Error(`Failed to load policy (${policyRes.status})`);
      }
      const policyJson = (await policyRes.json()) as { data: RetentionPolicy };
      setPolicy(policyJson.data);
      setRetentionDays(policyJson.data.audit_retention_days);
      setArchiveBeforeDelete(policyJson.data.archive_before_delete);

      if (reportRes.ok) {
        const reportJson = (await reportRes.json()) as { data: ComplianceReport };
        setReport(reportJson.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/v1/organization/retention-policy', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audit_retention_days: retentionDays,
          archive_before_delete: archiveBeforeDelete,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const json = (await res.json()) as { data: RetentionPolicy };
      setPolicy(json.data);
      setSaved(true);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-shell-muted text-sm">Loading retention policy…</div>
    );
  }

  const minDays = policy?.min_retention_days ?? DAYS_PER_YEAR;
  const maxDays = policy?.max_retention_days ?? DAYS_PER_YEAR * 10;
  const yearsApprox = (retentionDays / DAYS_PER_YEAR).toFixed(1);

  return (
    <div className="max-w-xl space-y-6 rounded-xl border border-shell-border bg-shell-surface p-6">
      <div className="flex items-center gap-3">
        <Archive className="h-6 w-6 text-shell-accent" />
        <div>
          <h2 className="text-lg font-semibold text-shell-fg">Audit log retention</h2>
          <p className="text-sm text-shell-muted">
            Per-organization retention for regulatory compliance. Minimum 1 year; archives to S3
            Glacier before delete when enabled.
          </p>
        </div>
      </div>

      {policy?.is_default && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Using platform default ({DEFAULT_RETENTION_YEARS} years, archive before delete).
        </div>
      )}

      {report && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            report.compliance_status === 'compliant'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            <Shield className="h-4 w-4" />
            Compliance: {report.compliance_status === 'compliant' ? 'Compliant' : 'Action required'}
          </div>
          <p className="mt-2 text-shell-muted">
            {report.counts.within_retention} logs within retention ·{' '}
            {report.counts.past_cutoff} past cutoff · {report.counts.archived_total} archived
            total
          </p>
          {report.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-shell-muted">
              {report.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="text-sm text-emerald-400">Retention policy saved.</p>}

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-shell-muted" htmlFor="retention-days">
            Retention period (days)
          </label>
          <input
            id="retention-days"
            type="number"
            min={minDays}
            max={maxDays}
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            className="w-full rounded-lg border border-shell-border bg-shell-bg px-3 py-2 text-sm"
          />
          <p className="text-xs text-shell-muted">
            ≈ {yearsApprox} years · min {minDays} · max {maxDays}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-shell-fg">
          <input
            type="checkbox"
            checked={archiveBeforeDelete}
            onChange={(e) => setArchiveBeforeDelete(e.target.checked)}
            className="rounded border-shell-border"
          />
          Archive to S3 (Glacier) before deleting expired logs
        </label>

        {policy?.archive_location && (
          <p className="text-xs text-shell-muted">
            Archive location: <code>{policy.archive_location}</code>
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-shell-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
        {saving ? 'Saving…' : 'Save policy'}
      </button>
    </div>
  );
}
