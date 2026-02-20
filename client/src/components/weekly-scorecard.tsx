import { useQuery } from "@tanstack/react-query";
import type { PerformanceSummary } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dumbbell, UtensilsCrossed,
  TrendingUp, TrendingDown, Minus, Activity,
} from "lucide-react";
import { format } from "date-fns";
import { useWeeklyAdherence } from "@/hooks/use-completions";

interface WeeklyScorecardProps {
  weekStart: Date;
  weekEnd: Date;
  weekStartStr: string;
  weekEndStr: string;
  enabled?: boolean;
}

export function WeeklyScorecard({ weekStart, weekEnd, weekStartStr, weekEndStr, enabled = true }: WeeklyScorecardProps) {
  const { data: weeklyAdherence, isLoading: adherenceLoading } = useWeeklyAdherence(weekStartStr, weekEndStr, enabled);

  const { data: perfSummaries } = useQuery<PerformanceSummary[]>({
    queryKey: ["/api/performance"],
    enabled,
  });

  if (adherenceLoading) {
    return (
      <Card className="mb-6 overflow-hidden" data-testid="card-performance-scorecard-loading">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row">
            <div className="flex items-center justify-center p-6 sm:p-8 sm:border-r border-b sm:border-b-0">
              <Skeleton className="w-28 h-28 sm:w-32 sm:h-32 rounded-full" />
            </div>
            <div className="flex-1 p-5 sm:p-6 space-y-3">
              <Skeleton className="h-4 w-32" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!weeklyAdherence) {
    return null;
  }

  const score = weeklyAdherence.overallScore ?? 0;
  const mealPct = weeklyAdherence.mealPct;
  const workoutPct = weeklyAdherence.workoutPct;

  const latestPerf = perfSummaries?.[0] ?? null;
  const insights = (latestPerf?.insights || []) as string[];

  const momentumConfig: Record<string, { label: string; color: string; bg: string; icon: typeof TrendingUp }> = {
    building: { label: "Building", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: TrendingUp },
    maintaining: { label: "Steady", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", icon: Minus },
    fatigue_risk: { label: "Fatigue Risk", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", icon: Activity },
    slipping: { label: "Needs Attention", color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", icon: TrendingDown },
  };
  const momentum = latestPerf ? (momentumConfig[latestPerf.momentumState] || momentumConfig.maintaining) : null;
  const MomentumIcon = momentum?.icon ?? Activity;

  const scoreColor = score >= 80 ? "text-emerald-600 dark:text-emerald-400" :
    score >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const ringColor = score >= 80 ? "stroke-emerald-500" :
    score >= 60 ? "stroke-amber-500" : "stroke-red-500";
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <Card className="mb-6 overflow-hidden" data-testid="card-performance-scorecard">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex items-center justify-center p-6 sm:p-8 sm:border-r border-b sm:border-b-0">
            <div className="relative w-28 h-28 sm:w-32 sm:h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" className="stroke-muted" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  className={`${ringColor} transition-all duration-1000 ease-out`}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl sm:text-4xl font-bold tabular-nums ${scoreColor}`} data-testid="text-adherence-score">
                  {score}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</span>
              </div>
            </div>
          </div>

          <div className="flex-1 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">This Week</div>
                <div className="text-sm text-muted-foreground">
                  {format(weekStart, "MMM d")} — {format(weekEnd, "MMM d")}
                </div>
              </div>
              {momentum && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${momentum.bg}`} data-testid="badge-momentum">
                  <MomentumIcon className={`h-3.5 w-3.5 ${momentum.color}`} />
                  <span className={`text-xs font-medium ${momentum.color}`}>{momentum.label}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <UtensilsCrossed className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs text-muted-foreground">Meals</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400" data-testid="text-meal-adherence">
                    {mealPct != null ? `${mealPct}%` : "—"}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${mealPct ?? 0}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {weeklyAdherence.completedMeals}/{weeklyAdherence.scheduledMeals} completed
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Dumbbell className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    <span className="text-xs text-muted-foreground">Workouts</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-teal-600 dark:text-teal-400" data-testid="text-workout-adherence">
                    {workoutPct != null ? `${workoutPct}%` : "—"}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${workoutPct ?? 0}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {weeklyAdherence.completedWorkouts}/{weeklyAdherence.scheduledWorkouts} completed
                </div>
              </div>
            </div>

            {insights.length > 0 && (
              <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2" data-testid="text-performance-insight">
                {insights[0]}
              </div>
            )}

            {!insights.length && latestPerf?.adjustmentStatement && (
              <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2" data-testid="text-adjustment-statement">
                {latestPerf.adjustmentStatement}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
