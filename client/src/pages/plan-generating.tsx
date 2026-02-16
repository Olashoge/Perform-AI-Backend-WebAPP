import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import type { MealPlan } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, UtensilsCrossed, AlertCircle, RefreshCw, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POLL_INTERVAL = 1500;
const TIMEOUT_MS = 2 * 60 * 1000;

export default function PlanGenerating() {
  const params = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [status, setStatus] = useState<"polling" | "timeout" | "failed" | "not_found">("polling");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(Date.now());

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
  }, [params.id, navigate, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    setStatus("polling");
    startTimeRef.current = Date.now();

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
            <CardContent className="p-12 text-center">
              <Loader2 className="h-14 w-14 animate-spin text-primary mx-auto mb-6" data-testid="spinner-generating" />
              <h2 className="font-semibold text-xl mb-2" data-testid="text-generating-title">Generating your plan...</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                This can take ~10-20 seconds. We're crafting a personalized 7-day meal plan with recipes and a grocery list.
              </p>
              <Link href="/plans">
                <Button variant="outline" size="sm" data-testid="link-view-plans">
                  <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                  View plans
                </Button>
              </Link>
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
