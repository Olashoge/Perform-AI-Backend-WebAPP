import { useState, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { preferencesSchema, type Preferences, type UserProfile } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2, Sparkles, X, Plus, CalendarDays, Target, ChefHat, User, Home, AlertTriangle, ExternalLink } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const COMMON_FOODS_TO_AVOID = [
  "Pork", "Shellfish", "Dairy", "Gluten", "Soy", "Eggs", "Nuts", "Red Meat", "Fish", "Mushrooms",
  "Chicken", "Beans/Legumes", "Spicy Foods", "Garlic/Onion",
];

const DIET_STYLES = [
  "No Preference", "Nigerian", "Mediterranean", "Vegetarian", "Vegan",
  "Keto", "Paleo", "Indian", "Chinese", "Mexican", "Japanese", "Korean", "Thai", "Italian", "American",
];

const GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  energy: "Energy & Focus",
  maintenance: "Maintenance",
  performance: "Performance",
};

export default function NewPlan() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const validGoals = ["weight_loss", "muscle_gain", "performance", "maintenance", "energy"] as const;
  const goalParam = searchParams.get("goal");
  const goalFromUrl = validGoals.includes(goalParam as any) ? (goalParam as typeof validGoals[number]) : undefined;
  const startDateFromUrl = searchParams.get("startDate");
  const goalPlanId = searchParams.get("goalPlanId");
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const submittedRef = useRef(false);
  const [customStyleInput, setCustomStyleInput] = useState("");
  const [planStartDate, setPlanStartDate] = useState(startDateFromUrl || "");

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });

  const form = useForm<Preferences>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      goal: goalFromUrl || "maintenance",
      dietStyles: ["No Preference"],
      foodsToAvoid: [],
      householdSize: 1,
      prepStyle: "cook_daily",
      budgetMode: "normal",
      cookingTime: "normal",
      mealsPerDay: 3,
      mealSlots: undefined,
      allergies: "",
      age: undefined,
      currentWeight: undefined,
      targetWeight: undefined,
      weightUnit: "lb",
      workoutDaysPerWeek: undefined,
      workoutDays: undefined,
      spiceLevel: "medium",
      authenticityMode: "mixed",
    },
  });

  async function onSubmit(data: Preferences) {
    if (!user || isPending || submittedRef.current) return;

    submittedRef.current = true;
    setIsPending(true);
    const idempotencyKey = crypto.randomUUID();

    if (data.workoutDays && data.workoutDays.length > 0) {
      data.workoutDaysPerWeek = data.workoutDays.length;
    }

    const alsoCreateWorkout = searchParams.get("alsoWorkout") === "true";

    try {
      const res = await apiRequest("POST", "/api/plan", { ...data, idempotencyKey, startDate: planStartDate || undefined });
      const plan = await res.json();

      if (goalPlanId) {
        try {
          await apiRequest("PATCH", `/api/goal-plans/${goalPlanId}`, { mealPlanId: plan.id });
        } catch {}
      }

      if (alsoCreateWorkout) {
        const workoutParams = `?goal=${data.goal}${planStartDate ? `&startDate=${planStartDate}` : ""}${goalPlanId ? `&goalPlanId=${goalPlanId}` : ""}&fromMealPlan=true`;
        toast({ title: "Meal plan created! Now set up your workout plan." });
        navigate(`/workouts/new${workoutParams}`);
      } else if (plan.status === "ready") {
        navigate(`/plan/${plan.id}`);
      } else {
        navigate(`/plan/${plan.id}/generating`);
      }
    } catch (err: any) {
      setIsPending(false);
      submittedRef.current = false;
      const errMsg = err?.message || "";
      let parsedBody: any = null;
      try { const j = errMsg.indexOf("{"); if (j >= 0) parsedBody = JSON.parse(errMsg.slice(j)); } catch {}
      if (parsedBody?.blocked) {
        const msgs = (parsedBody.violations || []).map((v: any) => v.message).filter(Boolean);
        toast({ title: "Plan cannot be generated", description: msgs.join(" ") || parsedBody.message, variant: "destructive" });
      } else {
        toast({
          title: "Failed to generate plan",
          description: errMsg.includes("429") ? "You've reached the daily limit for AI calls. Please try again tomorrow." : parsedBody?.message || "Something went wrong generating your meal plan. Please try again.",
          variant: "destructive",
        });
      }
    }
  }

  if (isLoading || !user || profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
        <h2 className="text-xl font-semibold">Profile Required</h2>
        <p className="text-muted-foreground">Complete your Performance Blueprint before creating a meal plan. This lets us personalize your nutrition around your body, goals, and training schedule.</p>
        <Button onClick={() => navigate("/profile")} data-testid="button-go-to-profile">
          <ExternalLink className="h-4 w-4 mr-2" />
          Set Up Profile
        </Button>
      </div>
    );
  }

  const profileDaysOfWeek = (profile.trainingDaysOfWeek as string[]) || [];
  const LBS_PER_KG = 2.2046226218;
  const profileWeightDisplay = profile.unitSystem === "metric"
    ? `${profile.weightKg} kg`
    : `${Math.round(profile.weightKg * LBS_PER_KG)} lbs`;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {searchParams.get("alsoWorkout") === "true" && (
          <div className="mb-6 flex items-center gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm text-muted-foreground">Step 1 of 2: Set up your meal plan first, then we'll create your workout plan.</span>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1.5">Create Your Meal Plan</h1>
          <p className="text-muted-foreground">Tell us about your preferences and we'll generate a personalized 7-day meal plan.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Your Goal</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6">
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
                              disabled={isPending}
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
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <ChefHat className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Diet & Cuisine</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <FormField
                    control={form.control}
                    name="dietStyles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Diet / Cuisine Styles</FormLabel>
                        <FormDescription>Pick one or more cuisines, or type your own</FormDescription>
                        {(field.value || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(field.value || []).map((style: string) => (
                              <Badge
                                key={style}
                                variant="default"
                                className="cursor-pointer gap-1"
                                onClick={() => {
                                  if (!isPending) {
                                    field.onChange(field.value.filter((s: string) => s !== style));
                                  }
                                }}
                                data-testid={`badge-style-${style.toLowerCase().replace(/\s/g, "-")}`}
                              >
                                {style}
                                <X className="h-3 w-3" />
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                          {DIET_STYLES.filter(s => !(field.value || []).includes(s)).map((style) => (
                            <Button
                              key={style}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="justify-start text-xs"
                              onClick={() => {
                                const current = field.value || [];
                                if (style === "No Preference") {
                                  field.onChange(["No Preference"]);
                                } else {
                                  field.onChange([...current.filter(s => s !== "No Preference"), style]);
                                }
                              }}
                              disabled={isPending}
                              data-testid={`button-style-${style.toLowerCase().replace(/\s/g, "-")}`}
                            >
                              <Plus className="h-3 w-3 mr-1 shrink-0" />
                              {style}
                            </Button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Input
                            placeholder="Add custom style..."
                            className="flex-1"
                            value={customStyleInput}
                            onChange={(e) => setCustomStyleInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const trimmed = customStyleInput.trim();
                                if (trimmed && !(field.value || []).includes(trimmed)) {
                                  field.onChange([...(field.value || []).filter(s => s !== "No Preference"), trimmed]);
                                  setCustomStyleInput("");
                                }
                              }
                            }}
                            disabled={isPending}
                            data-testid="input-custom-style"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const trimmed = customStyleInput.trim();
                              if (trimmed && !(field.value || []).includes(trimmed)) {
                                field.onChange([...(field.value || []).filter(s => s !== "No Preference"), trimmed]);
                                setCustomStyleInput("");
                              }
                            }}
                            disabled={isPending || !customStyleInput.trim()}
                            data-testid="button-add-custom-style"
                          >
                            Add
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t pt-6">
                    <FormField
                      control={form.control}
                      name="foodsToAvoid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Foods to Avoid</FormLabel>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 mt-2">
                            {COMMON_FOODS_TO_AVOID.map((food) => (
                              <label
                                key={food}
                                className="flex items-center gap-2.5 text-sm cursor-pointer"
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
                                  disabled={isPending}
                                  data-testid={`checkbox-avoid-${food.toLowerCase().replace(/[\s/]/g, "-")}`}
                                />
                                {food}
                              </label>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-6">
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
                              disabled={isPending}
                              data-testid="input-allergies"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Meals & Schedule</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <FormField
                    control={form.control}
                    name="mealsPerDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meals Per Day</FormLabel>
                        <div className="flex gap-2 mt-2">
                          <Button
                            type="button"
                            variant={field.value === 2 ? "default" : "outline"}
                            onClick={() => {
                              field.onChange(2);
                              form.setValue("mealSlots", ["lunch", "dinner"]);
                            }}
                            disabled={isPending}
                            data-testid="button-meals-2"
                          >
                            2 Meals
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === 3 ? "default" : "outline"}
                            onClick={() => {
                              field.onChange(3);
                              form.setValue("mealSlots", undefined);
                            }}
                            disabled={isPending}
                            data-testid="button-meals-3"
                          >
                            3 Meals (Full Day)
                          </Button>
                        </div>
                        <FormDescription>
                          {field.value === 2 ? "Pick which 2 meals below" : "Breakfast, lunch, and dinner"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("mealsPerDay") === 2 && (
                    <FormField
                      control={form.control}
                      name="mealSlots"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Which 2 meals? (pick exactly 2)</FormLabel>
                          <div className="flex gap-4 mt-2">
                            {(["breakfast", "lunch", "dinner"] as const).map((slot) => {
                              const checked = (field.value || []).includes(slot);
                              return (
                                <label key={slot} className="flex items-center gap-2 text-sm cursor-pointer capitalize">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(isChecked) => {
                                      const current = field.value || [];
                                      if (isChecked) {
                                        if (current.length >= 2) return;
                                        field.onChange([...current, slot]);
                                      } else {
                                        field.onChange(current.filter((s: string) => s !== slot));
                                      }
                                    }}
                                    disabled={isPending || (!checked && (field.value || []).length >= 2)}
                                    data-testid={`checkbox-slot-${slot}`}
                                  />
                                  {slot}
                                </label>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Your Profile</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/profile")} data-testid="link-edit-profile">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm" data-testid="profile-summary-meal">
                    <div>
                      <span className="text-muted-foreground">Age:</span>{" "}
                      <span className="font-medium">{profile.age}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Weight:</span>{" "}
                      <span className="font-medium">{profileWeightDisplay}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Goal:</span>{" "}
                      <span className="font-medium capitalize">{profile.primaryGoal.replace(/_/g, " ")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Experience:</span>{" "}
                      <span className="font-medium capitalize">{profile.trainingExperience}</span>
                    </div>
                    {profileDaysOfWeek.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Training:</span>{" "}
                        <span className="font-medium">{profileDaysOfWeek.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")} ({profileDaysOfWeek.length}/wk)</span>
                      </div>
                    )}
                    {((profile.allergies as string[]) || []).length > 0 && (
                      <div className="col-span-2 sm:col-span-3">
                        <span className="text-muted-foreground">Allergies:</span>{" "}
                        <span className="font-medium">{(profile.allergies as string[]).join(", ")}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Home className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Household & Cooking</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
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
                              disabled={isPending}
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

                  <div className="border-t pt-6">
                    <FormField
                      control={form.control}
                      name="prepStyle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prep Style</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                            <FormControl>
                              <SelectTrigger data-testid="select-prep-style">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="cook_daily">Cook Daily</SelectItem>
                              <SelectItem value="batch_2day">Meal Prep (2-day)</SelectItem>
                              <SelectItem value="batch_3to4day">Meal Prep (3-4 day)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="budgetMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Budget</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
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
                            <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
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
                  </div>

                  <div className="border-t pt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="spiceLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Spice Level</FormLabel>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {([
                                { value: "none", label: "None" },
                                { value: "mild", label: "Mild" },
                                { value: "medium", label: "Medium" },
                                { value: "hot", label: "Hot" },
                              ] as const).map(opt => (
                                <Button
                                  key={opt.value}
                                  type="button"
                                  variant={field.value === opt.value ? "default" : "outline"}
                                  onClick={() => field.onChange(opt.value)}
                                  disabled={isPending}
                                  data-testid={`button-spice-${opt.value}`}
                                >
                                  {opt.label}
                                </Button>
                              ))}
                            </div>
                            <FormDescription>Applied independently of cuisine choice</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="authenticityMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Recipe Style</FormLabel>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {([
                                { value: "traditional", label: "Traditional" },
                                { value: "weeknight", label: "Weeknight Easy" },
                                { value: "mixed", label: "Mixed" },
                              ] as const).map(opt => (
                                <Button
                                  key={opt.value}
                                  type="button"
                                  variant={field.value === opt.value ? "default" : "outline"}
                                  onClick={() => field.onChange(opt.value)}
                                  disabled={isPending}
                                  data-testid={`button-authenticity-${opt.value}`}
                                >
                                  {opt.label}
                                </Button>
                              ))}
                            </div>
                            <FormDescription>Traditional uses authentic methods; Weeknight keeps it simple</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Start Date</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <FormLabel>Schedule Start Date (optional)</FormLabel>
                  <p className="text-sm text-muted-foreground mt-1 mb-3">
                    Optionally pick when this plan should start. You can also schedule it later from the plan details page.
                  </p>
                  <Input
                    type="date"
                    value={planStartDate}
                    onChange={(e) => setPlanStartDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    disabled={isPending}
                    className="max-w-xs"
                    data-testid="input-plan-start-date"
                  />
                </CardContent>
              </Card>
            </section>

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
  );
}
