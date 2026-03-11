import { useState, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCompletions } from "@/hooks/use-completions";
import type {
  GoalPlan, MealPlan, WorkoutPlan, PlanOutput, WorkoutPlanOutput,
  Day, WorkoutDay,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CompletionCheckbox } from "@/components/completion-checkbox";
import {
  ArrowLeft, Target, UtensilsCrossed, Dumbbell, CalendarDays,
  Flame, Trophy, Heart, Zap, Clock, ChevronDown, Loader2,
  ThumbsUp, ThumbsDown, Sparkles, CheckCircle2, RefreshCw,
} from "lucide-react";
import { format, addDays } from "date-fns";

type GoalPlanDetail = GoalPlan & { mealPlan: MealPlan | null; workoutPlan: WorkoutPlan | null };

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

function generateMealFingerprint(mealName: string, cuisineTag: string, ingredients?: string[]): string {
  const slugify = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const namePart = slugify(mealName);
  const cuisinePart = slugify(cuisineTag);
  const keyIngredients = ["chicken", "beef", "pork", "fish", "salmon", "tuna", "shrimp", "turkey", "lamb", "tofu", "tempeh", "egg", "eggs", "beans", "lentils", "chickpeas", "milk", "cheese", "yogurt", "cream", "rice", "pasta", "bread", "quinoa", "oats", "avocado", "mushroom", "mushrooms"];
  let proteinPart = "none";
  if (ingredients && ingredients.length > 0) {
    const combined = ingredients.join(" ").toLowerCase();
    for (const key of keyIngredients) {
      if (combined.includes(key)) { proteinPart = key; break; }
    }
  }
  return `${namePart}|${cuisinePart}|${proteinPart}`;
}

function generateExerciseKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function MealCard({ slot, meal, dayDate, mealPlanId, feedbackState, onFeedback, completed, onToggleCompletion }: {
  slot: string;
  meal: any;
  dayDate: string;
  mealPlanId: string;
  feedbackState?: "like" | "dislike" | null;
  onFeedback: (fingerprint: string, mealName: string, cuisineTag: string, feedback: "like" | "dislike" | "neutral", ingredients: string[]) => void;
  completed: boolean;
  onToggleCompletion: (input: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const fingerprint = generateMealFingerprint(meal.name, meal.cuisineTag || "", meal.ingredients);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`border rounded-xl overflow-hidden transition-colors ${completed ? "opacity-60" : ""}`} data-testid={`meal-card-${slot}`}>
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
          onClick={() => {
            onToggleCompletion({ date: dayDate, itemType: "meal" as const, sourceType: "meal_plan" as const, sourceId: mealPlanId, itemKey: slot, completed: !completed });
          }}
          data-testid={`meal-row-${slot}`}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <CompletionCheckbox
              date={dayDate}
              itemType="meal"
              sourceType="meal_plan"
              sourceId={mealPlanId}
              itemKey={slot}
              completed={completed}
              onToggle={onToggleCompletion}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5 capitalize">{slot}</div>
            <div className="font-semibold text-sm">{meal.name}</div>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
              data-testid={`button-expand-${slot}`}
            >
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="px-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {meal.cuisineTag && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{meal.cuisineTag}</Badge>}
            {meal.prepTimeMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {meal.prepTimeMinutes} min
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 transition-colors duration-200 ${feedbackState === "like" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "text-muted-foreground"}`}
              onClick={(e) => { e.stopPropagation(); onFeedback(fingerprint, meal.name, meal.cuisineTag || "", feedbackState === "like" ? "neutral" : "like", meal.ingredients || []); }}
              data-testid={`button-like-${slot}`}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 transition-colors duration-200 ${feedbackState === "dislike" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400" : "text-muted-foreground"}`}
              onClick={(e) => { e.stopPropagation(); onFeedback(fingerprint, meal.name, meal.cuisineTag || "", feedbackState === "dislike" ? "neutral" : "dislike", meal.ingredients || []); }}
              data-testid={`button-dislike-${slot}`}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {meal.nutritionEstimateRange && (
          <div className="flex gap-3 px-4 pb-3 text-xs">
            <span className="text-amber-600 dark:text-amber-400">{meal.nutritionEstimateRange.calories} cal</span>
            <span>P: {meal.nutritionEstimateRange.protein_g}g</span>
            <span>C: {meal.nutritionEstimateRange.carbs_g}g</span>
            <span>F: {meal.nutritionEstimateRange.fat_g}g</span>
          </div>
        )}
      </div>
      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-xl p-4 -mt-2 pt-4 space-y-3">
          {meal.whyItHelpsGoal && (
            <div className="text-xs text-muted-foreground italic">{meal.whyItHelpsGoal}</div>
          )}
          {meal.ingredients && meal.ingredients.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Ingredients</div>
              <ul className="text-sm space-y-0.5">
                {meal.ingredients.map((ing: string, i: number) => (
                  <li key={i} className="text-muted-foreground">• {ing}</li>
                ))}
              </ul>
            </div>
          )}
          {meal.steps && meal.steps.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Steps</div>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                {meal.steps.map((step: string, i: number) => (
                  <li key={i} className="text-muted-foreground">{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExerciseRow({ exercise, exerciseKey, prefState, onPrefChange }: {
  exercise: any;
  exerciseKey: string;
  prefState?: "liked" | "disliked" | null;
  onPrefChange: (key: string, name: string, feedback: "liked" | "disliked" | "neutral") => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`exercise-row-${exerciseKey}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{exercise.name}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {exercise.sets && <span>{exercise.sets} sets</span>}
          {exercise.reps && <span>{exercise.reps} reps</span>}
          {exercise.time && <span>{exercise.time}</span>}
          {exercise.restSeconds && <span>Rest: {exercise.restSeconds}s</span>}
        </div>
        {exercise.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">{exercise.notes}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${prefState === "liked" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "text-muted-foreground"}`}
          onClick={() => onPrefChange(exerciseKey, exercise.name, prefState === "liked" ? "neutral" : "liked")}
          data-testid={`button-like-exercise-${exerciseKey}`}
        >
          <ThumbsUp className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${prefState === "disliked" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400" : "text-muted-foreground"}`}
          onClick={() => onPrefChange(exerciseKey, exercise.name, prefState === "disliked" ? "neutral" : "disliked")}
          data-testid={`button-dislike-exercise-${exerciseKey}`}
        >
          <ThumbsDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default function GoalDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedMealDay, setSelectedMealDay] = useState(0);
  const [selectedWorkoutDay, setSelectedWorkoutDay] = useState<number | null>(null);

  const { data: goalPlanDetail, isLoading, isError } = useQuery<GoalPlanDetail>({
    queryKey: ["/api/goal-plans", id],
    enabled: !!user && !!id,
  });

  const goalPlan = goalPlanDetail;
  const mealPlan = goalPlanDetail?.mealPlan ?? null;
  const workoutPlan = goalPlanDetail?.workoutPlan ?? null;
  const mealPlanJson = mealPlan?.planJson as PlanOutput | null;
  const workoutPlanJson = workoutPlan?.planJson as WorkoutPlanOutput | null;

  const startDate = goalPlan?.startDate || null;
  const endDate = startDate ? format(addDays(new Date(startDate + "T00:00:00"), 6), "yyyy-MM-dd") : null;

  const { isCompleted, toggle } = useCompletions(
    startDate || "2099-01-01",
    endDate || "2099-01-01",
    !!goalPlan && !!startDate,
  );

  const { data: feedbackData } = useQuery<{ liked: any[]; disliked: any[] }>({
    queryKey: ["/api/preferences/meals"],
    enabled: !!user,
  });

  const [optimisticFeedback, setOptimisticFeedback] = useState<Record<string, "like" | "dislike" | null>>({});
  const feedbackMap = useMemo(() => {
    const map: Record<string, "like" | "dislike"> = {};
    if (feedbackData) {
      for (const item of feedbackData.liked) map[item.mealFingerprint] = "like";
      for (const item of feedbackData.disliked) map[item.mealFingerprint] = "dislike";
    }
    for (const [k, v] of Object.entries(optimisticFeedback)) {
      if (v === null) delete map[k];
      else map[k] = v;
    }
    return map;
  }, [feedbackData, optimisticFeedback]);

  const feedbackMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/feedback", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/meals"] });
    },
  });

  const handleMealFeedback = useCallback((fingerprint: string, mealName: string, cuisineTag: string, feedback: "like" | "dislike" | "neutral", ingredients: string[]) => {
    setOptimisticFeedback(prev => ({ ...prev, [fingerprint]: feedback === "neutral" ? null : feedback }));
    feedbackMutation.mutate({ mealFingerprint: fingerprint, mealName, cuisineTag, feedback, ingredients });
  }, [feedbackMutation]);

  const { data: exercisePrefData } = useQuery<{ liked: any[]; disliked: any[]; avoided: any[] }>({
    queryKey: ["/api/preferences/exercise"],
    enabled: !!user,
  });

  const [optimisticExPrefs, setOptimisticExPrefs] = useState<Record<string, "liked" | "disliked" | null>>({});
  const exercisePrefMap = useMemo(() => {
    const map: Record<string, "liked" | "disliked"> = {};
    if (exercisePrefData) {
      for (const item of exercisePrefData.liked) map[item.exerciseKey] = "liked";
      for (const item of exercisePrefData.disliked) map[item.exerciseKey] = "disliked";
    }
    for (const [k, v] of Object.entries(optimisticExPrefs)) {
      if (v === null) delete map[k];
      else map[k] = v;
    }
    return map;
  }, [exercisePrefData, optimisticExPrefs]);

  const exercisePrefMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/preferences/exercise", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/exercise"] });
    },
  });

  const handleExercisePref = useCallback((key: string, name: string, feedback: "liked" | "disliked" | "neutral") => {
    setOptimisticExPrefs(prev => ({ ...prev, [key]: feedback === "neutral" ? null : feedback }));
    exercisePrefMutation.mutate({ exerciseKey: key, exerciseName: name, status: feedback });
  }, [exercisePrefMutation]);

  const regenMealMutation = useMutation({
    mutationFn: async (dayIndex: number) => {
      const res = await apiRequest("POST", `/api/goal-plans/${id}/regenerate-meal-day`, { dayIndex });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Meal day regenerated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans", id] });
    },
    onError: () => {
      toast({ title: "Failed to regenerate meal day", variant: "destructive" });
    },
  });

  const regenWorkoutMutation = useMutation({
    mutationFn: async (dayIndex: number) => {
      const res = await apiRequest("POST", `/api/goal-plans/${id}/regenerate-workout-session`, { dayIndex });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Workout session regenerated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans", id] });
    },
    onError: () => {
      toast({ title: "Failed to regenerate workout session", variant: "destructive" });
    },
  });

  const firstWorkoutDayIndex = useMemo(() => {
    if (!workoutPlanJson) return 0;
    return workoutPlanJson.days.findIndex(d => d.isWorkoutDay && d.session);
  }, [workoutPlanJson]);

  const initialWorkoutDay = selectedWorkoutDay ?? (firstWorkoutDayIndex >= 0 ? firstWorkoutDayIndex : 0);

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Target className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="font-semibold text-lg mb-2" data-testid="text-goal-not-found">Wellness plan not found</h2>
        <p className="text-sm text-muted-foreground mb-6">This plan may have been deleted or doesn't exist.</p>
        <Button onClick={() => navigate("/goals")} data-testid="button-back-to-goals-error">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Wellness Plans
        </Button>
      </div>
    );
  }

  if (isLoading || !goalPlan) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-10 w-full mb-6 rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const GoalIcon = GOAL_ICONS[goalPlan.goalType] || Target;

  function getDayDate(dayIndex: number): string {
    if (!startDate) return "";
    return format(addDays(new Date(startDate + "T00:00:00"), dayIndex), "yyyy-MM-dd");
  }

  function getDayLabel(dayIndex: number): string {
    if (startDate) {
      return format(addDays(new Date(startDate + "T00:00:00"), dayIndex), "EEE, MMM d");
    }
    const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return names[dayIndex] || `Day ${dayIndex + 1}`;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/goals")} data-testid="button-back-to-goals">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <GoalIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate" data-testid="text-goal-detail-title">
              {(goalPlan as any).title || GOAL_LABELS[goalPlan.goalType] || goalPlan.goalType}
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {startDate ? (
                <span>{format(new Date(startDate + "T00:00:00"), "MMM d")} – {format(addDays(new Date(startDate + "T00:00:00"), 6), "MMM d, yyyy")}</span>
              ) : (
                <span>Not yet scheduled</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6" data-testid="tabs-goal-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="meals" data-testid="tab-meals" disabled={!mealPlan}>
            <UtensilsCrossed className="h-3.5 w-3.5 mr-1.5" />
            Meals
          </TabsTrigger>
          <TabsTrigger value="workouts" data-testid="tab-workouts" disabled={!workoutPlan}>
            <Dumbbell className="h-3.5 w-3.5 mr-1.5" />
            Workouts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <GoalIcon className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold" data-testid="text-overview-goal-type">{GOAL_LABELS[goalPlan.goalType] || goalPlan.goalType}</h2>
                  <Badge variant="secondary">{goalPlan.planType === "both" ? "Meals + Workouts" : goalPlan.planType === "meal" ? "Meals Only" : "Workouts Only"}</Badge>
                </div>
                {mealPlanJson?.summary && (
                  <p className="text-sm text-muted-foreground mb-2">{mealPlanJson.summary}</p>
                )}
                {workoutPlanJson?.summary && (
                  <p className="text-sm text-muted-foreground">{workoutPlanJson.summary}</p>
                )}
              </CardContent>
            </Card>

            {mealPlan && (
              <Card data-testid="card-overview-meals">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                      <UtensilsCrossed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{mealPlanJson?.title || "Meal Plan"}</h3>
                      <p className="text-xs text-muted-foreground">7-day meal plan</p>
                    </div>
                  </div>
                  {mealPlanJson?.nutritionNotes?.dailyMacroTargetsRange && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <Badge variant="secondary" size="sm">{mealPlanJson.nutritionNotes.dailyMacroTargetsRange.calories} cal</Badge>
                      <Badge variant="secondary" size="sm">P: {mealPlanJson.nutritionNotes.dailyMacroTargetsRange.protein_g}g</Badge>
                      <Badge variant="secondary" size="sm">C: {mealPlanJson.nutritionNotes.dailyMacroTargetsRange.carbs_g}g</Badge>
                      <Badge variant="secondary" size="sm">F: {mealPlanJson.nutritionNotes.dailyMacroTargetsRange.fat_g}g</Badge>
                    </div>
                  )}
                  {mealPlanJson?.nutritionNotes?.howThisSupportsGoal && (
                    <div className="space-y-1">
                      {mealPlanJson.nutritionNotes.howThisSupportsGoal.map((note, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                          {note}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {workoutPlan && (
              <Card data-testid="card-overview-workouts">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                      <Dumbbell className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{workoutPlanJson?.title || "Workout Plan"}</h3>
                      <p className="text-xs text-muted-foreground">
                        {workoutPlanJson?.days.filter(d => d.isWorkoutDay).length || 0} workout days per week
                      </p>
                    </div>
                  </div>
                  {workoutPlanJson?.progressionNotes && workoutPlanJson.progressionNotes.length > 0 && (
                    <div className="space-y-1">
                      {workoutPlanJson.progressionNotes.map((note, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                          {note}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="meals">
          {mealPlanJson && mealPlan && (
            <div>
              <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 -mx-1 px-1" data-testid="meal-day-selector">
                {mealPlanJson.days.map((day, idx) => (
                  <Button
                    key={idx}
                    variant={selectedMealDay === idx ? "default" : "outline"}
                    size="sm"
                    className="shrink-0 text-xs px-3"
                    onClick={() => setSelectedMealDay(idx)}
                    data-testid={`button-meal-day-${idx}`}
                  >
                    {getDayLabel(idx)}
                  </Button>
                ))}
              </div>

              {(() => {
                const day = mealPlanJson.days[selectedMealDay];
                if (!day) return null;
                const dayDate = getDayDate(selectedMealDay);
                const slots = Object.entries(day.meals).filter(([, meal]) => meal);
                return (
                  <div className="space-y-3" data-testid="meals-day-content">
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={regenMealMutation.isPending}
                        onClick={() => regenMealMutation.mutate(selectedMealDay)}
                        data-testid="button-regenerate-meal-day"
                      >
                        {regenMealMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Regenerate Day
                      </Button>
                    </div>
                    {slots.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">No meals planned for this day</div>
                    )}
                    {slots.map(([slot, meal]) => (
                      <MealCard
                        key={`${selectedMealDay}-${slot}`}
                        slot={slot}
                        meal={meal}
                        dayDate={dayDate}
                        mealPlanId={mealPlan.id}
                        feedbackState={feedbackMap[generateMealFingerprint(meal!.name, meal!.cuisineTag || "", meal!.ingredients)] || null}
                        onFeedback={handleMealFeedback}
                        completed={dayDate ? isCompleted(dayDate, "meal", "meal_plan", mealPlan.id, slot) : false}
                        onToggleCompletion={toggle}
                      />
                    ))}
                  </div>
                );
              })()}

              {mealPlanJson.groceryList && mealPlanJson.groceryList.sections.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-sm mb-3" data-testid="text-grocery-header">Grocery List</h3>
                  <div className="space-y-3">
                    {mealPlanJson.groceryList.sections.map((section, si) => (
                      <Card key={si}>
                        <CardContent className="p-4">
                          <h4 className="font-medium text-sm mb-2 capitalize">{section.name}</h4>
                          <ul className="space-y-1">
                            {section.items.map((item, ii) => (
                              <li key={ii} className="text-sm text-muted-foreground flex justify-between">
                                <span>{item.item}</span>
                                <span className="text-xs">{item.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="workouts">
          {workoutPlanJson && workoutPlan && (
            <div>
              <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 -mx-1 px-1" data-testid="workout-day-selector">
                {workoutPlanJson.days.map((day, idx) => (
                  <Button
                    key={idx}
                    variant={initialWorkoutDay === idx ? "default" : "outline"}
                    size="sm"
                    className={`shrink-0 text-xs px-3 ${!day.isWorkoutDay ? "opacity-50" : ""}`}
                    onClick={() => setSelectedWorkoutDay(idx)}
                    data-testid={`button-workout-day-${idx}`}
                  >
                    <span>{getDayLabel(idx)}</span>
                    {day.isWorkoutDay && <Dumbbell className="h-3 w-3 ml-1" />}
                  </Button>
                ))}
              </div>

              {(() => {
                const day = workoutPlanJson.days[initialWorkoutDay];
                if (!day) return null;
                const dayDate = getDayDate(initialWorkoutDay);

                if (!day.isWorkoutDay || !day.session) {
                  return (
                    <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-rest-day">
                      Rest Day
                    </div>
                  );
                }

                const session = day.session;
                const workoutCompleted = dayDate ? isCompleted(dayDate, "workout", "workout_plan", workoutPlan.id, `day_${day.dayIndex}`) : false;

                return (
                  <div className="space-y-4" data-testid="workout-day-content">
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={regenWorkoutMutation.isPending}
                        onClick={() => regenWorkoutMutation.mutate(initialWorkoutDay)}
                        data-testid="button-regenerate-workout-session"
                      >
                        {regenWorkoutMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Regenerate Session
                      </Button>
                    </div>
                    <Card className={workoutCompleted ? "opacity-60" : ""}>
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="capitalize">{session.mode}</Badge>
                            <Badge variant="secondary" className="capitalize">{session.intensity}</Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {session.durationMinutes} min
                            </span>
                          </div>
                          {dayDate && (
                            <CompletionCheckbox
                              date={dayDate}
                              itemType="workout"
                              sourceType="workout_plan"
                              sourceId={workoutPlan.id}
                              itemKey={`day_${day.dayIndex}`}
                              completed={workoutCompleted}
                              onToggle={toggle}
                            />
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground mb-4">{session.focus}</p>

                        {session.warmup && session.warmup.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Warm-up</h4>
                            <ul className="text-sm space-y-0.5">
                              {session.warmup.map((item, i) => (
                                <li key={i} className="text-muted-foreground">• {item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="mb-4">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Main Workout</h4>
                          <div className="divide-y">
                            {session.main.map((exercise, i) => {
                              const key = generateExerciseKey(exercise.name);
                              return (
                                <ExerciseRow
                                  key={`${initialWorkoutDay}-${i}`}
                                  exercise={exercise}
                                  exerciseKey={key}
                                  prefState={exercisePrefMap[key] === "liked" ? "liked" : exercisePrefMap[key] === "disliked" ? "disliked" : null}
                                  onPrefChange={handleExercisePref}
                                />
                              );
                            })}
                          </div>
                        </div>

                        {session.cooldown && session.cooldown.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cool-down</h4>
                            <ul className="text-sm space-y-0.5">
                              {session.cooldown.map((item, i) => (
                                <li key={i} className="text-muted-foreground">• {item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {session.coachingCues && session.coachingCues.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Coaching Cues</h4>
                            <div className="space-y-1">
                              {session.coachingCues.map((cue, i) => (
                                <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                  <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                                  {cue}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
