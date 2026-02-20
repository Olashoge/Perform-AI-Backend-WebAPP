import { useState, useMemo, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { WorkoutPlan, WorkoutPlanOutput, WorkoutSession, WorkoutExercise, AdaptiveSnapshot } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dumbbell, ChevronDown, Clock, Loader2,
  Flame, Target, MoreVertical, Trash2,
  CalendarPlus, CalendarMinus, CalendarClock,
  Zap, Activity, Timer, ChevronRight,
  ThumbsUp, ThumbsDown, ArrowLeft, Ban, Printer,
  TrendingUp, Shield,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { AllowancePanel } from "@/components/allowance-panel";
import { AdaptiveInsightsCard } from "@/components/adaptive-insights-card";
import { CompletionCheckbox } from "@/components/completion-checkbox";
import { useCompletions } from "@/hooks/use-completions";

const INTENSITY_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  hard: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const MODE_ICONS: Record<string, typeof Dumbbell> = {
  strength: Dumbbell,
  cardio: Activity,
  mixed: Zap,
};

function exerciseToKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function ExerciseRow({ exercise, index, exercisePrefStatus, onExercisePref }: {
  exercise: WorkoutExercise;
  index: number;
  exercisePrefStatus?: "liked" | "disliked" | "avoided" | null;
  onExercisePref: (exerciseKey: string, exerciseName: string, status: "liked" | "disliked" | "neutral") => void;
}) {
  const exKey = exerciseToKey(exercise.name);
  const isLiked = exercisePrefStatus === "liked";
  const isDisliked = exercisePrefStatus === "disliked";
  const isAvoided = exercisePrefStatus === "avoided";

  return (
    <div className="flex items-start gap-3 py-3" data-testid={`exercise-${index}`}>
      <span className="text-xs font-mono text-muted-foreground/60 mt-0.5 w-5 shrink-0 text-right">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug" data-testid={`text-exercise-name-${index}`}>{exercise.name}</p>
          <div className="flex items-center gap-0.5 shrink-0">
            {isAvoided && (
              <Badge variant="secondary" className="text-[10px] mr-1">
                <Ban className="h-3 w-3 mr-0.5" />
                Avoided
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={`toggle-elevate ${isLiked ? "toggle-elevated text-green-600 dark:text-green-400" : "text-muted-foreground/40"}`}
              onClick={(e) => {
                e.stopPropagation();
                onExercisePref(exKey, exercise.name, isLiked ? "neutral" : "liked");
              }}
              title={isLiked ? "Remove like" : "Like this exercise"}
              data-testid={`button-like-exercise-${index}`}
            >
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`toggle-elevate ${isDisliked || isAvoided ? "toggle-elevated text-red-600 dark:text-red-400" : "text-muted-foreground/40"}`}
              onClick={(e) => {
                e.stopPropagation();
                onExercisePref(exKey, exercise.name, isDisliked ? "neutral" : "disliked");
              }}
              title={isDisliked ? "Remove dislike" : "Dislike this exercise"}
              data-testid={`button-dislike-exercise-${index}`}
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {exercise.type && (
            <Badge variant="outline" className="text-[10px]">{exercise.type}</Badge>
          )}
          {exercise.sets && exercise.reps && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              {exercise.sets} x {exercise.reps}
            </span>
          )}
          {exercise.time && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {exercise.time}
            </span>
          )}
          {exercise.restSeconds && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Rest: {exercise.restSeconds}s
            </span>
          )}
        </div>
        {exercise.notes && (
          <p className="text-xs text-muted-foreground/80 mt-1.5 italic">{exercise.notes}</p>
        )}
      </div>
    </div>
  );
}

function SessionCard({ session, dayName, dayIndex, feedbackState, onFeedback, exercisePrefMap, onExercisePref, planStartDate, onRegenerate, isRegenerating, completionCompleted, completionDateStr, completionSourceId, onCompletionToggle }: {
  session: WorkoutSession;
  dayName: string;
  dayIndex: number;
  feedbackState?: "like" | "dislike" | null;
  onFeedback: (sessionKey: string, feedback: "like" | "dislike" | "neutral") => void;
  exercisePrefMap: Record<string, "liked" | "disliked" | "avoided">;
  onExercisePref: (exerciseKey: string, exerciseName: string, status: "liked" | "disliked" | "neutral") => void;
  planStartDate?: string | null;
  onRegenerate?: (dayIndex: number) => void;
  isRegenerating?: boolean;
  completionCompleted?: boolean;
  completionDateStr?: string | null;
  completionSourceId?: string;
  onCompletionToggle?: (input: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ModeIcon = MODE_ICONS[session.mode] || Dumbbell;
  const sessionKey = `day${dayIndex}_${session.focus.toLowerCase().replace(/\s+/g, "_")}`;

  const actualDate = planStartDate
    ? (() => {
        const start = new Date(planStartDate + "T00:00:00");
        const d = new Date(start);
        d.setDate(d.getDate() + (dayIndex - 1));
        return d;
      })()
    : null;

  const showCheckbox = !!completionDateStr && !!completionSourceId && !!onCompletionToggle;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={`overflow-visible ${completionCompleted ? "opacity-60" : ""}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {showCheckbox && (
                  <div className="mt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <CompletionCheckbox
                      date={completionDateStr!}
                      itemType="workout"
                      sourceType="workout_plan"
                      sourceId={completionSourceId!}
                      itemKey="workout"
                      completed={!!completionCompleted}
                      onToggle={onCompletionToggle!}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{dayName}</span>
                  {actualDate && (
                    <span className="text-[11px] text-muted-foreground/50">{format(actualDate, "EEEE, MMM d, yyyy")}</span>
                  )}
                </div>
                <h3 className="text-base font-medium mt-1 leading-snug line-clamp-2" data-testid={`text-session-focus-${dayIndex}`}>
                  {session.focus}
                </h3>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <Badge className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${INTENSITY_COLORS[session.intensity] || ""}`} variant="secondary">
                    {session.intensity}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ModeIcon className="h-3 w-3" />
                    {session.mode}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {session.durationMinutes} min
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {session.main.length} exercises
                  </span>
                </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFeedback(sessionKey, feedbackState === "like" ? "neutral" : "like");
                  }}
                  className={`transition-colors duration-200 ${feedbackState === "like" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "text-muted-foreground/50"}`}
                  title={feedbackState === "like" ? "Remove like" : "Like this session"}
                  data-testid={`button-like-session-${dayIndex}`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFeedback(sessionKey, feedbackState === "dislike" ? "neutral" : "dislike");
                  }}
                  className={`transition-colors duration-200 ${feedbackState === "dislike" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "text-muted-foreground/50"}`}
                  title={feedbackState === "dislike" ? "Remove dislike" : "Dislike this session"}
                  data-testid={`button-dislike-session-${dayIndex}`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </Button>
                {onRegenerate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isRegenerating}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegenerate(dayIndex);
                    }}
                    className="text-muted-foreground/50"
                    title="Regenerate this session"
                    data-testid={`button-regen-session-${dayIndex}`}
                  >
                    {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  </Button>
                )}
                <ChevronDown className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 shrink-0 ml-1 ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 sm:px-5 pb-5 space-y-5">
            {session.warmup && session.warmup.length > 0 && (
              <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-md p-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Warm-up</h4>
                <ul className="space-y-1.5">
                  {session.warmup.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-blue-500 dark:text-blue-400 mt-0.5 shrink-0">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Main Workout</h4>
              <div className="divide-y divide-border/60">
                {session.main.map((ex, i) => (
                  <ExerciseRow
                    key={i}
                    exercise={ex}
                    index={i}
                    exercisePrefStatus={exercisePrefMap[exerciseToKey(ex.name)] || null}
                    onExercisePref={onExercisePref}
                  />
                ))}
              </div>
            </div>

            {session.finisher && session.finisher.length > 0 && (
              <div className="bg-orange-50/50 dark:bg-orange-950/20 rounded-md p-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Finisher</h4>
                <ul className="space-y-1.5">
                  {session.finisher.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Flame className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.cooldown && session.cooldown.length > 0 && (
              <div className="bg-sky-50/50 dark:bg-sky-950/20 rounded-md p-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cool-down</h4>
                <ul className="space-y-1.5">
                  {session.cooldown.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-sky-500 dark:text-sky-400 mt-0.5 shrink-0">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.coachingCues && session.coachingCues.length > 0 && (
              <div className="bg-muted/50 rounded-md p-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Coaching Tips</h4>
                <ul className="space-y-1.5">
                  {session.coachingCues.map((cue, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{cue}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function WorkoutView() {
  const { user, isLoading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const fromGoal = searchParams.get("from") === "goal";
  const goalId = searchParams.get("goalId");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: plan, isLoading } = useQuery<WorkoutPlan>({
    queryKey: ["/api/workout", id],
    enabled: !!user && !!id,
  });

  const completionStartDate = plan?.planStartDate || "2000-01-01";
  const completionEndDate = useMemo(() => {
    if (!plan?.planStartDate) return "2000-01-07";
    return format(addDays(new Date(plan.planStartDate + "T00:00:00"), 6), "yyyy-MM-dd");
  }, [plan?.planStartDate]);

  const { isCompleted, toggle: completionToggle } = useCompletions(
    completionStartDate,
    completionEndDate,
    !!user && !!plan?.planStartDate,
  );

  const scheduleMutation = useMutation({
    mutationFn: async (startDate: string | null) => {
      const res = await apiRequest("POST", `/api/workout/${id}/start-date`, { startDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      setShowDatePicker(false);
    },
    onError: () => {
      toast({ title: "Failed to update schedule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/workouts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workouts"] });
      toast({ title: "Workout plan deleted" });
      navigate("/plans");
    },
    onError: () => {
      toast({ title: "Failed to delete", variant: "destructive" });
    },
  });

  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);

  const regenSessionMutation = useMutation({
    mutationFn: async (dayIndex: number) => {
      const res = await apiRequest("POST", `/api/workout/${id}/regenerate-session`, { dayIndex });
      return res.json();
    },
    onMutate: (dayIndex) => {
      setRegeneratingDay(dayIndex);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/allowance"] });
      toast({ title: "Session regenerated" });
      setRegeneratingDay(null);
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to regenerate session";
      toast({ title: msg, variant: "destructive" });
      setRegeneratingDay(null);
    },
  });

  const handleRegenSession = useCallback((dayIndex: number) => {
    regenSessionMutation.mutate(dayIndex);
  }, [regenSessionMutation]);

  const { data: workoutFeedbackMap = {} } = useQuery<Record<string, "like" | "dislike">>({
    queryKey: ["/api/feedback/workout", id],
    enabled: !!user && !!id,
  });

  const [optimisticWFeedback, setOptimisticWFeedback] = useState<Record<string, "like" | "dislike" | null>>({});
  const mergedWFeedback = useMemo(() => {
    const m: Record<string, "like" | "dislike" | null> = { ...workoutFeedbackMap };
    for (const [k, v] of Object.entries(optimisticWFeedback)) {
      m[k] = v;
    }
    return m;
  }, [workoutFeedbackMap, optimisticWFeedback]);

  const workoutFeedbackMutation = useMutation({
    mutationFn: async (body: { workoutPlanId: string; sessionKey: string; feedback: "like" | "dislike" | "neutral" }) => {
      const res = await apiRequest("POST", "/api/feedback/workout", body);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/workout", id] });
    },
  });

  const handleWorkoutFeedback = (sessionKey: string, feedback: "like" | "dislike" | "neutral") => {
    if (feedback === "neutral") {
      setOptimisticWFeedback(prev => ({ ...prev, [sessionKey]: null }));
    } else {
      setOptimisticWFeedback(prev => ({ ...prev, [sessionKey]: feedback }));
    }
    workoutFeedbackMutation.mutate({ workoutPlanId: id!, sessionKey, feedback });
  };

  const { data: exercisePrefData } = useQuery<{ liked: any[]; disliked: any[]; avoided: any[] }>({
    queryKey: ["/api/preferences/exercise"],
    enabled: !!user,
  });

  const [optimisticExPrefs, setOptimisticExPrefs] = useState<Record<string, "liked" | "disliked" | "avoided" | null>>({});

  const exercisePrefMap = useMemo(() => {
    const map: Record<string, "liked" | "disliked" | "avoided"> = {};
    if (exercisePrefData) {
      for (const item of exercisePrefData.liked) map[item.exerciseKey] = "liked";
      for (const item of exercisePrefData.disliked) map[item.exerciseKey] = "disliked";
      for (const item of exercisePrefData.avoided) map[item.exerciseKey] = "avoided";
    }
    for (const [k, v] of Object.entries(optimisticExPrefs)) {
      if (v === null) {
        delete map[k];
      } else {
        map[k] = v;
      }
    }
    return map;
  }, [exercisePrefData, optimisticExPrefs]);

  const [avoidModalExercise, setAvoidModalExercise] = useState<{ key: string; name: string } | null>(null);

  const exercisePrefMutation = useMutation({
    mutationFn: async (body: { exerciseKey: string; exerciseName: string; status: "liked" | "disliked" | "avoided" }) => {
      await apiRequest("POST", "/api/preferences/exercise", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/exercise"] });
    },
    onError: (_err, variables) => {
      setOptimisticExPrefs(prev => { const next = { ...prev }; delete next[variables.exerciseKey]; return next; });
      toast({ title: "Failed to save exercise preference", variant: "destructive" });
    },
  });

  const exerciseDeletePrefMutation = useMutation({
    mutationFn: async (key: string) => {
      await apiRequest("DELETE", `/api/preferences/exercise/key/${encodeURIComponent(key)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/exercise"] });
    },
    onError: (_err, key) => {
      setOptimisticExPrefs(prev => { const next = { ...prev }; delete next[key]; return next; });
      toast({ title: "Failed to remove exercise preference", variant: "destructive" });
    },
  });

  const handleExercisePref = useCallback((exerciseKey: string, exerciseName: string, status: "liked" | "disliked" | "neutral") => {
    if (status === "neutral") {
      setOptimisticExPrefs(prev => ({ ...prev, [exerciseKey]: null }));
      exerciseDeletePrefMutation.mutate(exerciseKey);
      return;
    }
    if (status === "disliked") {
      setAvoidModalExercise({ key: exerciseKey, name: exerciseName });
      return;
    }
    setOptimisticExPrefs(prev => ({ ...prev, [exerciseKey]: "liked" }));
    exercisePrefMutation.mutate({ exerciseKey, exerciseName, status: "liked" });
  }, [exercisePrefMutation, exerciseDeletePrefMutation]);

  if (authLoading || isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!user) return null;

  if (!plan || !plan.planJson) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Workout plan not found</p>
          <Link href="/plans">
            <Button variant="outline" data-testid="button-back-plans">Back to Plans</Button>
          </Link>
        </div>
      </div>
    );
  }

  const planJson = plan.planJson as WorkoutPlanOutput;
  const prefs = plan.preferencesJson as any;
  const workoutDays = planJson.days.filter(d => d.isWorkoutDay);
  const restDays = planJson.days.filter(d => !d.isWorkoutDay);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {fromGoal && goalId && (
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          onClick={() => navigate(`/goals/${goalId}/ready`)}
          data-testid="button-back-to-goal"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Goal Summary
        </Button>
      )}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => window.print()} data-testid="button-print" title="Print workout plan">
              <Printer className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-menu">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowDatePicker(true)} data-testid="menu-schedule">
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  {plan.planStartDate ? "Reschedule" : "Schedule"}
                </DropdownMenuItem>
                {plan.planStartDate && (
                  <DropdownMenuItem onClick={() => scheduleMutation.mutate(null)} data-testid="menu-unschedule">
                    <CalendarMinus className="h-4 w-4 mr-2" />
                    Unschedule
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive" data-testid="menu-delete">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <h1 className="text-lg sm:text-xl font-semibold" data-testid="text-plan-title">
            {planJson.title}
          </h1>
          {(plan.adaptiveSnapshot as AdaptiveSnapshot | null)?.modifiers?.deloadWeek && (
            <Badge variant="secondary" size="sm" data-testid="badge-deload">
              <Shield className="h-3 w-3 mr-1" />
              Recovery Week
            </Badge>
          )}
          {(plan.adaptiveSnapshot as AdaptiveSnapshot | null)?.modifiers?.volumeMultiplier !== undefined &&
           (plan.adaptiveSnapshot as AdaptiveSnapshot).modifiers.volumeMultiplier > 1.05 &&
           !(plan.adaptiveSnapshot as AdaptiveSnapshot).modifiers.deloadWeek && (
            <Badge variant="default" size="sm" data-testid="badge-progression">
              <TrendingUp className="h-3 w-3 mr-1" />
              Progression
            </Badge>
          )}
        </div>
      </div>

      <div className="mb-6">
        <AllowancePanel />
      </div>

      {plan && (plan.adaptiveSnapshot as AdaptiveSnapshot | null) && (
        <div className="mb-6">
          <AdaptiveInsightsCard snapshot={plan.adaptiveSnapshot as AdaptiveSnapshot} planType="workout" />
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-plan-summary">{planJson.summary}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {plan.planStartDate && (
                <Badge variant="outline" className="text-xs" data-testid="badge-start-date">
                  <CalendarClock className="h-3 w-3 mr-1" />
                  Starts {plan.planStartDate}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {workoutDays.length} workout days
              </Badge>
              <Badge variant="outline" className="text-xs">
                {restDays.length} rest days
              </Badge>
            </div>

            <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" data-testid="button-toggle-settings">
                  <span className="text-xs">Plan Settings</span>
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${settingsOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
                  <div><span className="font-medium text-foreground/80">Goal:</span> {prefs?.goal?.replace("_", " ")}</div>
                  <div><span className="font-medium text-foreground/80">Location:</span> {prefs?.location?.replace("_", " ")}</div>
                  <div><span className="font-medium text-foreground/80">Mode:</span> {prefs?.trainingMode}</div>
                  <div><span className="font-medium text-foreground/80">Session:</span> {prefs?.sessionLength} min</div>
                  <div><span className="font-medium text-foreground/80">Level:</span> {prefs?.experienceLevel}</div>
                  <div><span className="font-medium text-foreground/80">Focus:</span> {prefs?.focusAreas?.join(", ")}</div>
                  {prefs?.limitations && <div className="col-span-2"><span className="font-medium text-foreground/80">Limitations:</span> {prefs.limitations}</div>}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {planJson.days.map((day) => {
            const restActualDate = plan.planStartDate
              ? (() => {
                  const start = new Date(plan.planStartDate + "T00:00:00");
                  const d = new Date(start);
                  d.setDate(d.getDate() + (day.dayIndex - 1));
                  return d;
                })()
              : null;

            if (!day.isWorkoutDay || !day.session) {
              return (
                <Card key={day.dayIndex} className="overflow-visible" data-testid={`card-rest-day-${day.dayIndex}`}>
                  <CardContent className="p-4 sm:p-5 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-xs font-medium text-muted-foreground">R</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-muted-foreground">{day.dayName}</p>
                        {restActualDate && (
                          <span className="text-xs text-muted-foreground/50">{format(restActualDate, "EEEE, MMM d, yyyy")}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/70">Rest Day</p>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            const sKey = `day${day.dayIndex}_${day.session.focus.toLowerCase().replace(/\s+/g, "_")}`;
            const dayDateStr = plan.planStartDate
              ? format(addDays(new Date(plan.planStartDate + "T00:00:00"), day.dayIndex - 1), "yyyy-MM-dd")
              : null;
            return (
              <SessionCard
                key={day.dayIndex}
                session={day.session}
                dayName={day.dayName}
                dayIndex={day.dayIndex}
                feedbackState={mergedWFeedback[sKey] || null}
                onFeedback={handleWorkoutFeedback}
                exercisePrefMap={exercisePrefMap}
                onExercisePref={handleExercisePref}
                planStartDate={plan.planStartDate}
                onRegenerate={handleRegenSession}
                isRegenerating={regeneratingDay === day.dayIndex}
                completionDateStr={dayDateStr}
                completionSourceId={String(plan.id)}
                completionCompleted={dayDateStr ? isCompleted(dayDateStr, "workout", "workout_plan", String(plan.id), "workout") : false}
                onCompletionToggle={completionToggle}
              />
            );
          })}
        </div>

        {planJson.progressionNotes && planJson.progressionNotes.length > 0 && (
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Progression Notes
              </h3>
              <ul className="space-y-2.5">
                {planJson.progressionNotes.map((note, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2 leading-relaxed">
                    <ChevronRight className="h-3 w-3 mt-1.5 text-primary shrink-0" />
                    {note}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!avoidModalExercise} onOpenChange={(open) => !open && setAvoidModalExercise(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Avoid this exercise?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You disliked <span className="font-medium text-foreground">{avoidModalExercise?.name}</span>. Would you like to completely avoid it in future workout plans?
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                if (avoidModalExercise) {
                  setOptimisticExPrefs(prev => ({ ...prev, [avoidModalExercise.key]: "disliked" }));
                  exercisePrefMutation.mutate({
                    exerciseKey: avoidModalExercise.key,
                    exerciseName: avoidModalExercise.name,
                    status: "disliked",
                  });
                }
                setAvoidModalExercise(null);
              }}
              data-testid="button-keep-disliked"
            >
              Just Dislike
            </Button>
            <Button
              variant="default"
              onClick={() => {
                if (avoidModalExercise) {
                  setOptimisticExPrefs(prev => ({ ...prev, [avoidModalExercise.key]: "avoided" }));
                  exercisePrefMutation.mutate({
                    exerciseKey: avoidModalExercise.key,
                    exerciseName: avoidModalExercise.name,
                    status: "avoided",
                  });
                  toast({ title: `${avoidModalExercise.name} will be avoided in future plans` });
                }
                setAvoidModalExercise(null);
              }}
              data-testid="button-avoid-exercise"
            >
              <Ban className="h-4 w-4 mr-1.5" />
              Avoid Completely
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Schedule Workout Plan</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={plan.planStartDate ? new Date(plan.planStartDate + "T00:00:00") : undefined}
              onSelect={(date) => {
                if (date) {
                  const dateStr = format(date, "yyyy-MM-dd");
                  scheduleMutation.mutate(dateStr);
                }
              }}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              data-testid="calendar-date-picker"
            />
          </div>
          {scheduleMutation.isPending && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Scheduling...</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workout Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the workout plan. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
