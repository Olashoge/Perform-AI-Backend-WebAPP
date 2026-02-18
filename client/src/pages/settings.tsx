import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { GoalPlan } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User, Target, Heart, ClipboardCheck, UtensilsCrossed, Dumbbell,
  Flame, Zap, Trophy, Settings, LogOut, ChevronRight, Sun, Moon, Monitor,
} from "lucide-react";

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  performance: "Performance",
  maintenance: "Maintenance",
  energy: "Energy & Focus",
  general_fitness: "General Fitness",
};

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

export default function SettingsPage() {
  const { user, logout, isLoading } = useAuth();
  const { preference, setPreference } = useTheme();
  const [, navigate] = useLocation();

  const { data: goalPlans } = useQuery<GoalPlan[]>({
    queryKey: ["/api/goal-plans"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [isLoading, user, navigate]);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const activeGoal = goalPlans?.find(g => !g.deletedAt);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-settings-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your profile and preferences</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <User className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Profile</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Email</div>
                <div className="text-sm font-medium" data-testid="text-user-email">{user.email}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <Target className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Active Goal</h2>
            </div>
            {activeGoal ? (
              <div className="space-y-4">
                <div>
                  <div className="text-base font-semibold">{GOAL_LABELS[activeGoal.goalType] || activeGoal.goalType}</div>
                </div>
                <Link href="/check-ins">
                  <Button className="w-full" data-testid="button-weekly-checkin">
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    Weekly Check-in
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">No active goal set</p>
                <Link href="/goals">
                  <Button variant="outline" size="sm" data-testid="button-create-goal">
                    <Target className="h-4 w-4 mr-2" />
                    Create Goal
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/preferences")}>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Heart className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="font-semibold text-base">Food Preferences</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Liked meals, avoided ingredients</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/preferences")}>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Dumbbell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="font-semibold text-base">Exercise Preferences</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Workout feedback, exercise settings</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <Sun className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Appearance</h2>
            </div>
            <div className="flex gap-2">
              {THEME_OPTIONS.map((opt) => {
                const isSelected = preference === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setPreference(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-md border transition-colors duration-150 ${
                      isSelected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover-elevate"
                    }`}
                    data-testid={`button-theme-${opt.value}`}
                  >
                    <opt.icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {preference === "system" && (
              <p className="text-xs text-muted-foreground mt-3">Matches your device settings.</p>
            )}
          </CardContent>
        </Card>

        <div className="pt-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { logout(); navigate("/"); }}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
