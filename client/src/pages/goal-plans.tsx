import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { GoalPlan } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target, Plus, Trash2, Loader2, UtensilsCrossed, Dumbbell,
  Flame, Zap, Heart, Trophy, CalendarDays,
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

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  body_recomposition: "Body Recomposition",
  general_fitness: "General Fitness",
  athletic_performance: "Athletic Performance",
  // legacy
  performance: "Athletic Performance",
  maintenance: "General Fitness",
  energy: "General Fitness",
  mobility: "General Fitness",
  endurance: "General Fitness",
  strength: "Muscle Gain",
};

const GOAL_ICONS: Record<string, typeof Flame> = {
  weight_loss: Flame,
  muscle_gain: Dumbbell,
  body_recomposition: Target,
  general_fitness: Target,
  athletic_performance: Trophy,
  // legacy
  performance: Trophy,
  maintenance: Heart,
  energy: Zap,
  mobility: Heart,
  endurance: Zap,
  strength: Dumbbell,
};

const GOAL_TITLE_PREFIXES: Record<string, string[]> = {
  weight_loss: ["Lean Start", "Cut Phase", "Slim Down"],
  muscle_gain: ["Build Phase", "Gain Mode", "Mass Drive"],
  body_recomposition: ["Recomp Phase", "Transform Mode", "Shape Shift"],
  general_fitness: ["Fresh Start", "New Chapter", "Kickoff"],
  athletic_performance: ["Peak Performance", "Level Up", "Go Mode"],
  // legacy
  performance: ["Peak Performance", "Level Up", "Go Mode"],
  maintenance: ["Steady State", "Stay Strong", "Balance"],
  energy: ["Energy Boost", "Power Up", "Recharge"],
  mobility: ["Flex Flow", "Move Better", "Limber Up"],
  endurance: ["Long Game", "Mile Maker", "Stay Going"],
  strength: ["Iron Path", "Power Phase", "Lift Off"],
};

function generateGoalTitle(goalType: string, startDate: string | null, index: number): string {
  const prefixes = GOAL_TITLE_PREFIXES[goalType] || GOAL_TITLE_PREFIXES["general_fitness"];
  return prefixes[index % prefixes.length];
}

export default function GoalPlans() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [sortAsc, setSortAsc] = useState(true);

  const { data: goalPlans, isLoading: goalLoading } = useQuery<GoalPlan[]>({
    queryKey: ["/api/goal-plans"],
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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">Wellness Plans</h1>
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
              <h2 className="font-semibold text-lg mb-2" data-testid="text-empty-title">No wellness plans yet</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Create a wellness plan to get personalized meal and workout plans aligned with your goals.
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
              const planType = gp.planType || "both";
              return (
                <Card key={gp.id} className="cursor-pointer transition-colors hover:border-primary/30" onClick={() => navigate(`/goals/${gp.id}`)} data-testid={`card-goal-${gp.id}`}>
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
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(gp.id); }}
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
                      {(planType === "both" || planType === "meal") && (
                        <div className="rounded-md border p-4">
                          <div className="flex items-center gap-2 text-sm font-medium mb-2">
                            <UtensilsCrossed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            Meal Plan
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {gp.mealPlanId ? "Included" : "Generating..."}
                          </p>
                        </div>
                      )}
                      {(planType === "both" || planType === "workout") && (
                        <div className="rounded-md border p-4">
                          <div className="flex items-center gap-2 text-sm font-medium mb-2">
                            <Dumbbell className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            Workout Plan
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {gp.workoutPlanId ? "Included" : "Generating..."}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t flex gap-2">
                      <Link href={`/check-ins?goalPlanId=${gp.id}`} onClick={(e: any) => e.stopPropagation()}>
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
    </div>
  );
}
