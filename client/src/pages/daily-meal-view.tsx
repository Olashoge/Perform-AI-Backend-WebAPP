import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ArrowLeft, UtensilsCrossed, Clock, ChevronDown, Loader2, ShoppingCart,
} from "lucide-react";
import { useState } from "react";

interface DailyMealData {
  id: string;
  date: string;
  status: string;
  mealsPerDay: number;
  generatedTitle: string | null;
  planJson: any;
  groceryJson: any;
}

function MealCard({ slot, meal }: { slot: string; meal: any }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="border rounded-xl p-4 cursor-pointer hover:bg-muted/30 transition-colors" data-testid={`daily-meal-card-${slot}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5 capitalize">{slot}</div>
              <div className="font-semibold text-sm">{meal.name}</div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {meal.cuisineTag && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{meal.cuisineTag}</Badge>}
                {meal.prepTimeMinutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {meal.prepTimeMinutes} min
                  </span>
                )}
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </div>

          {meal.nutritionEstimateRange && (
            <div className="flex gap-3 mt-2 text-xs">
              <span className="text-amber-600 dark:text-amber-400">{meal.nutritionEstimateRange.calories} cal</span>
              <span>P: {meal.nutritionEstimateRange.protein_g}g</span>
              <span>C: {meal.nutritionEstimateRange.carbs_g}g</span>
              <span>F: {meal.nutritionEstimateRange.fat_g}g</span>
            </div>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-xl p-4 -mt-2 pt-4 space-y-3">
          {meal.whyItHelpsGoal && (
            <div className="text-xs text-muted-foreground italic">{meal.whyItHelpsGoal}</div>
          )}

          {meal.ingredients && meal.ingredients.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Ingredients</div>
              <ul className="text-sm space-y-0.5">
                {meal.ingredients.map((ing: string, i: number) => (
                  <li key={i} className="text-muted-foreground">• {ing}</li>
                ))}
              </ul>
            </div>
          )}

          {meal.steps && meal.steps.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Steps</div>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                {meal.steps.map((step: string, i: number) => (
                  <li key={i} className="text-muted-foreground">{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function DailyMealView() {
  const params = useParams<{ date: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: meal, isLoading, error } = useQuery<DailyMealData>({
    queryKey: ["/api/daily-meal", params.date],
    queryFn: async () => {
      const res = await fetch(`/api/daily-meal/${params.date}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!user && !!params.date,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.status === "generating") return 2000;
      return false;
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full mb-3" />
        <Skeleton className="h-32 w-full mb-3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !meal) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto text-center">
        <p className="text-muted-foreground mb-4">No daily meal found for this date.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")} data-testid="button-back-dashboard">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  if (meal.status === "generating") {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-4" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-amber-600" />
            <div className="font-semibold text-lg mb-1">Generating your meals...</div>
            <p className="text-sm text-muted-foreground">Creating a personalized meal plan for {params.date}. This usually takes 15-30 seconds.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (meal.status === "failed") {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto text-center">
        <p className="text-muted-foreground mb-4">Meal generation failed. Please try again.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")} data-testid="button-back-dashboard">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const planJson = meal.planJson;
  const meals = planJson?.meals || {};
  const mealSlots = Object.keys(meals);

  return (
    <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-4" data-testid="button-back">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <UtensilsCrossed className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-daily-meal-title">{meal.generatedTitle || `Daily Meals — ${params.date}`}</h1>
          <p className="text-xs text-muted-foreground">{mealSlots.length} meals</p>
        </div>
      </div>

      {planJson?.nutritionSummary && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Daily Nutrition Summary</div>
            <div className="grid grid-cols-4 gap-3 text-center text-sm">
              <div>
                <div className="font-bold text-amber-600 dark:text-amber-400">{planJson.nutritionSummary.calories}</div>
                <div className="text-xs text-muted-foreground">cal</div>
              </div>
              <div>
                <div className="font-bold">{planJson.nutritionSummary.protein_g}g</div>
                <div className="text-xs text-muted-foreground">protein</div>
              </div>
              <div>
                <div className="font-bold">{planJson.nutritionSummary.carbs_g}g</div>
                <div className="text-xs text-muted-foreground">carbs</div>
              </div>
              <div>
                <div className="font-bold">{planJson.nutritionSummary.fat_g}g</div>
                <div className="text-xs text-muted-foreground">fat</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3" data-testid="daily-meals-list">
        {mealSlots.map(slot => (
          <MealCard key={slot} slot={slot} meal={meals[slot]} />
        ))}
      </div>

      {meal.groceryJson?.sections?.length > 0 && (
        <Card className="mt-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ingredients Needed</div>
            </div>
            {meal.groceryJson.sections.map((section: any, i: number) => (
              <div key={i} className="mb-2">
                <div className="text-xs font-medium mb-1">{section.name}</div>
                <div className="flex flex-wrap gap-1">
                  {section.items.map((item: any, j: number) => (
                    <Badge key={j} variant="secondary" className="text-xs">{item.quantity || item.item}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
