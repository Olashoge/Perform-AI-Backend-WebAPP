import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, Target, AlertCircle, RefreshCw, CheckCircle2, Circle,
  UtensilsCrossed, Dumbbell, CalendarCheck, Sparkles, ArrowLeft,
} from "lucide-react";

const POLL_INTERVAL = 2000;
const TIMEOUT_MS = 3 * 60 * 1000;
const STEP_DURATION_MS = 20_000;

const TIPS = [
  "Combining nutrition and training amplifies your results.",
  "Consistency beats perfection — small daily wins add up.",
  "Proper form prevents injuries and builds strength faster.",
  "Hydration is just as important as nutrition.",
  "Recovery days are when your muscles actually grow.",
  "A balanced meal plan fuels better workouts.",
  "Track your progress weekly to stay motivated.",
  "Sleep is the most underrated performance enhancer.",
];

interface GenerationStatus {
  goalPlanId: string;
  mealPlan?: { id: string; status: string; errorMessage?: string } | null;
  workoutPlan?: { id: string; status: string; errorMessage?: string } | null;
}

export default function GoalGenerating() {
  const { id } = useParams<{ id: string }>();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const hasMeal = searchParams.get("meal") === "true";
  const hasWorkout = searchParams.get("workout") === "true";

  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const startTimeRef = useRef(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [visualStep, setVisualStep] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backendMealStatus = status?.mealPlan?.status || (hasMeal ? "generating" : "none");
  const backendWorkoutStatus = status?.workoutPlan?.status || (hasWorkout ? "generating" : "none");
  const backendMealDone = !hasMeal || backendMealStatus === "ready" || backendMealStatus === "failed";
  const backendWorkoutDone = !hasWorkout || backendWorkoutStatus === "ready" || backendWorkoutStatus === "failed";
  const backendAllDone = backendMealDone && backendWorkoutDone;
  const backendMealFailed = hasMeal && backendMealStatus === "failed";
  const backendWorkoutFailed = hasWorkout && backendWorkoutStatus === "failed";
  const backendAnyFailed = backendMealFailed || backendWorkoutFailed;

  const VISUAL_STEP_COUNT = 4;

  useEffect(() => {
    if (visualStep < VISUAL_STEP_COUNT - 1) {
      stepTimerRef.current = setTimeout(() => {
        setVisualStep((s) => s + 1);
      }, STEP_DURATION_MS);
      return () => {
        if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      };
    }
  }, [visualStep]);

  const finalizingReady = visualStep >= VISUAL_STEP_COUNT - 1 && backendAllDone;
  const allDone = finalizingReady;
  const anyFailed = backendAnyFailed;
  const allSuccess = allDone && !anyFailed;

  const pollStatus = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiRequest("GET", `/api/goal-plans/${id}/generation-status`);
      const data: GenerationStatus = await res.json();
      setStatus(data);
    } catch {
      // ignore poll errors
    }
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    pollStatus();
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL);
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id, user, pollStatus]);

  useEffect(() => {
    if (allDone && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [allDone]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (elapsedSec * 1000 > TIMEOUT_MS && !allDone) {
      setError("Generation is taking longer than expected. You can check back on the Goals page.");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [elapsedSec, allDone]);

  useEffect(() => {
    if (allSuccess) {
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workouts"] });
    }
  }, [allSuccess]);

  const steps = [
    { label: "Designing your training plan...", icon: Dumbbell, index: 0 },
    { label: "Designing your nutrition plan...", icon: UtensilsCrossed, index: 1 },
    { label: "Scheduling your week...", icon: CalendarCheck, index: 2 },
    { label: "Finalizing...", icon: Sparkles, index: 3 },
  ];

  function getStepState(step: typeof steps[0]): "pending" | "active" | "done" | "failed" {
    if (step.index < visualStep) return "done";
    if (step.index === visualStep) {
      if (step.index === VISUAL_STEP_COUNT - 1) {
        if (backendAllDone && backendAnyFailed) return "failed";
        if (backendAllDone) return "done";
        return "active";
      }
      return "active";
    }
    return "pending";
  }

  const progressPct = (() => {
    let done = 0;
    const total = steps.length;
    for (const s of steps) {
      const st = getStepState(s);
      if (st === "done") done += 1;
      else if (st === "active") done += 0.5;
    }
    return Math.round((done / total) * 100);
  })();

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
          <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-xl font-bold mb-2">Taking Longer Than Expected</h1>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <Button onClick={() => navigate("/goals")} data-testid="button-back-to-goals">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Goals
        </Button>
      </div>
    );
  }

  if (anyFailed && allDone) {
    const mealErr = status?.mealPlan?.errorMessage;
    const workoutErr = status?.workoutPlan?.errorMessage;
    const partialSuccess = (backendMealFailed && !backendWorkoutFailed) || (!backendMealFailed && backendWorkoutFailed);
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="text-xl font-bold mb-2" data-testid="text-generation-failed">
          {partialSuccess ? "Partial Generation" : "Generation Failed"}
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {partialSuccess
            ? "One of your plans was created successfully, but the other failed. You can try again from the Goals page."
            : "Both plans failed to generate. Please try again."}
        </p>
        <div className="space-y-2 mb-6">
          {hasMeal && (
            <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
              {backendMealFailed ? <AlertCircle className="h-4 w-4 text-destructive shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
              <UtensilsCrossed className="h-4 w-4 shrink-0" />
              <span>{backendMealFailed ? `Meal plan failed${mealErr ? `: ${mealErr.slice(0, 80)}` : ""}` : "Meal plan created"}</span>
            </div>
          )}
          {hasWorkout && (
            <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
              {backendWorkoutFailed ? <AlertCircle className="h-4 w-4 text-destructive shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
              <Dumbbell className="h-4 w-4 shrink-0" />
              <span>{backendWorkoutFailed ? `Workout plan failed${workoutErr ? `: ${workoutErr.slice(0, 80)}` : ""}` : "Workout plan created"}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Button onClick={() => navigate("/goals")} data-testid="button-back-to-goals">
            <Target className="h-4 w-4 mr-2" />
            View Goals
          </Button>
          <Button variant="outline" onClick={() => navigate("/goals")} data-testid="button-try-again">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (allSuccess) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold mb-2" data-testid="text-generation-complete">Your Goal Plan is Ready!</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {hasMeal && hasWorkout
            ? "Both your nutrition and training plans have been created and linked to your goal."
            : hasMeal
            ? "Your nutrition plan has been created and linked to your goal."
            : "Your training plan has been created and linked to your goal."}
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={() => navigate(`/goals/${id}/ready`)} data-testid="button-view-goal">
            <Sparkles className="h-4 w-4 mr-2" />
            See Your Plan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Target className="h-7 w-7 text-primary animate-pulse" />
      </div>
      <h1 className="text-xl font-bold mb-1" data-testid="text-building-goal">Building Your Goal Plan</h1>
      <p className="text-sm text-muted-foreground mb-6">This usually takes 60-90 seconds</p>

      <div className="w-full bg-muted rounded-full h-2 mb-8 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-700"
          style={{ width: `${progressPct}%` }}
          data-testid="progress-bar"
        />
      </div>

      <Card className="text-left mb-6">
        <CardContent className="p-5 space-y-4">
          {steps.map((step, i) => {
            const state = getStepState(step);
            const StepIcon = step.icon;
            return (
              <div key={i} className="flex items-center gap-3" data-testid={`step-${step.index}`}>
                {state === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                ) : state === "active" ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                ) : state === "failed" ? (
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                )}
                <StepIcon className={`h-4 w-4 shrink-0 ${state === "done" ? "text-primary" : state === "active" ? "text-primary" : state === "failed" ? "text-destructive" : "text-muted-foreground/40"}`} />
                <span className={`text-sm ${state === "done" ? "text-foreground" : state === "active" ? "text-foreground font-medium" : state === "failed" ? "text-destructive" : "text-muted-foreground/60"}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="rounded-md bg-muted/50 px-4 py-3">
        <p className="text-sm text-primary/80 italic transition-opacity duration-500" data-testid="text-tip">
          {TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}
