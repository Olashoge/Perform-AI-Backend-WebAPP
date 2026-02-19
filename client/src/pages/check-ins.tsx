import { useState, useMemo } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WeeklyCheckIn, GoalPlan, PerformanceSummary } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  Plus, Loader2, TrendingUp, TrendingDown, Minus,
  Zap, ClipboardCheck, CalendarDays, Target,
  Activity, Flame, Shield, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, parseISO } from "date-fns";

function getMonday(date: Date): string {
  const d = startOfWeek(date, { weekStartsOn: 1 });
  return format(d, "yyyy-MM-dd");
}

const ENERGY_LABELS = ["", "Very Low", "Low", "Moderate", "Good", "Great"];

const MOMENTUM_CONFIG: Record<string, { label: string; icon: typeof Activity; className: string }> = {
  building: { label: "Building", icon: Flame, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  maintaining: { label: "Maintaining", icon: Shield, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  fatigue_risk: { label: "Fatigue Risk", icon: AlertTriangle, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  slipping: { label: "Slipping", icon: TrendingDown, className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function PerformanceSummaryCard({ summary }: { summary: PerformanceSummary }) {
  const momentum = MOMENTUM_CONFIG[summary.momentumState] || MOMENTUM_CONFIG.maintaining;
  const MomentumIcon = momentum.icon;
  const insights = (summary.insights || []) as string[];

  const scoreColor = summary.adherenceScore >= 80
    ? "text-emerald-600 dark:text-emerald-400"
    : summary.adherenceScore >= 60
    ? "text-blue-600 dark:text-blue-400"
    : "text-amber-600 dark:text-amber-400";

  return (
    <Card className="mb-6" data-testid="card-performance-summary">
      <CardContent className="p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="flex flex-col items-center min-w-[80px]">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Score</p>
            <span className={`text-4xl font-bold tabular-nums ${scoreColor}`} data-testid="text-adherence-score">
              {summary.adherenceScore}
            </span>
            <p className="text-[10px] text-muted-foreground mt-0.5">/ 100</p>
          </div>

          <div className="flex-1 min-w-[200px] space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${momentum.className} no-default-hover-elevate no-default-active-elevate`} data-testid="badge-momentum">
                <MomentumIcon className="h-3 w-3 mr-1" />
                {momentum.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Week of {format(parseISO(summary.weekStartDate), "MMM d")}
              </span>
            </div>

            <ul className="space-y-1.5">
              {insights.map((insight, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2" data-testid={`text-insight-${i}`}>
                  <span className="text-primary mt-1 flex-shrink-0">&#8226;</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>

            <div className="pt-2 border-t">
              <p className="text-sm italic text-foreground/80" data-testid="text-coach-statement">
                {summary.adjustmentStatement}
              </p>
            </div>

            {(summary.mealAdherencePct != null || summary.workoutAdherencePct != null) && (
              <div className="flex gap-4 pt-1 flex-wrap">
                {summary.mealAdherencePct != null && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Meals:</span>{" "}
                    <span className="tabular-nums">{Math.round(summary.mealAdherencePct)}%</span>
                  </div>
                )}
                {summary.workoutAdherencePct != null && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Workouts:</span>{" "}
                    <span className="tabular-nums">{Math.round(summary.workoutAdherencePct)}%</span>
                  </div>
                )}
                {summary.energyAvg != null && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Energy:</span>{" "}
                    <span className="tabular-nums">{Math.round(summary.energyAvg)}/100</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CheckIns() {
  const { user, isLoading } = useAuth();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const goalPlanId = params.get("goalPlanId") || undefined;
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const [weekStartDate, setWeekStartDate] = useState(getMonday(new Date()));
  const [weightStart, setWeightStart] = useState("");
  const [weightEnd, setWeightEnd] = useState("");
  const [energyRating, setEnergyRating] = useState(3);
  const [complianceMeals, setComplianceMeals] = useState(80);
  const [complianceWorkouts, setComplianceWorkouts] = useState(80);
  const [notes, setNotes] = useState("");

  const checkInUrl = goalPlanId ? `/api/check-ins?goalPlanId=${goalPlanId}` : "/api/check-ins";

  const { data: checkIns, isLoading: checkInsLoading } = useQuery<WeeklyCheckIn[]>({
    queryKey: ["/api/check-ins", goalPlanId || "all"],
    queryFn: async () => {
      const res = await fetch(checkInUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load check-ins");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: goalPlans } = useQuery<GoalPlan[]>({
    queryKey: ["/api/goal-plans"],
    enabled: !!user,
  });

  const { data: latestSummary, isLoading: summaryLoading } = useQuery<PerformanceSummary | null>({
    queryKey: ["/api/performance/latest"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        weekStartDate,
        energyRating,
        complianceMeals,
        complianceWorkouts,
      };
      if (goalPlanId) body.goalPlanId = goalPlanId;
      if (weightStart) body.weightStart = parseFloat(weightStart);
      if (weightEnd) body.weightEnd = parseFloat(weightEnd);
      if (notes.trim()) body.notes = notes.trim();
      const res = await apiRequest("POST", "/api/check-ins", body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/check-ins", goalPlanId || "all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/performance/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/performance"] });
      setCreateOpen(false);
      resetForm();
      if (data?.performanceSummary) {
        toast({
          title: "Check-in saved",
          description: `Adherence score: ${data.performanceSummary.adherenceScore}/100`,
        });
      } else {
        toast({ title: "Check-in saved" });
      }
    },
    onError: () => {
      toast({ title: "Failed to save check-in", variant: "destructive" });
    },
  });

  function resetForm() {
    setWeekStartDate(getMonday(new Date()));
    setWeightStart("");
    setWeightEnd("");
    setEnergyRating(3);
    setComplianceMeals(80);
    setComplianceWorkouts(80);
    setNotes("");
  }

  const currentGoal = useMemo(() => {
    if (!goalPlanId || !goalPlans) return null;
    return goalPlans.find(g => g.id === goalPlanId) || null;
  }, [goalPlanId, goalPlans]);

  const weightTrend = useMemo(() => {
    if (!checkIns || checkIns.length < 2) return null;
    const sorted = [...checkIns].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
    const recent = sorted.slice(-2);
    const w0 = recent[0].weightEnd || recent[0].weightStart;
    const w1 = recent[1].weightEnd || recent[1].weightStart;
    if (w0 == null || w1 == null) return null;
    const diff = w1 - w0;
    if (Math.abs(diff) < 0.1) return { direction: "flat" as const, diff: 0 };
    return { direction: diff > 0 ? "up" as const : "down" as const, diff: Math.abs(diff) };
  }, [checkIns]);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Weekly Check-ins</h1>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-checkin">
          <Plus className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline">New Check-in</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>
      <div>
        {summaryLoading ? (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex gap-5">
                <Skeleton className="h-16 w-20" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : latestSummary ? (
          <PerformanceSummaryCard summary={latestSummary} />
        ) : null}

        {currentGoal && (
          <Card className="mb-6">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Tracking: {currentGoal.goalType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                {currentGoal.startDate && (
                  <p className="text-xs text-muted-foreground mt-0.5">Started {format(parseISO(currentGoal.startDate), "MMM d, yyyy")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {weightTrend && (
          <Card className="mb-6">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{
                  backgroundColor: weightTrend.direction === "down" ? "hsl(var(--primary) / 0.1)" :
                    weightTrend.direction === "up" ? "hsl(30 100% 50% / 0.1)" : "hsl(var(--muted))"
                }}>
                  {weightTrend.direction === "up" ? (
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                  ) : weightTrend.direction === "down" ? (
                    <TrendingDown className="h-4 w-4 text-green-500" />
                  ) : (
                    <Minus className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <span className="font-semibold">Weight Trend</span>
                  <div className="mt-0.5">
                    {weightTrend.direction === "flat" ? (
                      <span className="text-muted-foreground text-xs">Stable</span>
                    ) : (
                      <span className={`text-xs font-medium ${weightTrend.direction === "down" ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                        {weightTrend.direction === "up" ? "+" : "-"}{weightTrend.diff.toFixed(1)} lbs
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {checkInsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-5 w-48 mb-3" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !checkIns || checkIns.length === 0 ? (
          <Card>
            <CardContent className="p-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <ClipboardCheck className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-semibold text-lg mb-2">No check-ins yet</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Log your weekly progress to track your transformation journey.
              </p>
              <Button onClick={() => setCreateOpen(true)} data-testid="button-create-first-checkin">
                <Plus className="h-4 w-4 mr-2" />
                Log Your First Check-in
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {checkIns.map((ci) => (
              <Card key={ci.id} data-testid={`card-checkin-${ci.id}`}>
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center gap-2.5 mb-4 pb-4 border-b">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-semibold">
                      Week of {format(parseISO(ci.weekStartDate), "MMM d, yyyy")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {(ci.weightStart != null || ci.weightEnd != null) && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Weight</p>
                        <p className="text-sm font-semibold tabular-nums">
                          {ci.weightStart != null && <span>{ci.weightStart}</span>}
                          {ci.weightStart != null && ci.weightEnd != null && <span className="text-muted-foreground mx-1">&rarr;</span>}
                          {ci.weightEnd != null && <span>{ci.weightEnd}</span>}
                        </p>
                      </div>
                    )}
                    {ci.energyRating != null && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Energy</p>
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-yellow-500" />
                          <span className="text-sm font-semibold">{ENERGY_LABELS[ci.energyRating] || ci.energyRating}/5</span>
                        </div>
                      </div>
                    )}
                    {ci.complianceMeals != null && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Meals</p>
                        <p className="text-sm font-semibold tabular-nums">{ci.complianceMeals}%</p>
                      </div>
                    )}
                    {ci.complianceWorkouts != null && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Workouts</p>
                        <p className="text-sm font-semibold tabular-nums">{ci.complianceWorkouts}%</p>
                      </div>
                    )}
                  </div>

                  {ci.notes && (
                    <p className="text-sm text-muted-foreground mt-4 pt-4 border-t leading-relaxed">{ci.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Weekly Check-in</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Week Starting</Label>
              <Input
                type="date"
                value={weekStartDate}
                onChange={(e) => setWeekStartDate(e.target.value)}
                data-testid="input-week-start"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Weight Start</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 180"
                  value={weightStart}
                  onChange={(e) => setWeightStart(e.target.value)}
                  data-testid="input-weight-start"
                />
                <p className="text-xs text-muted-foreground">Optional</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Weight End</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 179"
                  value={weightEnd}
                  onChange={(e) => setWeightEnd(e.target.value)}
                  data-testid="input-weight-end"
                />
                <p className="text-xs text-muted-foreground">Optional</p>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Energy Level</Label>
                <span className="text-xs font-medium text-primary">{ENERGY_LABELS[energyRating]}</span>
              </div>
              <Slider
                value={[energyRating]}
                onValueChange={([v]) => setEnergyRating(v)}
                min={1}
                max={5}
                step={1}
                data-testid="slider-energy"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Very Low</span>
                <span>Great</span>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Meal Compliance</Label>
                <span className="text-xs font-medium text-primary tabular-nums">{complianceMeals}%</span>
              </div>
              <Slider
                value={[complianceMeals]}
                onValueChange={([v]) => setComplianceMeals(v)}
                min={0}
                max={100}
                step={5}
                data-testid="slider-meals"
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Workout Compliance</Label>
                <span className="text-xs font-medium text-primary tabular-nums">{complianceWorkouts}%</span>
              </div>
              <Slider
                value={[complianceWorkouts]}
                onValueChange={([v]) => setComplianceWorkouts(v)}
                min={0}
                max={100}
                step={5}
                data-testid="slider-workouts"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Notes (optional)</Label>
              <Textarea
                placeholder="How did your week go? Any challenges or wins?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="textarea-notes"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-checkin">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                data-testid="button-submit-checkin"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Check-in
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
