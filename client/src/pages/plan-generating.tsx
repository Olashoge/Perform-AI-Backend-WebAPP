import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import type { MealPlan, Preferences } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, UtensilsCrossed, AlertCircle, RefreshCw, ListChecks, ChevronDown, CheckCircle2, Circle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POLL_INTERVAL = 1500;
const TIMEOUT_MS = 2 * 60 * 1000;

const TIMELINE_STAGES = [
  { label: "Building your meal plan...", minSec: 0 },
  { label: "Compiling your grocery list...", minSec: 20 },
  { label: "Estimating prices...", minSec: 40 },
  { label: "Syncing everything together...", minSec: 60 },
];

const TIPS = [
  "Batch prep saves time and money during the week.",
  "Frozen veggies are just as nutritious as fresh ones.",
  "Leftovers make great next-day lunches.",
  "Store herbs in a damp paper towel to keep them fresh longer.",
  "Buy in-season produce for the best prices.",
  "A well-stocked spice rack can transform simple ingredients.",
  "Meal prep containers help with portion control.",
  "Shopping with a list reduces impulse buys by up to 30%.",
];

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  energy: "Energy & Focus",
  maintenance: "Maintenance",
  performance: "Performance",
};

const PREP_LABELS: Record<string, string> = {
  cook_daily: "Cook Daily",
  batch_2day: "Batch Cook (2-day)",
  batch_3to4day: "Batch Cook (3-4 day)",
};

function PreferenceSummary({ prefs }: { prefs: Preferences | null }) {
  if (!prefs) return null;

  const dietStyles = prefs.dietStyles || [(prefs as any).dietStyle || "No Preference"];

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" data-testid="button-toggle-prefs-summary">
          <span className="text-xs">Your Preferences</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-muted/50 rounded-md p-3 mt-1 text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Goal:</span>
            <span className="font-medium">{GOAL_LABELS[prefs.goal] || prefs.goal}</span>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Cuisines:</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {dietStyles.map((s: string) => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Meals/Day:</span>
            <span className="font-medium">{prefs.mealsPerDay || 3}</span>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Household:</span>
            <span className="font-medium">{prefs.householdSize} {prefs.householdSize === 1 ? "person" : "people"}</span>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Prep:</span>
            <span className="font-medium">{PREP_LABELS[prefs.prepStyle] || prefs.prepStyle}</span>
          </div>
          {prefs.foodsToAvoid && prefs.foodsToAvoid.length > 0 && (
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <span className="text-muted-foreground shrink-0">Avoiding:</span>
              <span className="font-medium text-right">{prefs.foodsToAvoid.join(", ")}</span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function PlanGenerating() {
  const params = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [status, setStatus] = useState<"polling" | "timeout" | "failed" | "not_found">("polling");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(Date.now());

  const [elapsedSec, setElapsedSec] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const tipTimer = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length);
    }, 7000);
    return () => clearInterval(tipTimer);
  }, []);

  const currentStageIndex = TIMELINE_STAGES.reduce((acc, stage, idx) => {
    if (elapsedSec >= stage.minSec) return idx;
    return acc;
  }, 0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/plan/${params.id}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) {
          stopPolling();
          setStatus("not_found");
          return;
        }
        return;
      }
      const plan: MealPlan = await res.json();

      if (!preferences && plan.preferencesJson) {
        setPreferences(plan.preferencesJson as Preferences);
      }

      if (plan.status === "ready") {
        stopPolling();
        navigate(`/plan/${params.id}`, { replace: true });
      } else if (plan.status === "failed") {
        stopPolling();
        setStatus("failed");
        setErrorMessage((plan as any).errorMessage || null);
      }
    } catch {
    }
  }, [params.id, navigate, stopPolling, preferences]);

  const startPolling = useCallback(() => {
    stopPolling();
    setStatus("polling");
    startTimeRef.current = Date.now();
    setElapsedSec(0);

    fetchStatus();

    pollRef.current = setInterval(() => {
      fetchStatus();
    }, POLL_INTERVAL);

    timeoutRef.current = setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setStatus("timeout");
    }, TIMEOUT_MS);
  }, [fetchStatus, stopPolling]);

  useEffect(() => {
    if (!user || !params.id) return;
    startPolling();
    return () => stopPolling();
  }, [user, params.id, startPolling, stopPolling]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  const handleManualRefresh = () => {
    startPolling();
  };

  const handleRetry = async () => {
    if (!user) return;
    setIsRetrying(true);
    try {
      const planRes = await fetch(`/api/plan/${params.id}`, { credentials: "include" });
      if (!planRes.ok) {
        toast({ title: "Could not load plan details", variant: "destructive" });
        setIsRetrying(false);
        return;
      }
      const oldPlan: MealPlan = await planRes.json();
      const prefs = oldPlan.preferencesJson;
      const newKey = crypto.randomUUID();

      const res = await apiRequest("POST", "/api/plan", { ...prefs as any, idempotencyKey: newKey });
      const newPlan = await res.json();

      navigate(`/plan/${newPlan.id}/generating`, { replace: true });
    } catch (err: any) {
      toast({
        title: "Failed to retry",
        description: err.message?.includes("429") ? "Daily AI call limit reached. Try again tomorrow." : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const progressPercent = Math.min(95, Math.round((elapsedSec / 60) * 100));

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <span className="font-semibold">MealPlan AI</span>
          </div>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 py-16">
        {status === "polling" && (
          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" data-testid="spinner-generating" />
                <h2 className="font-semibold text-xl mb-1" data-testid="text-generating-title">
                  {TIMELINE_STAGES[currentStageIndex].label}
                </h2>
                <p className="text-sm text-muted-foreground">
                  This usually takes 45-60 seconds
                </p>
              </div>

              <div className="w-full bg-muted rounded-full h-2 overflow-hidden" data-testid="progress-bar">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="space-y-2" data-testid="timeline-stages">
                {TIMELINE_STAGES.map((stage, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    {idx < currentStageIndex ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : idx === currentStageIndex ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={idx <= currentStageIndex ? "text-foreground" : "text-muted-foreground/40"}>
                      {stage.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-muted/50 rounded-md p-3 text-center" data-testid="text-tip">
                <p className="text-xs text-muted-foreground italic transition-opacity duration-500">
                  Tip: {TIPS[tipIndex]}
                </p>
              </div>

              <PreferenceSummary prefs={preferences} />

              <div className="text-center">
                <Link href="/plans">
                  <Button variant="outline" size="sm" data-testid="link-view-plans">
                    <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                    View plans
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "timeout" && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-14 w-14 text-muted-foreground mx-auto mb-6" />
              <h2 className="font-semibold text-xl mb-2" data-testid="text-timeout-title">Still working...</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                This is taking longer than expected. You can refresh to check again, or come back later.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Button onClick={handleManualRefresh} data-testid="button-refresh">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Link href="/plans">
                  <Button variant="outline" data-testid="link-view-plans-timeout">
                    <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                    View plans
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "failed" && (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="h-14 w-14 text-destructive mx-auto mb-6" />
              <h2 className="font-semibold text-xl mb-2" data-testid="text-failed-title">Plan generation failed</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                {errorMessage || "Something went wrong while generating your plan. Please try again."}
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Button onClick={handleRetry} disabled={isRetrying} data-testid="button-try-again">
                  {isRetrying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Try again
                </Button>
                <Link href="/plans">
                  <Button variant="outline" data-testid="link-view-plans-failed">
                    <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                    View plans
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "not_found" && (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="h-14 w-14 text-destructive mx-auto mb-6" />
              <h2 className="font-semibold text-xl mb-2">Plan not found</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                This plan doesn't exist or you don't have access to it.
              </p>
              <Link href="/plans">
                <Button variant="outline">
                  <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                  View plans
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
