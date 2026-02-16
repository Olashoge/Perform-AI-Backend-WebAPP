import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
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
  ThumbsUp, ThumbsDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOAL_ICONS: Record<string, typeof Flame> = {
  fat_loss: Flame,
  muscle_gain: Dumbbell,
  energy: Zap,
  maintenance: Heart,
  performance: Trophy,
};

function generateMealFingerprint(mealName: string, cuisineTag: string, ingredients?: string[]): string {
  const slugify = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const namePart = slugify(mealName);
  const cuisinePart = slugify(cuisineTag);
  const keyIngredients = ["chicken", "beef", "pork", "fish", "salmon", "tuna", "shrimp", "turkey", "lamb", "tofu", "tempeh", "egg", "eggs", "beans", "lentils", "chickpeas", "milk", "cheese", "yogurt", "cream", "rice", "pasta", "bread", "quinoa", "oats", "avocado", "mushroom", "mushrooms"];
  let proteinPart = "none";
  if (ingredients && ingredients.length > 0) {
    const combined = ingredients.join(" ").toLowerCase();
    for (const key of keyIngredients) {
      if (combined.includes(key)) { proteinPart = key; break; }
    }
  }
  return `${namePart}|${cuisinePart}|${proteinPart}`;
}

function MealCard({ meal, dayIndex, mealType, planId, swapCount, feedbackState, onFeedback }: {
  meal: Meal;
  dayIndex: number;
  mealType: string;
  planId: string;
  swapCount: number;
  feedbackState?: "like" | "dislike" | null;
  onFeedback: (fingerprint: string, mealName: string, cuisineTag: string, feedback: "like" | "dislike", ingredients: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const fingerprint = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);

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
                    onFeedback(fingerprint, meal.name, meal.cuisineTag, "like", meal.ingredients);
                  }}
                  className={feedbackState === "like" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}
                  title="Like this meal"
                  data-testid={`button-like-${dayIndex}-${mealType}`}
                >
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFeedback(fingerprint, meal.name, meal.cuisineTag, "dislike", meal.ingredients);
                  }}
                  className={feedbackState === "dislike" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}
                  title="Dislike this meal"
                  data-testid={`button-dislike-${dayIndex}-${mealType}`}
                >
                  <ThumbsDown className="h-4 w-4" />
                </Button>
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

function DayCard({ day, planId, swapCount, regenDayCount, feedbackMap, onFeedback }: {
  day: Day;
  planId: string;
  swapCount: number;
  regenDayCount: number;
  feedbackMap: Record<string, "like" | "dislike">;
  onFeedback: (fingerprint: string, mealName: string, cuisineTag: string, feedback: "like" | "dislike", ingredients: string[]) => void;
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
        {(["breakfast", "lunch", "dinner"] as const).map((mealType) => {
          const fp = generateMealFingerprint(day.meals[mealType].name, day.meals[mealType].cuisineTag, day.meals[mealType].ingredients);
          return (
            <MealCard
              key={mealType}
              meal={day.meals[mealType]}
              dayIndex={day.dayIndex}
              mealType={mealType}
              planId={planId}
              swapCount={swapCount}
              feedbackState={feedbackMap[fp] || null}
              onFeedback={onFeedback}
            />
          );
        })}
      </div>
    </div>
  );
}

interface GroceryData {
  groceryList: { sections: { name: string; items: { item: string; quantity: string; notes?: string }[] }[] };
  pricing: { currency: string; assumptions: { note: string }; items: { itemKey: string; displayName: string; unitHint: string; estimatedRange: { min: number; max: number }; confidence: string }[] } | null;
  ownedItems: Record<string, boolean>;
  totals: { totalMin: number; totalMax: number; ownedAdjustedMin: number; ownedAdjustedMax: number };
}

function normalizeItemKeyClient(item: string): string {
  let key = item.toLowerCase().trim();
  key = key.replace(/[^\w\s]/g, "");
  key = key.replace(/^\d+[\s./]*\s*(cup|cups|tbsp|tsp|oz|lb|lbs|g|kg|ml|l|bunch|head|clove|cloves|can|cans|pkg|package|piece|pieces|slice|slices|dozen|x|each)\s*/i, "");
  key = key.replace(/\s+/g, " ").trim();
  return key;
}

function GroceryListView({ planId }: { planId: string }) {
  const { toast } = useToast();
  const [pollCount, setPollCount] = useState(0);

  const { data: groceryData, isLoading: groceryLoading } = useQuery<GroceryData>({
    queryKey: ["/api/plan", planId, "grocery"],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && !data.pricing && pollCount < 10) {
        setPollCount(c => c + 1);
        return 3000;
      }
      return false;
    },
  });

  const [localOwned, setLocalOwned] = useState<Record<string, boolean>>({});

  const mergedOwned: Record<string, boolean> = { ...(groceryData?.ownedItems || {}), ...localOwned };

  const ownedMutation = useMutation({
    mutationFn: async (body: { itemKey: string; isOwned: boolean }) => {
      const res = await apiRequest("POST", `/api/plan/${planId}/grocery/owned`, body);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plan", planId, "grocery"] });
    },
    onError: (_err, variables) => {
      setLocalOwned(prev => {
        const next = { ...prev };
        delete next[variables.itemKey];
        return next;
      });
    },
  });

  const regenGroceryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/plan/${planId}/grocery/regenerate`);
      return await res.json();
    },
    onSuccess: () => {
      setPollCount(0);
      queryClient.invalidateQueries({ queryKey: ["/api/plan", planId] });
      queryClient.invalidateQueries({ queryKey: ["/api/plan", planId, "grocery"] });
      toast({ title: "Grocery list updated" });
    },
    onError: () => {
      toast({ title: "Failed to regenerate grocery list", variant: "destructive" });
    },
  });

  const toggleOwned = (itemKey: string) => {
    const current = mergedOwned[itemKey] || false;
    const newVal = !current;
    setLocalOwned(prev => ({ ...prev, [itemKey]: newVal }));
    ownedMutation.mutate({ itemKey, isOwned: newVal });
  };

  const pricingMap: Record<string, { min: number; max: number }> = {};
  if (groceryData?.pricing?.items) {
    for (const pi of groceryData.pricing.items) {
      pricingMap[pi.itemKey] = pi.estimatedRange;
    }
  }

  const computedTotals = (() => {
    if (!groceryData?.pricing?.items) return groceryData?.totals || { totalMin: 0, totalMax: 0, ownedAdjustedMin: 0, ownedAdjustedMax: 0 };
    let totalMin = 0, totalMax = 0, adjMin = 0, adjMax = 0;
    for (const pi of groceryData.pricing.items) {
      totalMin += pi.estimatedRange.min;
      totalMax += pi.estimatedRange.max;
      if (!mergedOwned[pi.itemKey]) {
        adjMin += pi.estimatedRange.min;
        adjMax += pi.estimatedRange.max;
      }
    }
    return {
      totalMin: Math.round(totalMin * 100) / 100,
      totalMax: Math.round(totalMax * 100) / 100,
      ownedAdjustedMin: Math.round(adjMin * 100) / 100,
      ownedAdjustedMax: Math.round(adjMax * 100) / 100,
    };
  })();

  if (groceryLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const sections = groceryData?.groceryList?.sections || [];
  const hasPricing = !!groceryData?.pricing;

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

      {hasPricing ? (
        <Card data-testid="card-grocery-totals">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium">Estimated Total</span>
              <span className="text-sm font-semibold" data-testid="text-total-range">
                ${computedTotals.totalMin.toFixed(2)} – ${computedTotals.totalMax.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium">After Owned Items</span>
              <span className="text-sm font-semibold text-primary" data-testid="text-adjusted-range">
                ${computedTotals.ownedAdjustedMin.toFixed(2)} – ${computedTotals.ownedAdjustedMax.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-pricing-note">
              {groceryData?.pricing?.assumptions?.note || "Estimates vary by brand and store."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            {pollCount < 10 ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground" data-testid="text-pricing-loading">Estimating prices...</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground" data-testid="text-pricing-unavailable">Price estimates unavailable</span>
            )}
          </CardContent>
        </Card>
      )}

      {sections.map((section) => (
        <Card key={section.name}>
          <CardHeader className="pb-2">
            <h3 className="font-medium text-sm">{section.name}</h3>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5">
              {section.items.map((item, i) => {
                const itemKey = normalizeItemKeyClient(item.item);
                const isOwned = mergedOwned[itemKey] || false;
                const priceRange = pricingMap[itemKey];
                return (
                  <li key={`${section.name}-${i}`} className="flex items-start gap-2" data-testid={`grocery-item-${section.name.toLowerCase().replace(/\s+/g, "-")}-${i}`}>
                    <Checkbox
                      checked={isOwned}
                      onCheckedChange={() => toggleOwned(itemKey)}
                      className="mt-0.5"
                      data-testid={`checkbox-owned-${section.name.toLowerCase().replace(/\s+/g, "-")}-${i}`}
                    />
                    <div className={`flex-1 text-sm ${isOwned ? "line-through text-muted-foreground" : ""}`}>
                      <span className="font-medium">{item.item}</span>
                      <span className="text-muted-foreground"> — {item.quantity}</span>
                      {item.notes && <span className="text-xs text-muted-foreground ml-1">({item.notes})</span>}
                    </div>
                    <span className="text-xs shrink-0 tabular-nums text-muted-foreground" data-testid={`text-price-${section.name.toLowerCase().replace(/\s+/g, "-")}-${i}`}>
                      {isOwned ? "$0" : priceRange ? `$${priceRange.min.toFixed(2)}–$${priceRange.max.toFixed(2)}` : ""}
                    </span>
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
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<MealPlan>({
    queryKey: ["/api/plan", params.id],
    enabled: !!user && !!params.id,
  });

  const { data: feedbackMap = {} } = useQuery<Record<string, "like" | "dislike">>({
    queryKey: ["/api/feedback/plan", params.id],
    enabled: !!user && !!params.id,
  });

  const [optimisticFeedback, setOptimisticFeedback] = useState<Record<string, "like" | "dislike">>({});
  const mergedFeedback: Record<string, "like" | "dislike"> = { ...feedbackMap, ...optimisticFeedback };

  const feedbackMutation = useMutation({
    mutationFn: async (body: { planId: string; mealFingerprint: string; mealName: string; cuisineTag: string; feedback: "like" | "dislike"; ingredients: string[] }) => {
      const res = await apiRequest("POST", "/api/feedback/meal", body);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/plan", params.id] });
    },
  });

  const handleFeedback = (fingerprint: string, mealName: string, cuisineTag: string, feedback: "like" | "dislike", ingredients: string[]) => {
    setOptimisticFeedback(prev => ({ ...prev, [fingerprint]: feedback }));
    feedbackMutation.mutate({ planId: params.id!, mealFingerprint: fingerprint, mealName, cuisineTag, feedback, ingredients });
  };

  useEffect(() => {
    if (data && (data as any).status === "generating") {
      navigate(`/plan/${params.id}/generating`, { replace: true });
    }
  }, [data, params.id, navigate]);

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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
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
                    feedbackMap={mergedFeedback}
                    onFeedback={handleFeedback}
                  />
                ))}
              </TabsContent>

              <TabsContent value="grocery">
                <GroceryListView planId={params.id!} />
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
