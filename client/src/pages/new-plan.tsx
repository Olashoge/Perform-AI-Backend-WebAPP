import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { preferencesSchema, type Preferences } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { UtensilsCrossed, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMMON_FOODS_TO_AVOID = [
  "Pork", "Shellfish", "Dairy", "Gluten", "Soy", "Eggs", "Nuts", "Red Meat", "Fish", "Mushrooms",
];

const DIET_STYLES = [
  "No Preference", "Nigerian", "Mediterranean", "Vegetarian", "Vegan",
  "Keto", "Paleo", "Indian", "Chinese", "Mexican", "Japanese", "Korean", "Thai", "Italian", "American",
];

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  energy: "Energy & Focus",
  maintenance: "Maintenance",
  performance: "Performance",
};

export default function NewPlan() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const form = useForm<Preferences>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      goal: "maintenance",
      dietStyle: "No Preference",
      foodsToAvoid: [],
      householdSize: 1,
      prepStyle: "cook_daily",
      budgetMode: "normal",
      cookingTime: "normal",
      allergies: "",
    },
  });

  async function onSubmit(data: Preferences) {
    if (!user) {
      navigate("/login");
      return;
    }
    setIsPending(true);
    try {
      const res = await apiRequest("POST", "/api/plan", data);
      const plan = await res.json();
      navigate(`/plan/${plan.id}`);
    } catch (err: any) {
      toast({
        title: "Failed to generate plan",
        description: err.message?.includes("429") ? "You've reached the daily limit for AI calls. Please try again tomorrow." : "Something went wrong generating your meal plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [isLoading, user, navigate]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/plans">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <span className="font-semibold">New Meal Plan</span>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Create Your Meal Plan</h1>
          <p className="text-muted-foreground">Tell us about your preferences and we'll generate a personalized 7-day meal plan.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold">Your Goal</h2>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="goal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What's your primary goal?</FormLabel>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                        {Object.entries(GOAL_LABELS).map(([value, label]) => (
                          <Button
                            key={value}
                            type="button"
                            variant={field.value === value ? "default" : "outline"}
                            className="justify-start"
                            onClick={() => field.onChange(value)}
                            data-testid={`button-goal-${value}`}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold">Diet & Cuisine</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="dietStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Diet / Cuisine Style</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-diet-style">
                            <SelectValue placeholder="Select a style" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DIET_STYLES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Choose a cuisine style or type your own</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="foodsToAvoid"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Foods to Avoid</FormLabel>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                        {COMMON_FOODS_TO_AVOID.map((food) => (
                          <label
                            key={food}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <Checkbox
                              checked={field.value?.includes(food)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  field.onChange([...(field.value || []), food]);
                                } else {
                                  field.onChange(field.value?.filter((f: string) => f !== food));
                                }
                              }}
                              data-testid={`checkbox-avoid-${food.toLowerCase().replace(/\s/g, "-")}`}
                            />
                            {food}
                          </label>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="allergies"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allergies (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="List any allergies or additional foods to avoid..."
                          className="resize-none"
                          data-testid="input-allergies"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold">Household & Cooking</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="householdSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Household Size</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            min={1}
                            max={8}
                            className="w-24"
                            data-testid="input-household-size"
                            value={field.value}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {field.value === 1 ? "person" : "people"}
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prepStyle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prep Style</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-prep-style">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cook_daily">Cook Daily</SelectItem>
                          <SelectItem value="batch_2day">Batch Cook (2-day)</SelectItem>
                          <SelectItem value="batch_3to4day">Batch Cook (3-4 day)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="budgetMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Budget</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-budget">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="budget_friendly">Budget Friendly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cookingTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cooking Time</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-cooking-time">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="quick">Quick (under 30 min)</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Button type="submit" size="lg" className="w-full" disabled={isPending} data-testid="button-generate">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating your meal plan...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate 7-Day Meal Plan
                </>
              )}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
