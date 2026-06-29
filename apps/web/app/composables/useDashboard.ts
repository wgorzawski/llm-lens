export interface DailyUsage {
  day: string;
  traceCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ModelStats {
  model: string;
  provider: string;
  traceCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  avgDurationMs: number;
}

export interface DashboardStats {
  daily: DailyUsage[];
  byModel: ModelStats[];
  totals: {
    traceCount: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    avgDurationMs: number;
  };
}

export function useDashboard() {
  const { apiFetch } = useApiFetch();
  const stats = ref<DashboardStats | null>(null);
  const { pending, error, run } = useRequest();

  async function fetchStats() {
    await run(async () => {
      stats.value = await apiFetch<DashboardStats>("/orgs/me/stats");
    });
  }

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

  return { stats, pending, error, fetchStats, daily30 };
}
