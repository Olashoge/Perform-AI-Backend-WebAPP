import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { MealPlan, PlanOutput, Meal, Day } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UtensilsCrossed, ArrowLeft, ChevronDown, Clock, Users,
  RefreshCw, Loader2, Printer, ShoppingCart, ChefHat, Flame,
  AlertCircle, Zap, Dumbbell, Heart, Trophy, Activity,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOAL_ICONS: Record<string, typeof Flame> = {
  fat_loss: Flame,
  muscle_gain: Dumbbell,
  energy: Zap,
  maintenance: Heart,
  performance: Trophy,
};

function MealCard({ meal, dayIndex, mealType, planId, swapCount }: {
  meal: Meal;
  dayIndex: number;
  mealType: string;
  planId: string;
  swapCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const swapMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/plan/${planId}/swap`, { dayIndex, mealType });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plan", planId] });
      toast({ title: "Meal swapped successfully" });
    },
    onError: (err: Error) => {
      toast({
        title: "Swap failed",
        description: err.message?.includes("403") ? "You've used all 3 swaps for this plan." : "Failed to swap meal. Please try again.",
        variant: "destructive",
      });
    },
  });

  const mealTypeLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const mealTypeColors: Record<string, string> = {
    breakfast: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    lunch: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    dinner: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-visible">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${mealTypeColors[mealType] || ""}`}>
                    {mealTypeLabel}
                  </span>
                  <Badge variant="secondary">{meal.cuisineTag}</Badge>
                </div>
                <h3 className="font-medium text-sm" data-testid={`text-meal-name-${dayIndex}-${mealType}`}>{meal.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{meal.prepTimeMinutes} min</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{meal.servings} servings</span>
                  <span className="flex items-center gap-1"><Flame className="h-3 w-3" />{meal.nutritionEstimateRange.calories} cal</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    swapMutation.mutate();
                  }}
                  disabled={swapMutation.isPending || swapCount >= 3}
                  title={swapCount >= 3 ? "No swaps remaining" : "Swap this meal"}
                  data-testid={`button-swap-${dayIndex}-${mealType}`}
                >
                  {swapMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <p className="text-sm text-muted-foreground italic">{meal.whyItHelpsGoal}</p>

            <div>
              <h4 className="text-sm font-medium mb-2">Ingredients</h4>
              <ul className="space-y-1">
                {meal.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-1 shrink-0">&#8226;</span>
                    {ing}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Steps</h4>
              <ol className="space-y-2">
                {meal.steps.map((step, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Calories", value: meal.nutritionEstimateRange.calories },
                { label: "Protein", value: meal.nutritionEstimateRange.protein_g + "g" },
                { label: "Carbs", value: meal.nutritionEstimateRange.carbs_g + "g" },
                { label: "Fat", value: meal.nutritionEstimateRange.fat_g + "g" },
              ].map((n) => (
                <div key={n.label} className="text-center p-2 rounded-md bg-muted/50">
                  <div className="text-xs text-muted-foreground">{n.label}</div>
                  <div className="text-sm font-medium">{n.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DayCard({ day, planId, swapCount, regenDayCount }: {
  day: Day;
  planId: string;
  swapCount: number;
  regenDayCount: number;
}) {
  const { toast } = useToast();

  const regenDayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/plan/${planId}/regenerate-day`, { dayIndex: day.dayIndex });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plan", planId] });
      toast({ title: `${day.dayName} regenerated successfully` });
    },
    onError: (err: Error) => {
      toast({
        title: "Regeneration failed",
        description: err.message?.includes("403") ? "You've already used your day regeneration for this plan." : "Failed to regenerate day. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-lg" data-testid={`text-day-${day.dayIndex}`}>{day.dayName}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => regenDayMutation.mutate()}
          disabled={regenDayMutation.isPending || regenDayCount >= 1}
          title={regenDayCount >= 1 ? "No day regenerations remaining" : "Regenerate this day"}
          data-testid={`button-regen-day-${day.dayIndex}`}
        >
          {regenDayMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Regenerate Day
        </Button>
      </div>
      <div className="space-y-2">
        {(["breakfast", "lunch", "dinner"] as const).map((mealType) => (
          <MealCard
            key={mealType}
            meal={day.meals[mealType]}
            dayIndex={day.dayIndex}
            mealType={mealType}
            planId={planId}
            swapCount={swapCount}
          />
        ))}
      </div>
    </div>
  );
}

function GroceryListView({ plan, planId }: { plan: PlanOutput; planId: string }) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const regenGroceryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/plan/${planId}/grocery/regenerate`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plan", planId] });
      toast({ title: "Grocery list updated" });
    },
    onError: () => {
      toast({ title: "Failed to regenerate grocery list", variant: "destructive" });
    },
  });

  const toggleItem = (key: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          Grocery List
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => regenGroceryMutation.mutate()}
          disabled={regenGroceryMutation.isPending}
          data-testid="button-regen-grocery"
        >
          {regenGroceryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Rebuild List
        </Button>
      </div>
      {plan.groceryList.sections.map((section) => (
        <Card key={section.name}>
          <CardHeader className="pb-2">
            <h3 className="font-medium text-sm">{section.name}</h3>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5">
              {section.items.map((item, i) => {
                const key = `${section.name}-${i}`;
                const isChecked = checkedItems.has(key);
                return (
                  <li key={key} className="flex items-start gap-2">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleItem(key)}
                      className="mt-0.5"
                      data-testid={`checkbox-grocery-${section.name.toLowerCase()}-${i}`}
                    />
                    <div className={`text-sm ${isChecked ? "line-through text-muted-foreground" : ""}`}>
                      <span className="font-medium">{item.item}</span>
                      <span className="text-muted-foreground"> — {item.quantity}</span>
                      {item.notes && <span className="text-xs text-muted-foreground ml-1">({item.notes})</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PlanView() {
  const params = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();

  const { data, isLoading, error } = useQuery<MealPlan>({
    queryKey: ["/api/plan", params.id],
    enabled: !!user && !!params.id,
    refetchInterval: (query) => {
      const plan = query.state.data;
      if (plan && (plan as any).status === "generating") return 3000;
      return false;
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const planStatus = (data as any)?.status as string | undefined;
  const plan = planStatus === "ready" ? (data?.planJson as PlanOutput | undefined) : undefined;
  const swapCount = data?.swapCount ?? 0;
  const regenDayCount = data?.regenDayCount ?? 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 print:hidden">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Link href="/plans">
              <Button variant="ghost" size="icon" data-testid="button-back-plans">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <span className="font-semibold truncate">{plan?.title || "Meal Plan"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground hidden sm:block">
              Swaps: {swapCount}/3 | Regen: {regenDayCount}/1
            </div>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print">
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Print
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <PlanSkeleton />
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <h2 className="font-semibold text-lg mb-1">Failed to load plan</h2>
              <p className="text-sm text-muted-foreground">Please check the URL and try again.</p>
              <Link href="/plans">
                <Button variant="outline" className="mt-4">Back to Plans</Button>
              </Link>
            </CardContent>
          </Card>
        ) : planStatus === "generating" ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h2 className="font-semibold text-lg mb-2">Generating your meal plan</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Our AI is crafting your personalized 7-day meal plan. This usually takes 15-30 seconds.
              </p>
            </CardContent>
          </Card>
        ) : planStatus === "failed" ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <h2 className="font-semibold text-lg mb-1">Plan generation failed</h2>
              <p className="text-sm text-muted-foreground">Something went wrong while generating your plan.</p>
              <Link href="/new-plan">
                <Button variant="outline" className="mt-4" data-testid="button-try-again">Try Again</Button>
              </Link>
            </CardContent>
          </Card>
        ) : plan ? (
          <>
            <div className="mb-6">
              <p className="text-muted-foreground text-sm leading-relaxed">{plan.summary}</p>
              {plan.nutritionNotes && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10">
                  <Activity className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium">Daily targets: </span>
                    <span className="text-muted-foreground">
                      {plan.nutritionNotes.dailyMacroTargetsRange.calories} cal,{" "}
                      {plan.nutritionNotes.dailyMacroTargetsRange.protein_g}g protein,{" "}
                      {plan.nutritionNotes.dailyMacroTargetsRange.carbs_g}g carbs,{" "}
                      {plan.nutritionNotes.dailyMacroTargetsRange.fat_g}g fat
                    </span>
                  </div>
                </div>
              )}
            </div>

            <Tabs defaultValue="meals" className="space-y-4">
              <TabsList className="print:hidden">
                <TabsTrigger value="meals" data-testid="tab-meals">
                  <ChefHat className="h-4 w-4 mr-1.5" />
                  Meals
                </TabsTrigger>
                <TabsTrigger value="grocery" data-testid="tab-grocery">
                  <ShoppingCart className="h-4 w-4 mr-1.5" />
                  Grocery List
                </TabsTrigger>
              </TabsList>

              <TabsContent value="meals" className="space-y-8">
                {plan.days.map((day) => (
                  <DayCard
                    key={day.dayIndex}
                    day={day}
                    planId={params.id!}
                    swapCount={swapCount}
                    regenDayCount={regenDayCount}
                  />
                ))}
              </TabsContent>

              <TabsContent value="grocery">
                <GroceryListView plan={plan} planId={params.id!} />
              </TabsContent>
            </Tabs>

            {plan.batchPrepPlan && (
              <Card className="mt-8 print:break-before-page">
                <CardHeader className="pb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <ChefHat className="h-5 w-5 text-primary" />
                    Batch Prep Plan
                  </h2>
                  <p className="text-sm text-muted-foreground">Prep day: {plan.batchPrepPlan.prepDay}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Prep Steps</h4>
                    <ol className="space-y-1.5">
                      {plan.batchPrepPlan.steps.map((step, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2">Storage Tips</h4>
                    <ul className="space-y-1">
                      {plan.batchPrepPlan.storageTips.map((tip, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-primary">&#8226;</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
