import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { MealPlan, PlanOutput, Preferences, WorkoutPlan, WorkoutPlanOutput } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Sparkles, Loader2, UtensilsCrossed,
  Dumbbell,
  CheckCircle2, Clock, CalendarCheck, Activity, ChevronRight,
} from "lucide-react";
import { format, addDays } from "date-fns";

type PlanLifecycleStatus = "draft" | "scheduled" | "active" | "completed";

function derivePlanStatus(startDate: string | null | undefined): PlanLifecycleStatus {
  if (!startDate) return "draft";
  const start = new Date(startDate + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  if (today < start) return "scheduled";
  if (today < end) return "active";
  return "completed";
}

const STATUS_BADGE_CONFIG: Record<PlanLifecycleStatus, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground", icon: Clock },
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: CalendarCheck },
  active: { label: "Active", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: Activity },
  completed: { label: "Completed", className: "bg-muted text-muted-foreground", icon: CheckCircle2 },
};

function StatusBadge({ startDate }: { startDate: string | null | undefined }) {
  const status = derivePlanStatus(startDate);
  const config = STATUS_BADGE_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge size="sm" variant="secondary" className={`no-default-hover-elevate no-default-active-elevate ${config.className}`} data-testid={`badge-status-${status}`}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

export default function PlansList() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  const isWorkouts = location === "/training";

  const { data: plans, isLoading: plansLoading } = useQuery<MealPlan[]>({
    queryKey: ["/api/plans"],
    enabled: !!user && !isWorkouts,
  });

  const { data: workoutPlans, isLoading: workoutsLoading } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workouts"],
    enabled: !!user && isWorkouts,
  });

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const pageTitle = isWorkouts ? "Training" : "Nutrition";
  const pageSubtitle = isWorkouts
    ? "Workout plans for progressive results"
    : "Meal plans aligned with your goal";

  return (
    <div className="px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-page-subtitle">{pageSubtitle}</p>
        </div>
        {isWorkouts ? (
          <Link href="/workouts/new">
            <Button data-testid="button-create-workout">
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Plan
            </Button>
          </Link>
        ) : (
          <Link href="/new-plan">
            <Button data-testid="button-create-plan">
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Plan
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" data-testid="text-section-label">
          Active Plans
        </span>
      </div>

      {isWorkouts ? (
        <WorkoutPlanList plans={workoutPlans} isLoading={workoutsLoading} />
      ) : (
        <MealPlanList plans={plans} isLoading={plansLoading} />
      )}
    </div>
  );
}

function MealPlanList({ plans, isLoading }: { plans?: MealPlan[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-4 w-72 mb-3" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-6">
            <UtensilsCrossed className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="font-semibold text-lg mb-2">No meal plans yet</h2>
          <p className="text-sm text-muted-foreground mb-6">Create your first AI-powered meal plan to get started.</p>
          <Link href="/new-plan">
            <Button data-testid="button-create-first-plan">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Plan
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {plans.map((mp) => {
        const plan = mp.planJson as PlanOutput;
        const prefs = mp.preferencesJson as Preferences;
        const status = (mp as any).status as string;
        const calories = (plan as any)?.dailyCalorieTarget || (prefs as any)?.dailyCalories || null;
        const protein = (plan as any)?.dailyProteinTarget || null;
        return (
          <Link key={mp.id} href={`/plan/${mp.id}`}>
            <Card className="hover-elevate cursor-pointer" data-testid={`card-plan-${mp.id}`}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <UtensilsCrossed className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-base" data-testid={`text-plan-title-${mp.id}`}>
                        {status === "generating" ? "Generating..." : status === "failed" ? "Generation Failed" : plan?.title || "Meal Plan"}
                      </h3>
                      {status === "generating" ? (
                        <Badge size="sm" variant="secondary">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Generating
                        </Badge>
                      ) : status === "failed" ? (
                        <Badge size="sm" variant="destructive">Failed</Badge>
                      ) : (
                        <StatusBadge startDate={mp.planStartDate} />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>
                        {mp.planStartDate ? (
                          <>
                            {format(new Date(mp.planStartDate + "T00:00:00"), "MMM d")} – {format(addDays(new Date(mp.planStartDate + "T00:00:00"), 6), "MMM d, yyyy")}
                          </>
                        ) : (
                          <>Created: {format(new Date(mp.createdAt), "MMM d, yyyy")}</>
                        )}
                      </span>
                      {status !== "generating" && status !== "failed" && calories && (
                        <>
                          <span>{calories} kcal/day</span>
                          {protein && <span>{protein}g protein</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function WorkoutPlanList({ plans, isLoading }: { plans?: WorkoutPlan[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-4 w-72 mb-3" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-6">
            <Dumbbell className="h-8 w-8 text-teal-600 dark:text-teal-400" />
          </div>
          <h2 className="font-semibold text-lg mb-2">No workout plans yet</h2>
          <p className="text-sm text-muted-foreground mb-6">Create your first AI-powered workout plan to get started.</p>
          <Link href="/workouts/new">
            <Button data-testid="button-create-first-workout">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Workout
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {plans.map((wp) => {
        const planJson = wp.planJson as WorkoutPlanOutput | null;
        const prefs = wp.preferencesJson as any;
        const status = wp.status;
        const daysPerWeek = prefs?.daysPerWeek || (planJson as any)?.daysPerWeek || null;
        const trainingMode = prefs?.trainingMode || null;
        return (
          <Link key={wp.id} href={status === "generating" ? `/workout/${wp.id}/generating` : `/workout/${wp.id}`}>
            <Card className="hover-elevate cursor-pointer" data-testid={`card-workout-${wp.id}`}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                    <Dumbbell className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-base" data-testid={`text-workout-title-${wp.id}`}>
                        {status === "generating" ? "Generating..." : status === "failed" ? "Generation Failed" : planJson?.title || "Workout Plan"}
                      </h3>
                      {status === "generating" ? (
                        <Badge size="sm" variant="secondary">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Generating
                        </Badge>
                      ) : status === "failed" ? (
                        <Badge size="sm" variant="destructive">Failed</Badge>
                      ) : (
                        <StatusBadge startDate={wp.planStartDate} />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>
                        {wp.planStartDate ? (
                          <>
                            {format(new Date(wp.planStartDate + "T00:00:00"), "MMM d")} – {format(addDays(new Date(wp.planStartDate + "T00:00:00"), 6), "MMM d, yyyy")}
                          </>
                        ) : (
                          <>Created: {format(new Date(wp.createdAt), "MMM d, yyyy")}</>
                        )}
                      </span>
                      {status !== "generating" && status !== "failed" && (
                        <>
                          {daysPerWeek && <span>{daysPerWeek}x per week</span>}
                          {trainingMode && <span className="capitalize">{trainingMode}</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
