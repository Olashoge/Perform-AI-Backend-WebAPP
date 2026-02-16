import { useState, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UtensilsCrossed, Loader2, ArrowLeft, Sparkles, X, Plus, CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const submittedRef = useRef(false);
  const [customStyleInput, setCustomStyleInput] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [startDateOpen, setStartDateOpen] = useState(false);

  const form = useForm<Preferences>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      goal: "maintenance",
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

    try {
      const res = await apiRequest("POST", "/api/plan", { ...data, idempotencyKey, startDate: format(startDate, "yyyy-MM-dd") });
      const plan = await res.json();

      if (plan.status === "ready") {
        navigate(`/plan/${plan.id}`);
      } else {
        navigate(`/plan/${plan.id}/generating`);
      }
    } catch (err: any) {
      setIsPending(false);
      submittedRef.current = false;
      toast({
        title: "Failed to generate plan",
        description: err.message?.includes("429") ? "You've reached the daily limit for AI calls. Please try again tomorrow." : "Something went wrong generating your meal plan. Please try again.",
        variant: "destructive",
      });
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

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold">Diet & Cuisine</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="dietStyles"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Diet / Cuisine Styles (select multiple)</FormLabel>
                      <div className="flex flex-wrap gap-1.5 mb-2">
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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
                      <div className="flex items-center gap-2 mt-2">
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
                      <FormDescription>Pick one or more cuisines, or type your own</FormDescription>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold">Meals & Schedule</h2>
              </CardHeader>
              <CardContent className="space-y-4">
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

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold">About You</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          placeholder="Your age"
                          className="w-32"
                          disabled={isPending}
                          data-testid="input-age"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Weight (optional)</FormLabel>
                  <FormField
                    control={form.control}
                    name="weightUnit"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant={field.value === "lb" ? "default" : "outline"}
                            size="sm"
                            onClick={() => field.onChange("lb")}
                            disabled={isPending}
                            data-testid="button-unit-lb"
                          >
                            lb
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === "kg" ? "default" : "outline"}
                            size="sm"
                            onClick={() => field.onChange("kg")}
                            disabled={isPending}
                            data-testid="button-unit-kg"
                          >
                            kg
                          </Button>
                        </div>
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-wrap gap-4">
                    <FormField
                      control={form.control}
                      name="currentWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={1000}
                                placeholder="Current weight"
                                className="w-36"
                                disabled={isPending}
                                data-testid="input-current-weight"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                              />
                              <span className="text-sm text-muted-foreground">{form.watch("weightUnit")}</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="targetWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={1000}
                                placeholder="Target weight"
                                className="w-36"
                                disabled={isPending}
                                data-testid="input-target-weight"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                              />
                              <span className="text-sm text-muted-foreground">{form.watch("weightUnit")}</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="workoutDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workout Days (optional)</FormLabel>
                      <FormDescription>Select the days you work out</FormDescription>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((day) => {
                          const selected = (field.value || []).includes(day);
                          return (
                            <Button
                              key={day}
                              type="button"
                              variant={selected ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                const current = field.value || [];
                                if (selected) {
                                  const next = current.filter((d: string) => d !== day);
                                  field.onChange(next.length > 0 ? next : undefined);
                                } else {
                                  field.onChange([...current, day]);
                                }
                              }}
                              disabled={isPending}
                              data-testid={`button-workout-${day.toLowerCase()}`}
                            >
                              {day}
                            </Button>
                          );
                        })}
                      </div>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h2 className="font-semibold">Start Date</h2>
              </CardHeader>
              <CardContent>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">When should your 7-day plan begin?</p>
                  <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal" disabled={isPending} data-testid="button-start-date">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(startDate, "EEEE, MMM d, yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(date) => {
                          if (date) {
                            setStartDate(date);
                            setStartDateOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
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
