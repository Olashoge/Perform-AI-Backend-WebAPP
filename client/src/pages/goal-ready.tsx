import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { GoalPlan, MealPlan, WorkoutPlan, PlanOutput, WorkoutPlanOutput } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target, UtensilsCrossed, Dumbbell, CalendarDays, ArrowRight,
  Flame, Trophy, Heart, Zap, Sparkles, CheckCircle2, Loader2,
} from "lucide-react";
import { format, addDays } from "date-fns";

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  performance: "Performance",
  maintenance: "Maintenance",
  energy: "Energy & Focus",
  general_fitness: "General Fitness",
  mobility: "Mobility",
  endurance: "Endurance",
  strength: "Strength",
};

const GOAL_ICONS: Record<string, typeof Flame> = {
  weight_loss: Flame,
  muscle_gain: Dumbbell,
  performance: Trophy,
  maintenance: Heart,
  energy: Zap,
  general_fitness: Target,
  mobility: Heart,
  endurance: Zap,
  strength: Dumbbell,
};

export default function GoalReady() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: goalPlan, isLoading: goalLoading } = useQuery<GoalPlan>({
    queryKey: ["/api/goal-plans", id],
    enabled: !!user && !!id,
  });

  const { data: mealPlan } = useQuery<MealPlan>({
    queryKey: ["/api/plan", goalPlan?.mealPlanId],
    enabled: !!goalPlan?.mealPlanId,
  });

  const { data: workoutPlan } = useQuery<WorkoutPlan>({
    queryKey: ["/api/workout", goalPlan?.workoutPlanId],
    enabled: !!goalPlan?.workoutPlanId,
  });

  if (goalLoading || !goalPlan) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const GoalIcon = GOAL_ICONS[goalPlan.goalType] || Target;
  const mealPlanJson = mealPlan?.planJson as PlanOutput | null;
  const workoutPlanJson = workoutPlan?.planJson as WorkoutPlanOutput | null;
  const mealPrefs = mealPlan?.preferencesJson as any;
  const workoutPrefs = workoutPlan?.preferencesJson as any;
  const goalTitle = (goalPlan as any).title || null;

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2" data-testid="text-goal-ready-title">Your Plan is Ready</h1>
        {goalTitle && (
          <p className="text-lg font-medium text-primary mb-1" data-testid="text-goal-title">{goalTitle}</p>
        )}
        <p className="text-muted-foreground">
          Here's a summary of what we built for you.
        </p>
      </div>

      <Card className="mb-5">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <GoalIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base" data-testid="text-goal-type">
                {GOAL_LABELS[goalPlan.goalType] || goalPlan.goalType}
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <CalendarDays className="h-3 w-3" />
                {goalPlan.startDate ? (
                  <span>
                    {format(new Date(goalPlan.startDate + "T00:00:00"), "MMM d")} – {format(addDays(new Date(goalPlan.startDate + "T00:00:00"), 6), "MMM d, yyyy")}
                  </span>
                ) : (
                  <span>Not yet scheduled</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {mealPlan && (
              <div className="rounded-md border p-4" data-testid="card-meal-summary">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <UtensilsCrossed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{mealPlanJson?.title || "Meal Plan"}</h3>
                    <p className="text-xs text-muted-foreground">{mealPrefs?.mealsPerDay || 3} meals per day</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {mealPrefs?.dietStyles?.filter((s: string) => s !== "No Preference").map((style: string) => (
                    <Badge key={style} variant="secondary" size="sm">{style}</Badge>
                  ))}
                  {(mealPlanJson as any)?.dailyCalorieTarget && (
                    <Badge variant="secondary" size="sm">{(mealPlanJson as any).dailyCalorieTarget} kcal</Badge>
                  )}
                  {(mealPlanJson as any)?.dailyProteinTarget && (
                    <Badge variant="secondary" size="sm">{(mealPlanJson as any).dailyProteinTarget}g protein</Badge>
                  )}
                </div>
              </div>
            )}

            {workoutPlan && (
              <div className="rounded-md border p-4" data-testid="card-workout-summary">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                    <Dumbbell className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{workoutPlanJson?.title || "Workout Plan"}</h3>
                    <p className="text-xs text-muted-foreground">
                      {workoutPrefs?.daysOfWeek?.length || 3}x per week
                      {workoutPrefs?.sessionLength ? ` · ${workoutPrefs.sessionLength} min` : ""}
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {workoutPrefs?.trainingMode && (
                    <Badge variant="secondary" size="sm" className="capitalize">{workoutPrefs.trainingMode}</Badge>
                  )}
                  {workoutPrefs?.focusAreas?.slice(0, 3).map((area: string) => (
                    <Badge key={area} variant="secondary" size="sm">{area}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {mealPlan && (
          <Button onClick={() => navigate(`/plan/${mealPlan.id}`)} className="w-full" data-testid="button-view-meal-plan">
            <UtensilsCrossed className="h-4 w-4 mr-2" />
            View Meal Plan
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
        )}
        {workoutPlan && (
          <Button onClick={() => navigate(`/workout/${workoutPlan.id}`)} variant={mealPlan ? "outline" : "default"} className="w-full" data-testid="button-view-workout-plan">
            <Dumbbell className="h-4 w-4 mr-2" />
            View Workout Plan
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate("/goals")} className="w-full" data-testid="button-go-to-goals">
          <Target className="h-4 w-4 mr-2" />
          Back to Goals
        </Button>
      </div>
    </div>
  );
}
