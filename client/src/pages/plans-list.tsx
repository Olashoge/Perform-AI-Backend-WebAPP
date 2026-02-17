import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { MealPlan, PlanOutput, Preferences } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  UtensilsCrossed, Plus, CalendarDays, LogOut, Sparkles, Loader2,
  Flame, Dumbbell, Zap, Heart, Trophy, Settings,
} from "lucide-react";
import { format } from "date-fns";

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  fat_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  energy: "Energy",
  maintenance: "Maintenance",
  performance: "Performance",
};

const GOAL_ICONS: Record<string, typeof Flame> = {
  weight_loss: Flame,
  fat_loss: Flame,
  muscle_gain: Dumbbell,
  energy: Zap,
  maintenance: Heart,
  performance: Trophy,
};

export default function PlansList() {
  const { user, logout, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: plans, isLoading: plansLoading } = useQuery<MealPlan[]>({
    queryKey: ["/api/plans"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [isLoading, user, navigate]);

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
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <span className="font-semibold text-base sm:text-lg">My Plans</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="icon" onClick={() => { logout(); navigate("/"); }} data-testid="button-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Your Meal Plans</h1>
            <p className="text-sm text-muted-foreground mt-1">View and manage your AI-generated meal plans</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/calendar">
              <Button variant="outline" size="icon" className="sm:hidden" data-testid="button-calendar-mobile">
                <CalendarDays className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="hidden sm:inline-flex" data-testid="button-calendar">
                <CalendarDays className="h-4 w-4 mr-2" />
                Calendar
              </Button>
            </Link>
            <Link href="/preferences">
              <Button variant="outline" size="icon" className="sm:hidden" data-testid="button-preferences-mobile">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="hidden sm:inline-flex" data-testid="button-preferences">
                <Settings className="h-4 w-4 mr-2" />
                Preferences
              </Button>
            </Link>
            <Link href="/new-plan">
              <Button data-testid="button-create-plan">
                <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                New Plan
              </Button>
            </Link>
          </div>
        </div>

        {plansLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-72 mb-3" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : plans && plans.length > 0 ? (
          <div className="space-y-3">
            {plans.map((mp) => {
              const plan = mp.planJson as PlanOutput;
              const prefs = mp.preferencesJson as Preferences;
              const GoalIcon = GOAL_ICONS[prefs?.goal] || Heart;
              const status = (mp as any).status as string;
              return (
                <Link key={mp.id} href={`/plan/${mp.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-plan-${mp.id}`}>
                    <CardContent className="p-3 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate text-sm sm:text-base" data-testid={`text-plan-title-${mp.id}`}>
                            {status === "generating" ? "Generating..." : status === "failed" ? "Generation Failed" : plan?.title || "Meal Plan"}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {status === "generating" ? "Your meal plan is being generated by AI..." : status === "failed" ? "Something went wrong. Click to try again." : plan?.summary || "7-day personalized meal plan"}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {status === "generating" ? (
                              <Badge variant="secondary">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Generating
                              </Badge>
                            ) : status === "failed" ? (
                              <Badge variant="destructive">Failed</Badge>
                            ) : (
                              <Badge variant="secondary">
                                <GoalIcon className="h-3 w-3 mr-1" />
                                {GOAL_LABELS[prefs?.goal] || "Maintenance"}
                              </Badge>
                            )}
                            {prefs?.dietStyles && prefs.dietStyles.length > 0 && prefs.dietStyles[0] !== "No Preference" && (
                              <Badge variant="outline">{prefs.dietStyles.join(", ")}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {format(new Date(mp.createdAt), "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="font-semibold text-lg mb-1">No meal plans yet</h2>
              <p className="text-sm text-muted-foreground mb-4">Create your first AI-powered meal plan to get started.</p>
              <Link href="/new-plan">
                <Button data-testid="button-create-first-plan">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Plan
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
