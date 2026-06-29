export interface DailyUsage {
  day: string;
  traceCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface DashboardV2 {
  series: {
    labels: string[];
    cost: number[];
    reqs: number[];
    p50: number[];
    p95: number[];
    p99: number[];
    errs: number[];
    split: Array<{ anthropic: number; openai: number; "vercel-ai": number }>;
  };
  kpis: {
    spend: number; spendDelta: number; spendSpark: number[];
    requests: number; requestsDelta: number; requestsSpark: number[];
    p50: number; p50Delta: number;
    p95: number; p95Delta: number; latencySpark: number[];
    errorRate: number; errorSpark: number[];
    cacheHit: number; cacheSpark: number[];
  };
  providers: Array<{ id: string; label: string; requests: number; cost: number; avgLat: number; errRate: number }>;
  models: Array<{ model: string; provider: string; requests: number; tokensK: number; p95: number; cost: number }>;
  daily: DailyUsage[];
  totals: { traceCount: number; inputTokens: number; outputTokens: number; costUsd: number; avgDurationMs: number };
}

export function useDashboard() {
  const { apiFetch } = useApiFetch();
  const stats = ref<DashboardV2 | null>(null);
  const range = ref("24h");
  const { pending, error, run } = useRequest();

  async function fetchStats() {
    await run(async () => {
      stats.value = await apiFetch<DashboardV2>(`/orgs/me/stats?range=${range.value}`);
    });
  }

  watch(range, fetchStats);

  const daily30 = computed<DailyUsage[]>(() => {
    if (!stats.value) return [];
    const days: DailyUsage[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = stats.value.daily.find((x) => x.day === key);
      days.push(found ?? { day: key, traceCount: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    }
    return days;
  });

  return { stats, range, pending, error, fetchStats, daily30 };
}
