export interface AnalyticsStats {
  totalViews: number;
  uniqueVisitors: number;
  live: number;
  series: { labels: string[]; views: number[] };
}

export function useAnalytics(range: Ref<string>) {
  const { apiFetch } = useApiFetch();
  const stats = ref<AnalyticsStats | null>(null);
  const { pending, error, run } = useRequest();

  async function fetchStats() {
    await run(async () => {
      stats.value = await apiFetch<AnalyticsStats>(`/analytics/stats?range=${range.value}`);
    });
  }

  watch(range, fetchStats);

  return { stats, pending, error, fetchStats };
}
