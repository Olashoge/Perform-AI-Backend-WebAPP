import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WeeklyCheckIn, GoalPlan } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Plus, Loader2, TrendingUp, TrendingDown, Minus,
  Zap, ClipboardCheck, CalendarDays, Target,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, parseISO } from "date-fns";

function getMonday(date: Date): string {
  const d = startOfWeek(date, { weekStartsOn: 1 });
  return format(d, "yyyy-MM-dd");
}

const ENERGY_LABELS = ["", "Very Low", "Low", "Moderate", "Good", "Great"];

export default function CheckIns() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/check-ins", goalPlanId || "all"] });
      setCreateOpen(false);
      resetForm();
      toast({ title: "Check-in saved" });
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

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [isLoading, user, navigate]);

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
            <Link href={goalPlanId ? "/goals" : "/plans"}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold text-base sm:text-lg">Weekly Check-ins</span>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-new-checkin">
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">New Check-in</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {currentGoal && (
          <Card className="mb-6">
            <CardContent className="p-4 flex items-center gap-3">
              <Target className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Tracking: {currentGoal.goalType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                {currentGoal.startDate && (
                  <p className="text-xs text-muted-foreground">Started {format(parseISO(currentGoal.startDate), "MMM d, yyyy")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {weightTrend && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm">
                {weightTrend.direction === "up" ? (
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                ) : weightTrend.direction === "down" ? (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                ) : (
                  <Minus className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">Weight Trend:</span>
                {weightTrend.direction === "flat" ? (
                  <span className="text-muted-foreground">Stable</span>
                ) : (
                  <span className={weightTrend.direction === "down" ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}>
                    {weightTrend.direction === "up" ? "+" : "-"}{weightTrend.diff.toFixed(1)} lbs
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {checkInsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-5 w-48 mb-2" /><Skeleton className="h-4 w-72" /></CardContent></Card>
            ))}
          </div>
        ) : !checkIns || checkIns.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <ClipboardCheck className="h-6 w-6 text-primary" />
              </div>
              <h2 className="font-semibold text-lg mb-1">No check-ins yet</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Log your weekly progress to track your transformation journey.
              </p>
              <Button onClick={() => setCreateOpen(true)} data-testid="button-create-first-checkin">
                <Plus className="h-4 w-4 mr-2" />
                Log Your First Check-in
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {checkIns.map((ci) => (
              <Card key={ci.id} data-testid={`card-checkin-${ci.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Week of {format(parseISO(ci.weekStartDate), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(ci.weightStart != null || ci.weightEnd != null) && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Weight</p>
                        <p className="text-sm font-medium">
                          {ci.weightStart != null && <span>{ci.weightStart}</span>}
                          {ci.weightStart != null && ci.weightEnd != null && <span> → </span>}
                          {ci.weightEnd != null && <span>{ci.weightEnd}</span>}
                        </p>
                      </div>
                    )}
                    {ci.energyRating != null && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Energy</p>
                        <div className="flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-yellow-500" />
                          <span className="text-sm font-medium">{ENERGY_LABELS[ci.energyRating] || ci.energyRating}/5</span>
                        </div>
                      </div>
                    )}
                    {ci.complianceMeals != null && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Meal Compliance</p>
                        <p className="text-sm font-medium">{ci.complianceMeals}%</p>
                      </div>
                    )}
                    {ci.complianceWorkouts != null && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Workout Compliance</p>
                        <p className="text-sm font-medium">{ci.complianceWorkouts}%</p>
                      </div>
                    )}
                  </div>

                  {ci.notes && (
                    <p className="text-sm text-muted-foreground mt-3 border-t pt-3">{ci.notes}</p>
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
          <div className="space-y-4">
            <div>
              <Label>Week Starting</Label>
              <Input
                type="date"
                value={weekStartDate}
                onChange={(e) => setWeekStartDate(e.target.value)}
                data-testid="input-week-start"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Weight Start (optional)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 180"
                  value={weightStart}
                  onChange={(e) => setWeightStart(e.target.value)}
                  data-testid="input-weight-start"
                />
              </div>
              <div>
                <Label>Weight End (optional)</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 179"
                  value={weightEnd}
                  onChange={(e) => setWeightEnd(e.target.value)}
                  data-testid="input-weight-end"
                />
              </div>
            </div>

            <div>
              <Label>Energy Level: {ENERGY_LABELS[energyRating]}</Label>
              <Slider
                value={[energyRating]}
                onValueChange={([v]) => setEnergyRating(v)}
                min={1}
                max={5}
                step={1}
                className="mt-2"
                data-testid="slider-energy"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Very Low</span>
                <span>Great</span>
              </div>
            </div>

            <div>
              <Label>Meal Plan Compliance: {complianceMeals}%</Label>
              <Slider
                value={[complianceMeals]}
                onValueChange={([v]) => setComplianceMeals(v)}
                min={0}
                max={100}
                step={5}
                className="mt-2"
                data-testid="slider-meals"
              />
            </div>

            <div>
              <Label>Workout Compliance: {complianceWorkouts}%</Label>
              <Slider
                value={[complianceWorkouts]}
                onValueChange={([v]) => setComplianceWorkouts(v)}
                min={0}
                max={100}
                step={5}
                className="mt-2"
                data-testid="slider-workouts"
              />
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="How did your week go? Any challenges or wins?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="textarea-notes"
              />
            </div>

            <div className="flex justify-end gap-2">
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
