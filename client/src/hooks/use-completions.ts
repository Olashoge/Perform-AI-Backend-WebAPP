import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ActivityCompletion, ToggleCompletionInput } from "@shared/schema";
import { useCallback, useMemo } from "react";

export function useCompletions(startDate: string, endDate: string, enabled = true) {
  const { data: completions, isLoading } = useQuery<ActivityCompletion[]>({
    queryKey: ["/api/completions", `?start=${startDate}&end=${endDate}`],
    enabled,
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: ToggleCompletionInput) => {
      const res = await apiRequest("POST", "/api/completions/toggle", input);
      return res.json();
    },
    onMutate: async (input) => {
      const queryKey = ["/api/completions", `?start=${startDate}&end=${endDate}`];
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<ActivityCompletion[]>(queryKey);

      queryClient.setQueryData<ActivityCompletion[]>(queryKey, (old = []) => {
        const key = `${input.date}|${input.itemType}|${input.sourceType}|${input.sourceId}|${input.itemKey}`;
        const idx = old.findIndex(c =>
          c.date === input.date &&
          c.itemType === input.itemType &&
          c.sourceType === input.sourceType &&
          c.sourceId === input.sourceId &&
          c.itemKey === input.itemKey
        );
        if (idx >= 0) {
          const updated = [...old];
          updated[idx] = { ...updated[idx], completed: input.completed, completedAt: input.completed ? new Date().toISOString() : null } as ActivityCompletion;
          return updated;
        }
        return [...old, {
          id: `temp-${key}`,
          userId: "",
          date: input.date,
          itemType: input.itemType,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          itemKey: input.itemKey,
          completed: input.completed,
          completedAt: input.completed ? new Date().toISOString() : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as unknown as ActivityCompletion];
      });

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["/api/completions", `?start=${startDate}&end=${endDate}`],
          context.previous
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/completions", `?start=${startDate}&end=${endDate}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/completions/adherence"] });
    },
  });

  const completionMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of completions || []) {
      const key = `${c.date}|${c.itemType}|${c.sourceType}|${c.sourceId}|${c.itemKey}`;
      map.set(key, c.completed);
    }
    return map;
  }, [completions]);

  const isCompleted = useCallback((date: string, itemType: string, sourceType: string, sourceId: string, itemKey: string) => {
    const key = `${date}|${itemType}|${sourceType}|${sourceId}|${itemKey}`;
    return completionMap.get(key) ?? false;
  }, [completionMap]);

  const toggle = useCallback((input: ToggleCompletionInput) => {
    toggleMutation.mutate(input);
  }, [toggleMutation]);

  const getCompletionCounts = useCallback((date: string) => {
    let scheduledMeals = 0, completedMeals = 0, scheduledWorkouts = 0, completedWorkouts = 0;
    for (const c of completions || []) {
      if (c.date !== date) continue;
      if (c.itemType === "meal") {
        scheduledMeals++;
        if (c.completed) completedMeals++;
      } else if (c.itemType === "workout") {
        scheduledWorkouts++;
        if (c.completed) completedWorkouts++;
      }
    }
    return { scheduledMeals, completedMeals, scheduledWorkouts, completedWorkouts };
  }, [completions]);

  return {
    completions: completions || [],
    isLoading,
    isCompleted,
    toggle,
    getCompletionCounts,
    isPending: toggleMutation.isPending,
  };
}

export interface WeeklySummaryData {
  weekStart: string;
  weekEnd: string;
  score: number | null;
  mealsCompleted: number;
  mealsTotal: number;
  workoutsCompleted: number;
  workoutsTotal: number;
}

export function useWeeklySummary(weekStartDate: string, enabled = true) {
  return useQuery<WeeklySummaryData>({
    queryKey: ["/api/weekly-summary", `?weekStart=${weekStartDate}`],
    enabled,
  });
}

export function useWeeklyAdherence(startDate: string, endDate: string, enabled = true) {
  return useQuery<{
    scheduledMeals: number;
    completedMeals: number;
    scheduledWorkouts: number;
    completedWorkouts: number;
    mealPct: number | null;
    workoutPct: number | null;
    overallScore: number | null;
  }>({
    queryKey: ["/api/completions/adherence", `?start=${startDate}&end=${endDate}`],
    enabled,
  });
}

export interface WeekDataDay {
  date: string;
  meals: Array<{ slot: string; meal: any; sourceType: string; sourceId: string }>;
  workouts: Array<{ session: any; sourceType: string; sourceId: string; dayIndex?: number }>;
  completions: any[];
}

export interface WeekData {
  weekStart: string;
  weekEnd: string;
  days: WeekDataDay[];
}

export function useWeekData(weekStartDate: string, enabled = true) {
  return useQuery<WeekData>({
    queryKey: ["/api/week-data", `?weekStart=${weekStartDate}`],
    enabled,
  });
}
