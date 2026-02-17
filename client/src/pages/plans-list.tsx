import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { MealPlan, PlanOutput, Preferences, WorkoutPlan, WorkoutPlanOutput } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UtensilsCrossed, Plus, CalendarDays, LogOut, Sparkles, Loader2,
  Flame, Dumbbell, Zap, Heart, Trophy, Settings, Activity,
  CheckCircle2, Clock, CalendarCheck, Target, ClipboardCheck,
} from "lucide-react";
import { format } from "date-fns";

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
    <Badge variant="secondary" className={`no-default-hover-elevate no-default-active-elevate ${config.className}`} data-testid={`badge-status-${status}`}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  fat_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  energy: "Energy",
  maintenance: "Maintenance",
  performance: "Performance",
};

const GOAL_ICONS: Record<string, typeof Flame> = {
  weight_loss: Flame,
  fat_loss: Flame,
  muscle_gain: Dumbbell,
  energy: Zap,
  maintenance: Heart,
  performance: Trophy,
};

const WORKOUT_GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  performance: "Performance",
  maintenance: "General Fitness",
};

export default function PlansList() {
  const { user, logout, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"meals" | "workouts">("meals");

  const { data: plans, isLoading: plansLoading } = useQuery<MealPlan[]>({
    queryKey: ["/api/plans"],
    enabled: !!user,
  });

  const { data: workoutPlans, isLoading: workoutsLoading } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workouts"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [isLoading, user, navigate]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <span className="font-semibold text-base sm:text-lg">My Plans</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="icon" onClick={() => { logout(); navigate("/"); }} data-testid="button-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList data-testid="tabs-plan-type">
              <TabsTrigger value="meals" data-testid="tab-meals">
                <UtensilsCrossed className="h-3.5 w-3.5 mr-1.5" />
                Meal Plans
              </TabsTrigger>
              <TabsTrigger value="workouts" data-testid="tab-workouts">
                <Dumbbell className="h-3.5 w-3.5 mr-1.5" />
                Workouts
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/goals">
              <Button variant="outline" size="icon" className="sm:hidden" data-testid="button-goals-mobile">
                <Target className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="hidden sm:inline-flex" data-testid="button-goals">
                <Target className="h-4 w-4 mr-2" />
                Goals
              </Button>
            </Link>
            <Link href="/check-ins">
              <Button variant="outline" size="icon" className="sm:hidden" data-testid="button-checkins-mobile">
                <ClipboardCheck className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="hidden sm:inline-flex" data-testid="button-checkins">
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Check-ins
              </Button>
            </Link>
            <Link href="/calendar">
              <Button variant="outline" size="icon" className="sm:hidden" data-testid="button-calendar-mobile">
                <CalendarDays className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="hidden sm:inline-flex" data-testid="button-calendar">
                <CalendarDays className="h-4 w-4 mr-2" />
                Calendar
              </Button>
            </Link>
            <Link href="/preferences">
              <Button variant="outline" size="icon" className="sm:hidden" data-testid="button-preferences-mobile">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="hidden sm:inline-flex" data-testid="button-preferences">
                <Settings className="h-4 w-4 mr-2" />
                Preferences
              </Button>
            </Link>
            {activeTab === "meals" ? (
              <Link href="/new-plan">
                <Button data-testid="button-create-plan">
                  <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">New Plan</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </Link>
            ) : (
              <Link href="/workouts/new">
                <Button data-testid="button-create-workout">
                  <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">New Workout</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </Link>
            )}
          </div>
        </div>

        {activeTab === "meals" ? (
          <MealPlanList plans={plans} isLoading={plansLoading} />
        ) : (
          <WorkoutPlanList plans={workoutPlans} isLoading={workoutsLoading} />
        )}
      </div>
    </div>
  );
}

function MealPlanList({ plans, isLoading }: { plans?: MealPlan[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
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
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-semibold text-lg mb-1">No meal plans yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Create your first AI-powered meal plan to get started.</p>
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
    <div className="space-y-3">
      {plans.map((mp) => {
        const plan = mp.planJson as PlanOutput;
        const prefs = mp.preferencesJson as Preferences;
        const GoalIcon = GOAL_ICONS[prefs?.goal] || Heart;
        const status = (mp as any).status as string;
        return (
          <Link key={mp.id} href={`/plan/${mp.id}`}>
            <Card className="hover-elevate cursor-pointer" data-testid={`card-plan-${mp.id}`}>
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate text-sm sm:text-base" data-testid={`text-plan-title-${mp.id}`}>
                      {status === "generating" ? "Generating..." : status === "failed" ? "Generation Failed" : plan?.title || "Meal Plan"}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {status === "generating" ? "Your meal plan is being generated by AI..." : status === "failed" ? "Something went wrong. Click to try again." : plan?.summary || "7-day personalized meal plan"}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {status === "generating" ? (
                        <Badge variant="secondary">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Generating
                        </Badge>
                      ) : status === "failed" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <>
                          <StatusBadge startDate={mp.planStartDate} />
                          <Badge variant="secondary">
                            <GoalIcon className="h-3 w-3 mr-1" />
                            {GOAL_LABELS[prefs?.goal] || "Maintenance"}
                          </Badge>
                        </>
                      )}
                      {prefs?.dietStyles && prefs.dietStyles.length > 0 && prefs.dietStyles[0] !== "No Preference" && (
                        <Badge variant="outline">{prefs.dietStyles.join(", ")}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(mp.createdAt), "MMM d, yyyy")}
                      </span>
                      {mp.planStartDate && (
                        <span className="text-xs text-muted-foreground">
                          Starts {format(new Date(mp.planStartDate + "T00:00:00"), "MMM d")}
                        </span>
                      )}
                    </div>
                  </div>
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
      <div className="space-y-3">
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
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Dumbbell className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-semibold text-lg mb-1">No workout plans yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Create your first AI-powered workout plan to get started.</p>
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
    <div className="space-y-3">
      {plans.map((wp) => {
        const planJson = wp.planJson as WorkoutPlanOutput | null;
        const prefs = wp.preferencesJson as any;
        const status = wp.status;
        return (
          <Link key={wp.id} href={status === "generating" ? `/workout/${wp.id}/generating` : `/workout/${wp.id}`}>
            <Card className="hover-elevate cursor-pointer" data-testid={`card-workout-${wp.id}`}>
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate text-sm sm:text-base" data-testid={`text-workout-title-${wp.id}`}>
                      {status === "generating" ? "Generating..." : status === "failed" ? "Generation Failed" : planJson?.title || "Workout Plan"}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {status === "generating" ? "Your workout plan is being generated..." : status === "failed" ? "Something went wrong. Click to try again." : planJson?.summary || "7-day workout plan"}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {status === "generating" ? (
                        <Badge variant="secondary">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Generating
                        </Badge>
                      ) : status === "failed" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <>
                          <StatusBadge startDate={wp.planStartDate} />
                          <Badge variant="secondary">
                            <Dumbbell className="h-3 w-3 mr-1" />
                            {WORKOUT_GOAL_LABELS[prefs?.goal] || "Fitness"}
                          </Badge>
                          {prefs?.trainingMode && (
                            <Badge variant="outline" className="capitalize">{prefs.trainingMode}</Badge>
                          )}
                        </>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(wp.createdAt), "MMM d, yyyy")}
                      </span>
                      {wp.planStartDate && (
                        <span className="text-xs text-muted-foreground">
                          Starts {format(new Date(wp.planStartDate + "T00:00:00"), "MMM d")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
