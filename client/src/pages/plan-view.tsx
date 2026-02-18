import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UtensilsCrossed, ChevronDown, Clock, Users,
  RefreshCw, Loader2, Printer, ShoppingCart, ChefHat, Flame,
  AlertCircle, Zap, Dumbbell, Heart, Trophy, Activity,
  ThumbsUp, ThumbsDown, CalendarIcon, MoreVertical, Trash2,
  CalendarPlus, CalendarMinus, CalendarClock, ArrowLeft,
  Repeat, RotateCcw, Timer, Sparkles, Gift, Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const GOAL_ICONS: Record<string, typeof Flame> = {
  weight_loss: Flame,
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
  onFeedback: (fingerprint: string, mealName: string, cuisineTag: string, feedback: "like" | "dislike" | "neutral", ingredients: string[]) => void;
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
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/workouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/allowance/current", planId] });
      toast({ title: "Meal swapped successfully" });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/allowance/current", planId] });
      toast({
        title: "Swap failed",
        description: err.message?.includes("403") ? "You've used all your swaps for today." : "Failed to swap meal. Please try again.",
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
          <CardHeader className="cursor-pointer hover-elevate p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${mealTypeColors[mealType] || ""}`}>
                    {mealTypeLabel}
                  </span>
                  <Badge variant="secondary">{meal.cuisineTag}</Badge>
                </div>
                <h3 className="font-medium text-base" data-testid={`text-meal-name-${dayIndex}-${mealType}`}>{meal.name}</h3>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{meal.prepTimeMinutes}m</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{meal.servings}</span>
                  <span className="text-border">|</span>
                  <span className="flex items-center gap-1"><Flame className="h-3 w-3" />{meal.nutritionEstimateRange.calories} cal</span>
                  <span className="text-border">|</span>
                  <span>{meal.nutritionEstimateRange.protein_g}g P</span>
                  <span className="text-border">|</span>
                  <span>{meal.nutritionEstimateRange.carbs_g}g C</span>
                  <span className="text-border">|</span>
                  <span>{meal.nutritionEstimateRange.fat_g}g F</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFeedback(fingerprint, meal.name, meal.cuisineTag, feedbackState === "like" ? "neutral" : "like", meal.ingredients);
                  }}
                  className={`transition-colors duration-200 ${feedbackState === "like" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "text-muted-foreground"}`}
                  title={feedbackState === "like" ? "Remove like" : "Like this meal"}
                  data-testid={`button-like-${dayIndex}-${mealType}`}
                >
                  <ThumbsUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFeedback(fingerprint, meal.name, meal.cuisineTag, feedbackState === "dislike" ? "neutral" : "dislike", meal.ingredients);
                  }}
                  className={`transition-colors duration-200 ${feedbackState === "dislike" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400" : "text-muted-foreground"}`}
                  title={feedbackState === "dislike" ? "Remove dislike" : "Dislike this meal"}
                  data-testid={`button-dislike-${dayIndex}-${mealType}`}
                >
                  <ThumbsDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
                  {swapMutation.isPending ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                </Button>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4 px-4 sm:px-5 pb-4 sm:pb-5">
            <p className="text-sm text-muted-foreground italic">{meal.whyItHelpsGoal}</p>

            <div>
              <h4 className="text-sm font-medium mb-2">Ingredients</h4>
              <ul className="space-y-1.5">
                {meal.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5 shrink-0">&#8226;</span>
                    {ing}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Steps</h4>
              <ol className="space-y-3">
                {meal.steps.map((step, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2.5">
                    <span className="text-primary font-medium shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/50 text-sm flex-wrap">
              <span><span className="text-muted-foreground">Cal</span> <span className="font-medium">{meal.nutritionEstimateRange.calories}</span></span>
              <span className="text-border">|</span>
              <span><span className="text-muted-foreground">Protein</span> <span className="font-medium">{meal.nutritionEstimateRange.protein_g}g</span></span>
              <span className="text-border">|</span>
              <span><span className="text-muted-foreground">Carbs</span> <span className="font-medium">{meal.nutritionEstimateRange.carbs_g}g</span></span>
              <span className="text-border">|</span>
              <span><span className="text-muted-foreground">Fat</span> <span className="font-medium">{meal.nutritionEstimateRange.fat_g}g</span></span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DayCard({ day, planId, swapCount, regenDayCount, feedbackMap, onFeedback, planStartDate }: {
  day: Day;
  planId: string;
  swapCount: number;
  regenDayCount: number;
  feedbackMap: Record<string, "like" | "dislike" | null>;
  onFeedback: (fingerprint: string, mealName: string, cuisineTag: string, feedback: "like" | "dislike" | "neutral", ingredients: string[]) => void;
  planStartDate?: string | null;
}) {
  const { toast } = useToast();

  const regenDayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/plan/${planId}/regenerate-day`, { dayIndex: day.dayIndex });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plan", planId] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/workouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/allowance/current", planId] });
      toast({ title: `${day.dayName} regenerated successfully` });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/allowance/current", planId] });
      toast({
        title: "Regeneration failed",
        description: err.message?.includes("403") ? "You've reached the regen limit. Check your budget panel." : "Failed to regenerate day. Please try again.",
        variant: "destructive",
      });
    },
  });

  const actualDate = planStartDate
    ? (() => {
        const start = new Date(planStartDate + "T00:00:00");
        const d = new Date(start);
        d.setDate(d.getDate() + (day.dayIndex - 1));
        return d;
      })()
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold text-lg" data-testid={`text-day-${day.dayIndex}`}>{day.dayName}</h2>
          {actualDate && (
            <span className="text-sm text-muted-foreground" data-testid={`text-day-date-${day.dayIndex}`}>
              {format(actualDate, "EEEE, MMM d, yyyy")}
            </span>
          )}
        </div>
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
          const meal = day.meals[mealType];
          if (!meal) return null;
          const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
          return (
            <MealCard
              key={mealType}
              meal={meal}
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
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
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
          <CardContent className="p-4 sm:p-5 space-y-2">
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
          <CardContent className="p-4 sm:p-5 flex items-center gap-2">
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
          <CardHeader className="p-4 sm:p-5 pb-2">
            <h3 className="font-medium text-sm">{section.name}</h3>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border/50">
              {section.items.map((item, i) => {
                const itemKey = normalizeItemKeyClient(item.item);
                const isOwned = mergedOwned[itemKey] || false;
                const priceRange = pricingMap[itemKey];
                return (
                  <li key={`${section.name}-${i}`} className="flex items-center gap-3 p-3" data-testid={`grocery-item-${section.name.toLowerCase().replace(/\s+/g, "-")}-${i}`}>
                    <Checkbox
                      checked={isOwned}
                      onCheckedChange={() => toggleOwned(itemKey)}
                      className="shrink-0"
                      data-testid={`checkbox-owned-${section.name.toLowerCase().replace(/\s+/g, "-")}-${i}`}
                    />
                    <div className={`flex-1 min-w-0 text-sm ${isOwned ? "line-through text-muted-foreground" : ""}`}>
                      <span className="font-medium break-words">{item.item}</span>
                      <span className="text-muted-foreground"> — {item.quantity}</span>
                      {item.notes && <span className="text-xs text-muted-foreground ml-1">({item.notes})</span>}
                    </div>
                    <span className="text-xs shrink-0 tabular-nums text-muted-foreground/70" data-testid={`text-price-${section.name.toLowerCase().replace(/\s+/g, "-")}-${i}`}>
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
          <CardContent className="p-4 sm:p-5 space-y-3">
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

interface AllowanceStateData {
  goalPlanId: string;
  allowanceId: string;
  today: {
    mealSwapsUsed: number;
    mealSwapsLimit: number;
    mealRegensUsed: number;
    mealRegensLimit: number;
  };
  plan: {
    regensUsed: number;
    regensLimit: number;
  };
  cooldown: {
    active: boolean;
    minutesRemaining: number;
  };
  flexTokensAvailable: number;
  coachInsight: string | null;
}

function AllowanceCounter({ used, limit, icon: Icon, label }: { used: number; limit: number; icon: typeof Repeat; label: string }) {
  const remaining = Math.max(0, limit - used);
  const ratio = limit > 0 ? used / limit : 0;
  const barColor = ratio >= 1 ? "bg-destructive" : ratio >= 0.75 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </div>
        <span className="text-xs font-medium tabular-nums" data-testid={`text-allowance-${label.toLowerCase().replace(/\s/g, "-")}`}>
          {remaining}/{limit}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function AllowancePanel({ planId }: { planId: string }) {
  const { data: allowanceState, isLoading } = useQuery<AllowanceStateData | null>({
    queryKey: ["/api/allowance/current", planId],
    queryFn: async () => {
      const res = await fetch(`/api/allowance/current?mealPlanId=${planId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60000,
  });
  const { toast } = useToast();

  const redeemMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/allowance/redeem-flex-token");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/allowance/current", planId] });
      toast({ title: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "Redeem failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !allowanceState) return null;

  const a = allowanceState;

  return (
    <Card className="overflow-visible" data-testid="card-allowance-panel">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium">Today's Budget</span>
          </div>
          {a.cooldown.active && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-xs" data-testid="badge-cooldown">
                  <Timer className="h-3 w-3 mr-1" />
                  Cooldown {a.cooldown.minutesRemaining}m
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Regen cooldown active. Too many regens in 24 hours.</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <AllowanceCounter used={a.today.mealSwapsUsed} limit={a.today.mealSwapsLimit} icon={Repeat} label="Meal Swaps" />
          <AllowanceCounter used={a.today.mealRegensUsed} limit={a.today.mealRegensLimit} icon={RotateCcw} label="Day Regens" />
        </div>

        <div className="pt-1 border-t">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span>Plan Regens</span>
            </div>
            <span className="text-xs font-medium tabular-nums" data-testid="text-plan-regens">
              {Math.max(0, a.plan.regensLimit - a.plan.regensUsed)}/{a.plan.regensLimit}
            </span>
          </div>
        </div>

        {a.flexTokensAvailable > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t">
            <div className="flex items-center gap-1.5 text-xs">
              <Gift className="h-3 w-3 text-amber-500" />
              <span className="text-muted-foreground">{a.flexTokensAvailable} Flex Token{a.flexTokensAvailable > 1 ? "s" : ""}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => redeemMutation.mutate()}
              disabled={redeemMutation.isPending}
              data-testid="button-redeem-flex"
            >
              {redeemMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Redeem"}
            </Button>
          </div>
        )}

        {a.coachInsight && (
          <div className="flex items-start gap-1.5 pt-1 border-t">
            <Info className="h-3 w-3 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-xs text-muted-foreground" data-testid="text-coach-insight">{a.coachInsight}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlanView() {
  const params = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const fromGoal = searchParams.get("from") === "goal";
  const goalId = searchParams.get("goalId");

  const { data, isLoading, error } = useQuery<MealPlan>({
    queryKey: ["/api/plan", params.id],
    enabled: !!user && !!params.id,
  });

  const { data: feedbackMap = {} } = useQuery<Record<string, "like" | "dislike">>({
    queryKey: ["/api/feedback/plan", params.id],
    enabled: !!user && !!params.id,
  });

  const [optimisticFeedback, setOptimisticFeedback] = useState<Record<string, "like" | "dislike" | null>>({});
  const mergedFeedback = useMemo(() => {
    const m: Record<string, "like" | "dislike" | null> = { ...feedbackMap };
    for (const [k, v] of Object.entries(optimisticFeedback)) {
      m[k] = v;
    }
    return m;
  }, [feedbackMap, optimisticFeedback]);

  const [proposalModal, setProposalModal] = useState<{ mealName: string; ingredients: string[]; fingerprint: string; proposalId: string } | null>(null);
  const [selectedAvoids, setSelectedAvoids] = useState<Set<string>>(new Set());

  const feedbackMutation = useMutation({
    mutationFn: async (body: { planId: string; mealFingerprint: string; mealName: string; cuisineTag: string; feedback: "like" | "dislike" | "neutral"; ingredients: string[] }) => {
      const res = await apiRequest("POST", "/api/feedback/meal", body);
      return await res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/plan", params.id] });
      if (variables.feedback === "dislike" && data.proposalId && data.proposalIngredients?.length > 0) {
        setProposalModal({ mealName: variables.mealName, ingredients: data.proposalIngredients, fingerprint: variables.mealFingerprint, proposalId: data.proposalId });
        setSelectedAvoids(new Set());
      }
    },
  });

  const proposalResolveMutation = useMutation({
    mutationFn: async (body: { proposalId?: string; chosenIngredients: string[]; action: "accepted" | "declined" }) => {
      if (body.proposalId) {
        await apiRequest("POST", `/api/ingredient-proposals/${body.proposalId}/resolve`, {
          chosenIngredients: body.chosenIngredients,
          action: body.action,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      setProposalModal(null);
    },
  });

  const handleFeedback = (fingerprint: string, mealName: string, cuisineTag: string, feedback: "like" | "dislike" | "neutral", ingredients: string[]) => {
    if (feedback === "neutral") {
      setOptimisticFeedback(prev => ({ ...prev, [fingerprint]: null }));
    } else {
      setOptimisticFeedback(prev => ({ ...prev, [fingerprint]: feedback }));
    }
    feedbackMutation.mutate({ planId: params.id!, mealFingerprint: fingerprint, mealName, cuisineTag, feedback, ingredients });
  };

  const [startDateOpen, setStartDateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const scrollTarget = sp.get("scrollTo");
    if (scrollTarget && data) {
      const dayIdx = scrollTarget.replace("day-", "");
      const el = document.querySelector(`[data-testid="text-day-${dayIdx}"]`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      }
    }
  }, [data]);

  const { data: occupiedDatesData } = useQuery<{ occupiedDates: string[] }>({
    queryKey: ["/api/calendar/occupied-dates", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/occupied-dates?excludePlanId=${params.id}`, { credentials: "include" });
      if (!res.ok) return { occupiedDates: [] };
      return res.json();
    },
    enabled: !!user && !!params.id,
  });

  const occupiedDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of occupiedDatesData?.occupiedDates || []) {
      s.add(d);
    }
    return s;
  }, [occupiedDatesData]);

  const isDateOccupied = useCallback((date: Date): boolean => {
    const planDays = (data?.planJson as PlanOutput | undefined)?.days?.length || 7;
    for (let i = 0; i < planDays; i++) {
      const d = new Date(date);
      d.setDate(d.getDate() + i);
      const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (occupiedDateSet.has(dStr)) return true;
    }
    return false;
  }, [occupiedDateSet, data]);

  const startDateMutation = useMutation({
    mutationFn: async (startDate: string) => {
      await apiRequest("PATCH", `/api/plan/${params.id}/start-date`, { startDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plan", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/occupied-dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/all"] });
      toast({ title: "Plan scheduled", description: "Your calendar has been updated." });
      setStartDateOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update start date", variant: "destructive" });
    },
  });

  const clearStartDateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/plan/${params.id}/start-date`, { startDate: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plan", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/occupied-dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/all"] });
      setStartDateOpen(false);
      toast({ title: "Removed from calendar" });
    },
    onError: () => {
      toast({ title: "Failed to clear schedule", variant: "destructive" });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/plans/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/occupied-dates"] });
      toast({ title: "Plan deleted" });
      navigate("/plans");
    },
    onError: () => {
      toast({ title: "Failed to delete plan", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (data && (data as any).status === "generating") {
      navigate(`/plan/${params.id}/generating`, { replace: true });
    }
  }, [data, params.id, navigate]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const planStatus = (data as any)?.status as string | undefined;
  const plan = planStatus === "ready" ? (data?.planJson as PlanOutput | undefined) : undefined;
  const swapCount = data?.swapCount ?? 0;
  const regenDayCount = data?.regenDayCount ?? 0;
  const prefs = data?.preferencesJson as any | undefined;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {fromGoal && goalId && (
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 print:hidden"
          onClick={() => navigate(`/goals/${goalId}/ready`)}
          data-testid="button-back-to-goal"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Goal Summary
        </Button>
      )}
      {plan && params.id && (
        <div className="mb-6 print:hidden">
          <AllowancePanel planId={params.id} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mb-6 print:hidden flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="icon" className="sm:hidden" onClick={handlePrint} data-testid="button-print-mobile">
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={handlePrint} data-testid="button-print">
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print
          </Button>
          {plan && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-plan-menu">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {data?.planStartDate ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => setStartDateOpen(true)}
                      data-testid="menu-move-start-date"
                    >
                      <CalendarClock className="h-4 w-4 mr-2" />
                      Move start date
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => clearStartDateMutation.mutate()}
                      data-testid="menu-remove-from-calendar"
                    >
                      <CalendarMinus className="h-4 w-4 mr-2" />
                      Remove from calendar
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onClick={() => setStartDateOpen(true)}
                    data-testid="menu-add-to-calendar"
                  >
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Add to calendar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="text-destructive focus:text-destructive"
                  data-testid="menu-delete-plan"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete plan
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div>
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
            <Dialog open={startDateOpen} onOpenChange={setStartDateOpen}>
              <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[350px] p-0">
                <DialogHeader className="px-4 pt-4 pb-0">
                  <DialogTitle className="text-base">{data?.planStartDate ? "Move start date" : "Choose start date"}</DialogTitle>
                </DialogHeader>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={data?.planStartDate ? new Date(data.planStartDate + "T00:00:00") : undefined}
                    onSelect={(date) => {
                      if (date && !isDateOccupied(date)) {
                        startDateMutation.mutate(format(date, "yyyy-MM-dd"));
                      }
                    }}
                    disabled={(date) => isDateOccupied(date)}
                    modifiers={{
                      occupied: (date: Date) => {
                        const dStr = format(date, "yyyy-MM-dd");
                        return occupiedDateSet.has(dStr);
                      },
                    }}
                    modifiersClassNames={{
                      occupied: "bg-destructive/15 text-muted-foreground line-through",
                    }}
                    initialFocus
                  />
                </div>
                {occupiedDateSet.size > 0 && (
                  <p className="text-[11px] text-muted-foreground px-4 pb-3" data-testid="text-occupied-hint">
                    Dates with existing meals are unavailable.
                  </p>
                )}
              </DialogContent>
            </Dialog>

            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the plan from your list and calendar. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deletePlanMutation.mutate()}
                    className="bg-destructive text-destructive-foreground"
                    data-testid="button-confirm-delete"
                  >
                    {deletePlanMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {data?.planStartDate && (
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <CalendarIcon className="h-4 w-4" />
                <span data-testid="text-schedule-info">
                  Scheduled: {format(new Date(data.planStartDate + "T00:00:00"), "EEEE, MMM d, yyyy")}
                </span>
              </div>
            )}

            <div className="mb-8 space-y-4">
              <h1 className="text-xl sm:text-2xl font-semibold">{plan.title}</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">{plan.summary}</p>
              {plan.nutritionNotes && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10">
                  <Activity className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-sm min-w-0">
                    <span className="font-medium">Daily targets: </span>
                    <span className="text-muted-foreground break-words">
                      {plan.nutritionNotes.dailyMacroTargetsRange.calories} cal,{" "}
                      {plan.nutritionNotes.dailyMacroTargetsRange.protein_g}g protein,{" "}
                      {plan.nutritionNotes.dailyMacroTargetsRange.carbs_g}g carbs,{" "}
                      {plan.nutritionNotes.dailyMacroTargetsRange.fat_g}g fat
                    </span>
                  </div>
                </div>
              )}
              {prefs && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" data-testid="button-toggle-plan-settings">
                      <span className="text-xs">Plan Settings</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-muted/50 rounded-md p-4 text-xs space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-muted-foreground">Goal:</span>
                        <span className="font-medium capitalize">{prefs.goal?.replace(/_/g, " ")}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-muted-foreground">Cuisines:</span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {(prefs.dietStyles || [prefs.dietStyle || "No Preference"]).map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-muted-foreground">Meals/Day:</span>
                        <span className="font-medium">{prefs.mealsPerDay || 3}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-muted-foreground">Household:</span>
                        <span className="font-medium">{prefs.householdSize} {prefs.householdSize === 1 ? "person" : "people"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-muted-foreground">Prep:</span>
                        <span className="font-medium">{prefs.prepStyle === "cook_daily" ? "Cook Daily" : prefs.prepStyle === "batch_2day" ? "Meal Prep (2-day)" : "Meal Prep (3-4 day)"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-muted-foreground">Budget:</span>
                        <span className="font-medium">{prefs.budgetMode === "budget_friendly" ? "Budget Friendly" : "Normal"}</span>
                      </div>
                      {prefs.foodsToAvoid && prefs.foodsToAvoid.length > 0 && (
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground shrink-0">Avoiding:</span>
                          <span className="font-medium text-right">{prefs.foodsToAvoid.join(", ")}</span>
                        </div>
                      )}
                      {prefs.mealsPerDay === 2 && prefs.mealSlots && prefs.mealSlots.length > 0 && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground">Meal Slots:</span>
                          <span className="font-medium capitalize">{prefs.mealSlots.join(", ")}</span>
                        </div>
                      )}
                      {prefs.age && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground">Age:</span>
                          <span className="font-medium">{prefs.age}</span>
                        </div>
                      )}
                      {prefs.currentWeight && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground">Current Weight:</span>
                          <span className="font-medium">{prefs.currentWeight} {prefs.weightUnit || "lb"}</span>
                        </div>
                      )}
                      {prefs.targetWeight && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground">Target Weight:</span>
                          <span className="font-medium">{prefs.targetWeight} {prefs.weightUnit || "lb"}</span>
                        </div>
                      )}
                      {prefs.workoutDaysPerWeek !== undefined && prefs.workoutDaysPerWeek !== null && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground">Workouts/Week:</span>
                          <span className="font-medium">{prefs.workoutDaysPerWeek} days</span>
                        </div>
                      )}
                      {prefs.spiceLevel && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground">Spice Level:</span>
                          <span className="font-medium capitalize">{prefs.spiceLevel}</span>
                        </div>
                      )}
                      {prefs.authenticityMode && (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-muted-foreground">Recipe Style:</span>
                          <span className="font-medium capitalize">{prefs.authenticityMode === "weeknight" ? "Weeknight Easy" : prefs.authenticityMode}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-muted-foreground">Swaps remaining:</span>
                        <span className="font-medium">{3 - swapCount}/3</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-muted-foreground">Day regens remaining:</span>
                        <span className="font-medium">{1 - regenDayCount}/1</span>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <Tabs defaultValue="meals" className="space-y-6">
              <TabsList className="print:hidden w-full sm:w-auto">
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
                    planStartDate={data?.planStartDate}
                  />
                ))}
              </TabsContent>

              <TabsContent value="grocery">
                <GroceryListView planId={params.id!} />
              </TabsContent>
            </Tabs>

            {plan.batchPrepPlan && (
              <Card className="mt-8 print:break-before-page">
                <CardHeader className="p-4 sm:p-5 pb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <ChefHat className="h-5 w-5 text-primary" />
                    Batch Prep Plan
                  </h2>
                  <p className="text-sm text-muted-foreground">Prep day: {plan.batchPrepPlan.prepDay}</p>
                </CardHeader>
                <CardContent className="space-y-4 px-4 sm:px-5 pb-4 sm:pb-5">
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

        <Dialog open={!!proposalModal} onOpenChange={(open) => { if (!open) setProposalModal(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Avoid ingredients from this meal?</DialogTitle>
            </DialogHeader>
            {proposalModal && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You disliked <span className="font-medium text-foreground">{proposalModal.mealName}</span>. Would you like to avoid any of these ingredients in future plans?
                </p>
                <div className="space-y-2">
                  {proposalModal.ingredients.map((ing) => (
                    <label key={ing} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedAvoids.has(ing)}
                        onCheckedChange={(checked) => {
                          setSelectedAvoids(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(ing); else next.delete(ing);
                            return next;
                          });
                        }}
                        data-testid={`checkbox-avoid-${ing.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                      <span className="text-sm">{ing}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (proposalModal?.proposalId) {
                        proposalResolveMutation.mutate({
                          proposalId: proposalModal.proposalId,
                          chosenIngredients: [],
                          action: "declined",
                        });
                      } else {
                        setProposalModal(null);
                      }
                    }}
                    data-testid="button-skip-avoid"
                  >
                    Skip
                  </Button>
                  <Button
                    disabled={selectedAvoids.size === 0}
                    onClick={() => {
                      proposalResolveMutation.mutate({
                        proposalId: proposalModal?.proposalId,
                        chosenIngredients: Array.from(selectedAvoids),
                        action: "accepted",
                      });
                    }}
                    data-testid="button-confirm-avoid"
                  >
                    Avoid Selected
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
