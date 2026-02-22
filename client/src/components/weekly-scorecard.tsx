import { useQuery } from "@tanstack/react-query";
import type { PerformanceSummary } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dumbbell, UtensilsCrossed,
  TrendingUp, TrendingDown, Minus, Activity,
} from "lucide-react";
import { format, startOfWeek, isSameDay } from "date-fns";
import { useWeeklySummary } from "@/hooks/use-completions";

function getScoreColor(score: number) {
  if (score >= 85) return { text: "text-emerald-600 dark:text-emerald-400", ring: "stroke-emerald-500" };
  if (score >= 70) return { text: "text-lime-600 dark:text-lime-400", ring: "stroke-lime-500" };
  if (score >= 50) return { text: "text-amber-600 dark:text-amber-400", ring: "stroke-amber-500" };
  return { text: "text-red-600 dark:text-red-400", ring: "stroke-red-500" };
}

function getWeekLabel(weekStart: Date, calWeekStartsOn?: 0 | 1): string {
  const now = new Date();
  const weekStartsOn: 0 | 1 = calWeekStartsOn ?? (weekStart.getDay() === 1 ? 1 : 0);
  const currentWeekStart = startOfWeek(now, { weekStartsOn });
  if (isSameDay(weekStart, currentWeekStart)) return "This Week";
  const diffMs = weekStart.getTime() - currentWeekStart.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  if (diffWeeks === -1) return "Last Week";
  if (diffWeeks === 1) return "Next Week";
  return `Week of ${format(weekStart, "MMM d")}`;
}

function getAdaptiveMessage(mealPct: number | null, workoutPct: number | null): string | null {
  const m = mealPct ?? -1;
  const w = workoutPct ?? -1;
  if (m < 0 && w < 0) return null;

  const mVal = m < 0 ? w : m;
  const wVal = w < 0 ? m : w;

  if (mVal < 40 && wVal < 40) {
    return "A lighter week — that's okay. Start with one small win today and build from there.";
  }
  if (m >= 0 && w >= 0 && m < w - 20) {
    return "Your training is on track. Bringing more consistency to your meals will amplify your results.";
  }
  if (m >= 0 && w >= 0 && w < m - 20) {
    return "Nutrition is solid. Prioritizing your next workout session will help keep momentum building.";
  }
  if (mVal >= 80 && wVal >= 80) {
    return "Strong consistency across the board. Stay the course — your structure is paying off.";
  }
  if (mVal >= 40 && wVal >= 40) {
    return "Good foundation this week. Tightening consistency on a few more days will compound your progress.";
  }
  return "Keep showing up. Small, steady steps create lasting results.";
}

interface WeeklyScorecardProps {
  weekStart: Date;
  weekEnd: Date;
  weekStartStr: string;
  weekEndStr: string;
  enabled?: boolean;
}

export function WeeklyScorecard({ weekStart, weekEnd, weekStartStr, weekEndStr, enabled = true }: WeeklyScorecardProps) {
  const { data: weeklySummary, isLoading: summaryLoading } = useWeeklySummary(weekStartStr, enabled);

  const { data: perfSummaries } = useQuery<PerformanceSummary[]>({
    queryKey: ["/api/performance"],
    enabled,
  });

  if (summaryLoading) {
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

  if (!weeklySummary) {
    return null;
  }

  const mealPct = weeklySummary.mealsTotal > 0 ? Math.round((weeklySummary.mealsCompleted / weeklySummary.mealsTotal) * 100) : null;
  const workoutPct = weeklySummary.workoutsTotal > 0 ? Math.round((weeklySummary.workoutsCompleted / weeklySummary.workoutsTotal) * 100) : null;
  const score = weeklySummary.score ?? 0;

  const latestPerf = perfSummaries?.[0] ?? null;

  const momentumConfig: Record<string, { label: string; color: string; bg: string; icon: typeof TrendingUp }> = {
    building: { label: "Building", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: TrendingUp },
    maintaining: { label: "Steady", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", icon: Minus },
    fatigue_risk: { label: "Fatigue Risk", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", icon: Activity },
    slipping: { label: "Needs Attention", color: "text-muted-foreground", bg: "bg-muted", icon: TrendingDown },
  };
  const momentum = latestPerf ? (momentumConfig[latestPerf.momentumState] || momentumConfig.maintaining) : null;
  const MomentumIcon = momentum?.icon ?? Activity;

  const colors = getScoreColor(score);
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (score / 100) * circumference;
  const weekLabel = getWeekLabel(weekStart);
  const adaptiveMsg = getAdaptiveMessage(mealPct, workoutPct);

  const mealBarColor = mealPct != null && mealPct >= 71 ? "bg-emerald-500" : mealPct != null && mealPct >= 41 ? "bg-amber-500" : "bg-muted-foreground/40";
  const workoutBarColor = workoutPct != null && workoutPct >= 71 ? "bg-emerald-500" : workoutPct != null && workoutPct >= 41 ? "bg-amber-500" : "bg-muted-foreground/40";

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
                  className={`${colors.ring} transition-all duration-1000 ease-out`}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl sm:text-4xl font-bold tabular-nums ${colors.text}`} data-testid="text-adherence-score">
                  {score}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</span>
              </div>
            </div>
          </div>

          <div className="flex-1 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5" data-testid="text-week-label">{weekLabel}</div>
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
                <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${mealBarColor} rounded-full transition-all duration-500`} style={{ width: `${Math.max(mealPct ?? 0, 2)}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {weeklySummary.mealsCompleted}/{weeklySummary.mealsTotal} completed
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
                <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${workoutBarColor} rounded-full transition-all duration-500`} style={{ width: `${Math.max(workoutPct ?? 0, 2)}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {weeklySummary.workoutsCompleted}/{weeklySummary.workoutsTotal} completed
                </div>
              </div>
            </div>

            {adaptiveMsg && (
              <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2" data-testid="text-adaptive-message">
                {adaptiveMsg}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
