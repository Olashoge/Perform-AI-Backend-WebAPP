import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { MealPlan, WorkoutPlan, WeeklyCheckIn, GoalPlan, PlanOutput, WorkoutPlanOutput } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, CalendarDays, TrendingUp, TrendingDown, Minus,
  Dumbbell, UtensilsCrossed, Target, Flame, Trophy, Heart, Zap,
  Activity, CheckCircle2, ClipboardCheck,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, isWithinInterval, parseISO } from "date-fns";

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  performance: "Performance",
  maintenance: "Maintenance",
  energy: "Energy & Focus",
  general_fitness: "General Fitness",
};

const GOAL_ICONS: Record<string, typeof Flame> = {
  weight_loss: Flame,
  muscle_gain: Dumbbell,
  performance: Trophy,
  maintenance: Heart,
  energy: Zap,
  general_fitness: Target,
};

function getWeekRange(date: Date) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return { start, end };
}

function isActivePlan(startDate: string | null | undefined, referenceDate: Date): boolean {
  if (!startDate) return false;
  const planStart = new Date(startDate + "T00:00:00");
  const planEnd = addDays(planStart, 6);
  return isWithinInterval(referenceDate, { start: planStart, end: planEnd });
}

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: mealPlans } = useQuery<MealPlan[]>({
    queryKey: ["/api/plans"],
    enabled: !!user,
  });

  const { data: workoutPlans } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workouts"],
    enabled: !!user,
  });

  const { data: goalPlans } = useQuery<GoalPlan[]>({
    queryKey: ["/api/goal-plans"],
    enabled: !!user,
  });

  const { data: checkIns } = useQuery<WeeklyCheckIn[]>({
    queryKey: ["/api/check-ins", "all"],
    queryFn: async () => {
      const res = await fetch("/api/check-ins", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [isLoading, user, navigate]);

  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekRange(now);

  const stats = useMemo(() => {
    const activeMeals = (mealPlans || []).filter(p => !p.deletedAt && p.status === "ready" && isActivePlan(p.planStartDate, now));
    const activeWorkouts = (workoutPlans || []).filter(p => !p.deletedAt && p.status === "ready" && isActivePlan(p.planStartDate, now));
    const totalMealPlans = (mealPlans || []).filter(p => !p.deletedAt && p.status === "ready").length;
    const totalWorkoutPlans = (workoutPlans || []).filter(p => !p.deletedAt && p.status === "ready").length;
    const totalGoals = (goalPlans || []).length;

    const weekCheckIn = (checkIns || []).find(ci => {
      const ciDate = ci.weekStartDate;
      return ciDate === format(weekStart, "yyyy-MM-dd");
    });

    const recentCheckIns = (checkIns || [])
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
      .slice(0, 4);

    let weightTrend: "up" | "down" | "flat" | null = null;
    if (recentCheckIns.length >= 2) {
      const latest = recentCheckIns[0];
      const prev = recentCheckIns[1];
      if (latest.weightEnd && prev.weightEnd) {
        const diff = latest.weightEnd - prev.weightEnd;
        if (diff > 0.5) weightTrend = "up";
        else if (diff < -0.5) weightTrend = "down";
        else weightTrend = "flat";
      }
    }

    const avgMealCompliance = recentCheckIns.length > 0
      ? Math.round(recentCheckIns.reduce((sum, ci) => sum + (ci.complianceMeals || 0), 0) / recentCheckIns.length)
      : null;
    const avgWorkoutCompliance = recentCheckIns.length > 0
      ? Math.round(recentCheckIns.reduce((sum, ci) => sum + (ci.complianceWorkouts || 0), 0) / recentCheckIns.length)
      : null;
    const avgEnergy = recentCheckIns.length > 0
      ? (recentCheckIns.reduce((sum, ci) => sum + (ci.energyRating || 3), 0) / recentCheckIns.length).toFixed(1)
      : null;

    let momentum: "positive" | "neutral" | "needs_attention" = "neutral";
    if (avgMealCompliance !== null && avgWorkoutCompliance !== null) {
      const combined = (avgMealCompliance + avgWorkoutCompliance) / 2;
      if (combined >= 75) momentum = "positive";
      else if (combined < 50) momentum = "needs_attention";
    }

    return {
      activeMeals, activeWorkouts, totalMealPlans, totalWorkoutPlans, totalGoals,
      weekCheckIn, recentCheckIns, weightTrend, avgMealCompliance, avgWorkoutCompliance, avgEnergy, momentum,
    };
  }, [mealPlans, workoutPlans, goalPlans, checkIns, now, weekStart]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const dataLoading = !mealPlans || !workoutPlans;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/plans">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-semibold text-base sm:text-lg">Weekly Overview</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-8 sm:py-10 space-y-8">
        {dataLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card data-testid="stat-active-meals">
                <CardContent className="p-4 text-center">
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-2">
                    <UtensilsCrossed className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="text-3xl font-bold" data-testid="text-active-meals-count">{stats.activeMeals.length}</div>
                  <div className="text-xs text-muted-foreground tracking-wide uppercase mt-1">Active Meal Plans</div>
                </CardContent>
              </Card>
              <Card data-testid="stat-active-workouts">
                <CardContent className="p-4 text-center">
                  <div className="h-10 w-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mx-auto mb-2">
                    <Dumbbell className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="text-3xl font-bold" data-testid="text-active-workouts-count">{stats.activeWorkouts.length}</div>
                  <div className="text-xs text-muted-foreground tracking-wide uppercase mt-1">Active Workouts</div>
                </CardContent>
              </Card>
              <Card data-testid="stat-total-plans">
                <CardContent className="p-4 text-center">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-2">
                    <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-3xl font-bold" data-testid="text-total-plans-count">{stats.totalMealPlans + stats.totalWorkoutPlans}</div>
                  <div className="text-xs text-muted-foreground tracking-wide uppercase mt-1">Total Plans</div>
                </CardContent>
              </Card>
              <Card data-testid="stat-goals">
                <CardContent className="p-4 text-center">
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-2">
                    <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="text-3xl font-bold" data-testid="text-goals-count">{stats.totalGoals}</div>
                  <div className="text-xs text-muted-foreground tracking-wide uppercase mt-1">Goal Plans</div>
                </CardContent>
              </Card>
            </div>

            <Card data-testid="card-momentum">
              <CardContent className="p-4 sm:p-5">
                <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Goal Momentum
                </h2>
                {stats.recentCheckIns.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground mb-3">No check-ins recorded yet. Log your first weekly check-in to track progress.</p>
                    <Link href="/check-ins">
                      <Button variant="outline" size="sm" data-testid="button-goto-checkins">
                        <ClipboardCheck className="h-4 w-4 mr-2" />
                        Log Check-in
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={`no-default-hover-elevate no-default-active-elevate ${
                          stats.momentum === "positive" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" :
                          stats.momentum === "needs_attention" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" :
                          ""
                        }`}
                        data-testid="badge-momentum"
                      >
                        {stats.momentum === "positive" ? (
                          <><CheckCircle2 className="h-3 w-3 mr-1" />Positive</>
                        ) : stats.momentum === "needs_attention" ? (
                          <><Activity className="h-3 w-3 mr-1" />Needs Attention</>
                        ) : (
                          <><Minus className="h-3 w-3 mr-1" />Neutral</>
                        )}
                      </Badge>
                      {stats.weightTrend && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-weight-trend">
                          Weight:
                          {stats.weightTrend === "down" ? <TrendingDown className="h-3.5 w-3.5 text-green-600" /> :
                           stats.weightTrend === "up" ? <TrendingUp className="h-3.5 w-3.5 text-red-500" /> :
                           <Minus className="h-3.5 w-3.5" />}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="border rounded-md p-4">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Avg Meal Compliance</div>
                        <div className="text-xl font-semibold" data-testid="text-meal-compliance">
                          {stats.avgMealCompliance !== null ? `${stats.avgMealCompliance}%` : "N/A"}
                        </div>
                        {stats.avgMealCompliance !== null && (
                          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${stats.avgMealCompliance}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="border rounded-md p-4">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Avg Workout Compliance</div>
                        <div className="text-xl font-semibold" data-testid="text-workout-compliance">
                          {stats.avgWorkoutCompliance !== null ? `${stats.avgWorkoutCompliance}%` : "N/A"}
                        </div>
                        {stats.avgWorkoutCompliance !== null && (
                          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${stats.avgWorkoutCompliance}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="border rounded-md p-4">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Avg Energy Level</div>
                        <div className="text-xl font-semibold" data-testid="text-energy-level">
                          {stats.avgEnergy !== null ? `${stats.avgEnergy}/5` : "N/A"}
                        </div>
                        {stats.avgEnergy !== null && (
                          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(parseFloat(stats.avgEnergy) / 5) * 100}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {stats.activeMeals.length > 0 && (
              <Card data-testid="card-active-meal-plans">
                <CardContent className="p-4 sm:p-5">
                  <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    This Week's Meal Plans
                  </h2>
                  <div className="space-y-3">
                    {stats.activeMeals.map(mp => {
                      const plan = mp.planJson as PlanOutput | null;
                      return (
                        <Link key={mp.id} href={`/plan/${mp.id}`}>
                          <div className="flex items-center justify-between p-3 rounded-md hover-elevate cursor-pointer" data-testid={`active-meal-${mp.id}`}>
                            <span className="text-sm font-medium">{plan?.title || "Meal Plan"}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(mp.planStartDate + "T00:00:00"), "MMM d")} - {format(addDays(new Date(mp.planStartDate + "T00:00:00"), 6), "MMM d")}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {stats.activeWorkouts.length > 0 && (
              <Card data-testid="card-active-workout-plans">
                <CardContent className="p-4 sm:p-5">
                  <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Dumbbell className="h-5 w-5 text-primary" />
                    This Week's Workout Plans
                  </h2>
                  <div className="space-y-3">
                    {stats.activeWorkouts.map(wp => {
                      const plan = wp.planJson as WorkoutPlanOutput | null;
                      return (
                        <Link key={wp.id} href={`/workout/${wp.id}`}>
                          <div className="flex items-center justify-between p-3 rounded-md hover-elevate cursor-pointer" data-testid={`active-workout-${wp.id}`}>
                            <span className="text-sm font-medium">{plan?.title || "Workout Plan"}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(wp.planStartDate + "T00:00:00"), "MMM d")} - {format(addDays(new Date(wp.planStartDate + "T00:00:00"), 6), "MMM d")}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {stats.recentCheckIns.length > 0 && (
              <Card data-testid="card-recent-checkins">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-lg flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-primary" />
                      Recent Check-ins
                    </h2>
                    <Link href="/check-ins">
                      <Button variant="ghost" size="sm" data-testid="button-all-checkins">View All</Button>
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {stats.recentCheckIns.map(ci => (
                      <div key={ci.id} className="flex items-center justify-between p-3 border rounded-md" data-testid={`checkin-${ci.id}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">Week of {format(new Date(ci.weekStartDate + "T00:00:00"), "MMM d")}</span>
                          {ci.weightEnd && (
                            <span className="text-xs text-muted-foreground">{ci.weightEnd} lbs</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs font-medium">
                          {ci.complianceMeals !== null && <span>Meals: {ci.complianceMeals}%</span>}
                          {ci.complianceWorkouts !== null && <span>Workouts: {ci.complianceWorkouts}%</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap gap-3">
              <Link href="/plans">
                <Button variant="outline" data-testid="button-goto-plans">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  View Plans
                </Button>
              </Link>
              <Link href="/calendar">
                <Button variant="outline" data-testid="button-goto-calendar">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Calendar
                </Button>
              </Link>
              <Link href="/goals">
                <Button variant="outline" data-testid="button-goto-goals">
                  <Target className="h-4 w-4 mr-2" />
                  Goals
                </Button>
              </Link>
              <Link href="/check-ins">
                <Button variant="outline" data-testid="button-goto-checkins-link">
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Check-ins
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
