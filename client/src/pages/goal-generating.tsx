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

interface StageStatuses {
  TRAINING: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  NUTRITION: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  SCHEDULING: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  FINALIZING: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
}

interface GoalProgress {
  stage: string;
  stageStatuses: StageStatuses;
  errorMessage?: string;
}

interface GenerationStatus {
  goalPlanId: string;
  status: string;
  progress: GoalProgress | null;
  planType: string;
  mealPlan?: { id: string; status: string; errorMessage?: string } | null;
  workoutPlan?: { id: string; status: string; errorMessage?: string } | null;
}

const STAGE_ORDER: (keyof StageStatuses)[] = ["TRAINING", "NUTRITION", "SCHEDULING", "FINALIZING"];

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

  const activeSteps = STAGE_ORDER.filter(s => {
    if (s === "TRAINING") return hasWorkout;
    if (s === "NUTRITION") return hasMeal;
    return true;
  });

  const [visualStepIndex, setVisualStepIndex] = useState(0);
  const [visualDone, setVisualDone] = useState(false);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visualDone) return;
    const isLastStep = visualStepIndex >= activeSteps.length - 1;
    if (isLastStep) return;

    stepTimerRef.current = setTimeout(() => {
      setVisualStepIndex(prev => prev + 1);
    }, STEP_DURATION_MS);

    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, [visualStepIndex, visualDone, activeSteps.length]);

  const backendReady = status?.status === "ready";
  const backendFailed = status?.status === "failed";
  const backendDone = backendReady || backendFailed;

  useEffect(() => {
    if (!backendDone) return;
    const isLastStep = visualStepIndex >= activeSteps.length - 1;
    if (isLastStep) {
      setVisualDone(true);
    }
  }, [backendDone, visualStepIndex, activeSteps.length]);

  const displayedStatuses: StageStatuses = (() => {
    const result: StageStatuses = {
      TRAINING: hasWorkout ? "PENDING" : "SKIPPED",
      NUTRITION: hasMeal ? "PENDING" : "SKIPPED",
      SCHEDULING: "PENDING",
      FINALIZING: "PENDING",
    };

    for (let i = 0; i < activeSteps.length; i++) {
      const stage = activeSteps[i];
      if (i < visualStepIndex) {
        result[stage] = "DONE";
      } else if (i === visualStepIndex) {
        if (visualDone) {
          const backendStatus = status?.progress?.stageStatuses?.[stage];
          result[stage] = backendStatus === "FAILED" ? "FAILED" : "DONE";
          for (let j = i + 1; j < activeSteps.length; j++) {
            const laterStage = activeSteps[j];
            const laterBackend = status?.progress?.stageStatuses?.[laterStage];
            result[laterStage] = laterBackend === "FAILED" ? "FAILED" : "DONE";
          }
          break;
        } else {
          result[stage] = "RUNNING";
        }
      }
    }

    return result;
  })();

  const goalStatus = status?.status || "generating";
  const isComplete = goalStatus === "ready" || goalStatus === "failed";
  const isFailed = goalStatus === "failed";
  const isSuccess = goalStatus === "ready";

  const allDisplayDone = STAGE_ORDER.every(s => displayedStatuses[s] === "DONE" || displayedStatuses[s] === "SKIPPED" || displayedStatuses[s] === "FAILED");
  const allDone = isComplete && allDisplayDone;
  const allSuccess = isSuccess && allDisplayDone;
  const anyFailed = isFailed && allDisplayDone;

  const pollStatus = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiRequest("GET", `/api/goal-plans/${id}/generation-status`);
      const data: GenerationStatus = await res.json();
      setStatus(data);
    } catch {
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
      setError("Generation is taking longer than expected. You can check back on the Wellness Plans page.");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [elapsedSec, allDone]);

  useEffect(() => {
    if (allSuccess) {
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans"] });
    }
  }, [allSuccess]);

  const steps = [
    { label: "Designing your training plan...", icon: Dumbbell, stage: "TRAINING" as keyof StageStatuses },
    { label: "Designing your nutrition plan...", icon: UtensilsCrossed, stage: "NUTRITION" as keyof StageStatuses },
    { label: "Scheduling your week...", icon: CalendarCheck, stage: "SCHEDULING" as keyof StageStatuses },
    { label: "Finalizing...", icon: Sparkles, stage: "FINALIZING" as keyof StageStatuses },
  ].filter(s => displayedStatuses[s.stage] !== "SKIPPED");

  function getStepState(stage: keyof StageStatuses): "pending" | "active" | "done" | "failed" {
    const st = displayedStatuses[stage];
    if (st === "DONE") return "done";
    if (st === "RUNNING") return "active";
    if (st === "FAILED") return "failed";
    return "pending";
  }

  const progressPct = (() => {
    let done = 0;
    const total = steps.length;
    for (const s of steps) {
      const st = getStepState(s.stage);
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
          Back to Wellness Plans
        </Button>
      </div>
    );
  }

  if (anyFailed) {
    const progressData = status?.progress;
    const errorMsg = progressData?.errorMessage || "Something went wrong during generation.";
    const mealFailed = displayedStatuses.NUTRITION === "FAILED";
    const workoutFailed = displayedStatuses.TRAINING === "FAILED";
    const partialSuccess = (mealFailed && !workoutFailed) || (!mealFailed && workoutFailed);
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
            ? "One of your plans was created successfully, but the other failed. You can try again from the Wellness Plans page."
            : errorMsg}
        </p>
        <div className="space-y-2 mb-6">
          {hasMeal && (
            <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
              {mealFailed ? <AlertCircle className="h-4 w-4 text-destructive shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
              <UtensilsCrossed className="h-4 w-4 shrink-0" />
              <span>{mealFailed ? "Meal plan failed" : "Meal plan created"}</span>
            </div>
          )}
          {hasWorkout && (
            <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
              {workoutFailed ? <AlertCircle className="h-4 w-4 text-destructive shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
              <Dumbbell className="h-4 w-4 shrink-0" />
              <span>{workoutFailed ? "Workout plan failed" : "Workout plan created"}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Button onClick={() => navigate("/goals")} data-testid="button-back-to-goals">
            <Target className="h-4 w-4 mr-2" />
            View Wellness Plans
          </Button>
          <Button variant="outline" onClick={() => navigate("/goals/new")} data-testid="button-try-again">
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
        <h1 className="text-xl font-bold mb-2" data-testid="text-generation-complete">Your Wellness Plan is Ready!</h1>
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
      <h1 className="text-xl font-bold mb-1" data-testid="text-building-goal">Building Your Wellness Plan</h1>
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
            const state = getStepState(step.stage);
            const StepIcon = step.icon;
            return (
              <div key={i} className="flex items-center gap-3" data-testid={`step-${step.stage}`}>
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
