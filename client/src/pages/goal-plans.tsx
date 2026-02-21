import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GoalPlan, MealPlan, WorkoutPlan, PlanOutput, WorkoutPlanOutput } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Target, Plus, Trash2, Loader2, UtensilsCrossed, Dumbbell,
  Flame, Zap, Heart, Trophy, CalendarDays, Link2, Unlink,
  ArrowUpDown, Clock, CalendarCheck, Activity, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";

type GoalLifecycleStatus = "draft" | "scheduled" | "active" | "completed";

function deriveGoalStatus(startDate: string | null | undefined): GoalLifecycleStatus {
  if (!startDate) return "draft";
  const start = new Date(startDate + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  if (today < start) return "scheduled";
  if (today < end) return "active";
  return "completed";
}

const GOAL_STATUS_CONFIG: Record<GoalLifecycleStatus, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground", icon: Clock },
  scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: CalendarCheck },
  active: { label: "Active", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: Activity },
  completed: { label: "Completed", className: "bg-muted text-muted-foreground", icon: CheckCircle2 },
};

function GoalStatusBadge({ startDate }: { startDate: string | null | undefined }) {
  const status = deriveGoalStatus(startDate);
  const config = GOAL_STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge size="sm" variant="secondary" className={`no-default-hover-elevate no-default-active-elevate ${config.className}`} data-testid={`badge-goal-status-${status}`}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}

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

const GOAL_TITLE_PREFIXES: Record<string, string[]> = {
  weight_loss: ["Lean Start", "Cut Phase", "Slim Down"],
  muscle_gain: ["Strength Sprint", "Build Phase", "Gain Mode"],
  performance: ["Peak Performance", "Level Up", "Go Mode"],
  maintenance: ["Steady State", "Stay Strong", "Balance"],
  energy: ["Energy Boost", "Power Up", "Recharge"],
  general_fitness: ["Fresh Start", "New Chapter", "Kickoff"],
  mobility: ["Flex Flow", "Move Better", "Limber Up"],
  endurance: ["Long Game", "Mile Maker", "Stay Going"],
  strength: ["Iron Path", "Power Phase", "Lift Off"],
};

function generateGoalTitle(goalType: string, startDate: string | null, index: number): string {
  const prefixes = GOAL_TITLE_PREFIXES[goalType] || GOAL_TITLE_PREFIXES["general_fitness"];
  const prefix = prefixes[index % prefixes.length];
  if (startDate) {
    const datePart = format(new Date(startDate + "T00:00:00"), "MMM d");
    return `${prefix} · ${datePart}`;
  }
  return prefix;
}

export default function GoalPlans() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [linkingPlanId, setLinkingPlanId] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<"meal" | "workout">("meal");
  const [sortAsc, setSortAsc] = useState(true);

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

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      setDeletingId(id);
      await apiRequest("DELETE", `/api/goal-plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goal-plans"] });
      toast({ title: "Wellness plan removed" });
      setDeletingId(null);
    },
    onError: () => {
      setDeletingId(null);
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

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
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
    <div className="px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Wellness Plans</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSortAsc(prev => !prev)}
            data-testid="button-sort-toggle"
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          <Link href="/goals/new">
            <Button data-testid="button-create-goal">
              <Plus className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">New Wellness Plan</span>
              <span className="sm:hidden">New</span>
            </Button>
          </Link>
        </div>
      </div>
      <div>
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
              <h2 className="font-semibold text-lg mb-2">No wellness plans yet</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Create a wellness plan to link your meal and workout plans together for unified tracking.
              </p>
              <Link href="/goals/new">
                <Button data-testid="button-create-first-goal">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Wellness Plan
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {[...goalPlans].sort((a, b) => {
              const dateA = a.startDate ? new Date(a.startDate + "T00:00:00").getTime() : 0;
              const dateB = b.startDate ? new Date(b.startDate + "T00:00:00").getTime() : 0;
              if (dateA && dateB) return sortAsc ? dateA - dateB : dateB - dateA;
              if (dateA) return -1;
              if (dateB) return 1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }).map((gp, idx) => {
              const GoalIcon = GOAL_ICONS[gp.goalType] || Target;
              const goalTitle = generateGoalTitle(gp.goalType, gp.startDate, idx);
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
                              {goalTitle}
                            </h3>
                            <Badge variant="secondary">{GOAL_LABELS[gp.goalType] || gp.goalType}</Badge>
                            <GoalStatusBadge startDate={gp.startDate} />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                            <CalendarDays className="h-3 w-3" />
                            {gp.startDate ? (
                              <span>
                                {format(new Date(gp.startDate + "T00:00:00"), "MMM d")} – {format(addDays(new Date(gp.startDate + "T00:00:00"), 6), "MMM d, yyyy")}
                              </span>
                            ) : (
                              <span>Created {format(new Date(gp.createdAt), "MMM d, yyyy")}</span>
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
                        {deletingId === gp.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        )}
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
