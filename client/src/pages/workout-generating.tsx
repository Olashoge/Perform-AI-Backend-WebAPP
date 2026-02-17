import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Dumbbell, AlertCircle, RefreshCw, CheckCircle2, Circle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POLL_INTERVAL = 1500;
const TIMEOUT_MS = 2 * 60 * 1000;

const TIMELINE_STAGES = [
  { label: "Designing your workout split...", minSec: 0 },
  { label: "Selecting exercises...", minSec: 15 },
  { label: "Calibrating sets and reps...", minSec: 30 },
  { label: "Adding warm-up and cool-down...", minSec: 45 },
];

const TIPS = [
  "Rest days are just as important as workout days.",
  "Proper form prevents injuries and builds strength faster.",
  "Stay hydrated: aim for half your body weight in ounces of water daily.",
  "Progressive overload is the key to continuous improvement.",
  "Sleep 7-9 hours for optimal muscle recovery.",
  "A good warm-up reduces injury risk by up to 50%.",
  "Consistency beats intensity every time.",
  "Track your workouts to see your progress over time.",
];

export default function WorkoutGenerating() {
  const { user, isLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [status, setStatus] = useState<string>("generating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const startRef = useRef(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await apiRequest("GET", `/api/workout/${id}/status`);
      const data = await res.json();
      setStatus(data.status);
      if (data.status === "ready") {
        stopPolling();
        navigate(`/workout/${id}`, { replace: true });
      } else if (data.status === "failed") {
        stopPolling();
        setErrorMessage(data.errorMessage || "Generation failed");
      }
    } catch {
      // keep polling
    }
  }, [id, navigate, stopPolling]);

  useEffect(() => {
    if (!id || isLoading || !user) return;
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL);
    pollStatus();
    return stopPolling;
  }, [id, isLoading, user, pollStatus, stopPolling]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (elapsed * 1000 > TIMEOUT_MS && status === "generating") {
      stopPolling();
      setStatus("failed");
      setErrorMessage("Generation timed out. Please try again.");
    }
  }, [elapsed, status, stopPolling]);

  const currentStageIndex = TIMELINE_STAGES.reduce((acc, stage, i) => {
    if (elapsed >= stage.minSec) return i;
    return acc;
  }, 0);

  const progress = status === "ready" ? 100 : Math.min(95, (elapsed / 70) * 95);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-6">
          <div className="text-center space-y-3">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              {status === "failed" ? (
                <AlertCircle className="h-8 w-8 text-destructive" />
              ) : (
                <Dumbbell className="h-8 w-8 text-primary animate-pulse" />
              )}
            </div>
            <h1 className="text-xl font-semibold" data-testid="text-generating-title">
              {status === "failed" ? "Generation Failed" : "Building Your Workout Plan"}
            </h1>
            {status !== "failed" && (
              <p className="text-sm text-muted-foreground">
                This usually takes 30-60 seconds
              </p>
            )}
          </div>

          {status === "failed" ? (
            <Card>
              <CardContent className="p-5 sm:p-6 space-y-4 text-center">
                <p className="text-sm text-muted-foreground" data-testid="text-error-message">
                  {errorMessage || "Something went wrong"}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => navigate("/workouts/new")}
                    data-testid="button-try-again"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/plans")} data-testid="button-back-plans">
                    Back to Plans
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                  data-testid="progress-bar"
                />
              </div>

              <Card>
                <CardContent className="p-5 space-y-4">
                  {TIMELINE_STAGES.map((stage, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {i < currentStageIndex ? (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      ) : i === currentStageIndex ? (
                        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                      )}
                      <span className={`text-sm ${i < currentStageIndex ? "text-foreground" : i === currentStageIndex ? "text-foreground font-medium" : "text-muted-foreground/40"}`}>
                        {stage.label}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="bg-muted/40 rounded-md p-4 text-center">
                <p className="text-xs text-muted-foreground italic transition-opacity duration-500" data-testid="text-tip">
                  {TIPS[tipIndex]}
                </p>
              </div>
            </>
          )}
        </div>
    </div>
  );
}
