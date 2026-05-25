import { useMemo } from 'react';
import { AlertTriangle, Gauge, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PERFORMANCE_BUDGETS } from '@/utils/performance';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearWebVitals, type WebVitalName, type WebVitalSample } from '@/store/slices/webVitalsSlice';

const CORE_METRICS: WebVitalName[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

function formatValue(name: WebVitalName, value: number): string {
  if (name === 'CLS') return value.toFixed(3);
  return `${Math.round(value)} ms`;
}

function formatBudget(name: WebVitalName): string {
  const key = name === 'INP' ? 'INP' : name;
  const budget = PERFORMANCE_BUDGETS[key as keyof typeof PERFORMANCE_BUDGETS];
  if (budget === undefined) return '—';
  if (name === 'CLS') return `< ${budget}`;
  return `< ${budget} ms`;
}

function ratingVariant(rating: WebVitalSample['rating']): 'default' | 'secondary' | 'destructive' {
  if (rating === 'good') return 'default';
  if (rating === 'needs-improvement') return 'secondary';
  return 'destructive';
}

function MetricCard({ sample, budgetLabel }: { sample?: WebVitalSample; budgetLabel: string }) {
  if (!sample) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Collecting…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-muted-foreground">—</p>
          <p className="text-xs text-muted-foreground mt-1">Budget {budgetLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={sample.budgetExceeded ? 'border-destructive/60' : undefined}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{sample.name}</CardTitle>
        <Badge variant={ratingVariant(sample.rating)}>{sample.rating}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">
          {formatValue(sample.name, sample.value)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Budget {budgetLabel}
          {sample.budgetExceeded && (
            <span className="text-destructive font-medium"> · exceeded</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Session Web Vitals dashboard — LCP, INP (FID successor), CLS, FCP, TTFB vs budgets.
 */
export function PerformanceDashboard() {
  const dispatch = useAppDispatch();
  const { latest, history, violations } = useAppSelector((s) => s.webVitals);

  const budgetSummary = useMemo(
    () =>
      CORE_METRICS.map((name) => ({
        name,
        budget: formatBudget(name),
        sample: latest[name],
      })),
    [latest],
  );

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Gauge className="h-7 w-7 text-primary" aria-hidden />
            Web Vitals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Core Web Vitals for this browser session. INP replaces deprecated FID; budgets:
            LCP &lt; 2.5s, INP &lt; 100ms, CLS &lt; 0.1.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => dispatch(clearWebVitals())}
        >
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
          Reset session
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {budgetSummary.map(({ name, budget, sample }) => (
          <MetricCard key={name} sample={sample} budgetLabel={budget} />
        ))}
      </div>

      {violations.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              Budget violations
            </CardTitle>
            <CardDescription>
              Metrics that exceeded configured budgets or were rated poor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {violations.slice(0, 10).map((v) => (
                <li key={v.id} className="flex justify-between gap-4 tabular-nums">
                  <span>
                    {v.name} — {formatValue(v.name, v.value)}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(v.recordedAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent samples</CardTitle>
          <CardDescription>
            Events reported via <code className="text-xs">analytics.track(&apos;web_vital&apos;)</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Navigate the app to collect metrics. Values appear after each page load or interaction.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2 pr-4">Metric</th>
                  <th className="pb-2 pr-4">Value</th>
                  <th className="pb-2 pr-4">Rating</th>
                  <th className="pb-2 pr-4">Budget</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                    <td className="py-2 pr-4 tabular-nums">{formatValue(row.name, row.value)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={ratingVariant(row.rating)} className="text-xs">
                        {row.rating}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      {row.budgetExceeded ? (
                        <span className="text-destructive font-medium">Exceeded</span>
                      ) : (
                        <span className="text-muted-foreground">OK</span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground tabular-nums">
                      {new Date(row.recordedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
