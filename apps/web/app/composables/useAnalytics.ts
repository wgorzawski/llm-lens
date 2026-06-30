export interface DailyViews {
  day: string;
  views: number;
}

export interface AnalyticsStats {
  totalViews: number;
  uniqueVisitors: number;
  live: number;
  series: DailyViews[];
}

export function useAnalytics() {
  const { apiFetch } = useApiFetch();
  const stats = ref<AnalyticsStats | null>(null);
  const days = ref(14);
  const { pending, error, run } = useRequest();

  async function fetchStats() {
    await run(async () => {
      stats.value = await apiFetch<AnalyticsStats>(`/analytics/stats?days=${days.value}`);
    });
  }

  watch(days, fetchStats);

  return { stats, days, pending, error, fetchStats };
}
