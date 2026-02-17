import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GoalPlan, MealPlan, WorkoutPlan, PlanOutput, WorkoutPlanOutput } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Target, Plus, ArrowLeft, Trash2, Loader2, UtensilsCrossed, Dumbbell,
  Flame, Zap, Heart, Trophy, CalendarDays, Link2, Unlink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const GOAL_OPTIONS = [
  { value: "weight_loss", label: "Weight Loss", icon: Flame },
  { value: "muscle_gain", label: "Muscle Gain", icon: Dumbbell },
  { value: "performance", label: "Performance", icon: Trophy },
  { value: "maintenance", label: "Maintenance", icon: Heart },
  { value: "energy", label: "Energy & Focus", icon: Zap },
  { value: "general_fitness", label: "General Fitness", icon: Target },
];

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  performance: "Performance",
  maintenance: "Maintenance",
  energy: "Energy & Focus",
  general_fitness: "General Fitness",
};

const GOAL_ICONS: Record<string, typeof Flame> = {
  weight_loss: Flame,
  muscle_gain: Dumbbell,
  performance: Trophy,
  maintenance: Heart,
  energy: Zap,
  general_fitness: Target,
};

export default function GoalPlans() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState("weight_loss");
  const [selectedPlanType, setSelectedPlanType] = useState<"both" | "meal" | "workout">("both");
  const [startDate, setStartDate] = useState("");
  const [linkingPlanId, setLinkingPlanId] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<"meal" | "workout">("meal");

  const { data: goalPlans, isLoading: goalLoading } = useQuery<GoalPlan[]>({
    queryKey: ["/api/goal-plans"],
    enabled: !!user,
  });

  const { data: mealPlans } = useQuery<MealPlan[]>({
    queryKey: ["/api/plans"],
    enabled: !!user,
  });

  const { data: workoutPlans } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workouts"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/goal-plans", {
        goalType: selectedGoal,
        planTypes: selectedPlanType,
        startDate: startDate || undefined,
      });
      return res.json();
    },
    onSuccess: (data: GoalPlan) => {
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans"] });
      setCreateOpen(false);
      const navGoal = selectedGoal;
      const navDate = startDate;
      const navType = selectedPlanType;
      const goalParam = `?goal=${navGoal}${navDate ? `&startDate=${navDate}` : ""}&goalPlanId=${data.id}`;
      setSelectedGoal("weight_loss");
      setSelectedPlanType("both");
      setStartDate("");
      toast({ title: "Goal plan created! Now create your plans." });
      if (navType === "both") {
        navigate(`/new-plan${goalParam}&alsoWorkout=true`);
      } else if (navType === "meal") {
        navigate(`/new-plan${goalParam}`);
      } else {
        navigate(`/workouts/new${goalParam}`);
      }
    },
    onError: () => {
      toast({ title: "Failed to create goal plan", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/goal-plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans"] });
      toast({ title: "Goal plan removed" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ goalPlanId, planId, type }: { goalPlanId: string; planId: string; type: "meal" | "workout" }) => {
      const body = type === "meal" ? { mealPlanId: planId } : { workoutPlanId: planId };
      const res = await apiRequest("PATCH", `/api/goal-plans/${goalPlanId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans"] });
      setLinkingPlanId(null);
      toast({ title: "Plan linked" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ goalPlanId, type }: { goalPlanId: string; type: "meal" | "workout" }) => {
      const body = type === "meal" ? { mealPlanId: null } : { workoutPlanId: null };
      const res = await apiRequest("PATCH", `/api/goal-plans/${goalPlanId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans"] });
      toast({ title: "Plan unlinked" });
    },
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [isLoading, user, navigate]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const readyMealPlans = (mealPlans || []).filter(p => p.status === "ready" && !p.deletedAt);
  const readyWorkoutPlans = (workoutPlans || []).filter(p => p.status === "ready" && !p.deletedAt);

  function getMealPlanTitle(id: string | null) {
    if (!id) return null;
    const mp = readyMealPlans.find(p => p.id === id);
    if (!mp) return "Unknown Plan";
    const plan = mp.planJson as PlanOutput | null;
    return plan?.title || "Meal Plan";
  }

  function getWorkoutPlanTitle(id: string | null) {
    if (!id) return null;
    const wp = readyWorkoutPlans.find(p => p.id === id);
    if (!wp) return "Unknown Plan";
    const plan = wp.planJson as WorkoutPlanOutput | null;
    return plan?.title || "Workout Plan";
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/plans">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold text-base sm:text-lg tracking-tight">Goal Plans</span>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-goal">
            <Plus className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">New Goal</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {goalLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-3.5 w-56" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-20 rounded-md" />
                    <Skeleton className="h-20 rounded-md" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !goalPlans || goalPlans.length === 0 ? (
          <Card>
            <CardContent className="p-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-semibold text-lg mb-2">No goal plans yet</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Create a goal plan to link your meal and workout plans together for unified tracking.
              </p>
              <Button onClick={() => setCreateOpen(true)} data-testid="button-create-first-goal">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Goal
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {goalPlans.map((gp) => {
              const GoalIcon = GOAL_ICONS[gp.goalType] || Target;
              return (
                <Card key={gp.id} data-testid={`card-goal-${gp.id}`}>
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3 mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <GoalIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base" data-testid={`text-goal-type-${gp.id}`}>
                              {GOAL_LABELS[gp.goalType] || gp.goalType}
                            </h3>
                            <Badge variant="secondary">{GOAL_LABELS[gp.goalType] || gp.goalType}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                            <CalendarDays className="h-3 w-3" />
                            <span>Created {format(new Date(gp.createdAt), "MMM d, yyyy")}</span>
                            {gp.startDate && (
                              <span className="text-muted-foreground/60">&middot; Starts {format(new Date(gp.startDate + "T00:00:00"), "MMM d")}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(gp.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-goal-${gp.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-md border p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                            Meal Plan
                          </div>
                          {gp.mealPlanId ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => unlinkMutation.mutate({ goalPlanId: gp.id, type: "meal" })}
                              data-testid={`button-unlink-meal-${gp.id}`}
                            >
                              <Unlink className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          ) : null}
                        </div>
                        {gp.mealPlanId ? (
                          <Link href={`/plan/${gp.mealPlanId}`}>
                            <p className="text-sm text-primary hover:underline cursor-pointer font-medium" data-testid={`text-linked-meal-${gp.id}`}>
                              {getMealPlanTitle(gp.mealPlanId)}
                            </p>
                          </Link>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => { setLinkingPlanId(gp.id); setLinkType("meal"); }}
                            data-testid={`button-link-meal-${gp.id}`}
                          >
                            <Link2 className="h-3.5 w-3.5 mr-1.5" />
                            Link Meal Plan
                          </Button>
                        )}
                      </div>

                      <div className="rounded-md border p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Dumbbell className="h-4 w-4 text-muted-foreground" />
                            Workout Plan
                          </div>
                          {gp.workoutPlanId ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => unlinkMutation.mutate({ goalPlanId: gp.id, type: "workout" })}
                              data-testid={`button-unlink-workout-${gp.id}`}
                            >
                              <Unlink className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          ) : null}
                        </div>
                        {gp.workoutPlanId ? (
                          <Link href={`/workout/${gp.workoutPlanId}`}>
                            <p className="text-sm text-primary hover:underline cursor-pointer font-medium" data-testid={`text-linked-workout-${gp.id}`}>
                              {getWorkoutPlanTitle(gp.workoutPlanId)}
                            </p>
                          </Link>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => { setLinkingPlanId(gp.id); setLinkType("workout"); }}
                            data-testid={`button-link-workout-${gp.id}`}
                          >
                            <Link2 className="h-3.5 w-3.5 mr-1.5" />
                            Link Workout Plan
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t flex gap-2">
                      <Link href={`/check-ins?goalPlanId=${gp.id}`}>
                        <Button variant="outline" size="sm" data-testid={`button-checkins-${gp.id}`}>
                          Weekly Check-ins
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Goal Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Goal Type</Label>
              <Select value={selectedGoal} onValueChange={setSelectedGoal}>
                <SelectTrigger data-testid="select-goal-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_OPTIONS.map(g => (
                    <SelectItem key={g.value} value={g.value}>
                      <div className="flex items-center gap-2">
                        <g.icon className="h-4 w-4 text-muted-foreground" />
                        <span>{g.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">What would you like to create?</Label>
              <Select value={selectedPlanType} onValueChange={(v) => setSelectedPlanType(v as "both" | "meal" | "workout")}>
                <SelectTrigger data-testid="select-plan-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Meal Plan + Workout Plan</SelectItem>
                  <SelectItem value="meal">Meal Plan Only</SelectItem>
                  <SelectItem value="workout">Workout Plan Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Start Date (optional)</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                data-testid="input-goal-start-date"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-goal">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                data-testid="button-submit-goal"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Goal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkingPlanId} onOpenChange={(open) => { if (!open) setLinkingPlanId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link {linkType === "meal" ? "Meal" : "Workout"} Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {linkType === "meal" ? (
              readyMealPlans.length === 0 ? (
                <div className="text-center py-8">
                  <UtensilsCrossed className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No meal plans available. Create one first.</p>
                </div>
              ) : (
                readyMealPlans.map(mp => {
                  const plan = mp.planJson as PlanOutput | null;
                  return (
                    <Card
                      key={mp.id}
                      className="hover-elevate cursor-pointer"
                      onClick={() => linkingPlanId && linkMutation.mutate({ goalPlanId: linkingPlanId, planId: mp.id, type: "meal" })}
                      data-testid={`card-link-meal-${mp.id}`}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">{plan?.title || "Meal Plan"}</span>
                      </CardContent>
                    </Card>
                  );
                })
              )
            ) : (
              readyWorkoutPlans.length === 0 ? (
                <div className="text-center py-8">
                  <Dumbbell className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No workout plans available. Create one first.</p>
                </div>
              ) : (
                readyWorkoutPlans.map(wp => {
                  const plan = wp.planJson as WorkoutPlanOutput | null;
                  return (
                    <Card
                      key={wp.id}
                      className="hover-elevate cursor-pointer"
                      onClick={() => linkingPlanId && linkMutation.mutate({ goalPlanId: linkingPlanId, planId: wp.id, type: "workout" })}
                      data-testid={`card-link-workout-${wp.id}`}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Dumbbell className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">{plan?.title || "Workout Plan"}</span>
                      </CardContent>
                    </Card>
                  );
                })
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
