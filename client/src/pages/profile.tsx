import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertUserProfileSchema, type UserProfile, type InsertUserProfile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Ruler, Activity, Heart, Brain,
  Moon, Dumbbell, Clock, Flame, UtensilsCrossed,
  X, Plus, Save, Check,
} from "lucide-react";

const LBS_PER_KG = 2.2046226218;
const CM_PER_INCH = 2.54;

function kgToLbs(kg: number): number {
  return Math.round(kg * LBS_PER_KG * 10) / 10;
}
function lbsToKg(lbs: number): number {
  return Math.round((lbs / LBS_PER_KG) * 10) / 10;
}
function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches % 12);
  if (inches === 12) {
    inches = 0;
    feet += 1;
  }
  return { feet, inches };
}
function ftInToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * CM_PER_INCH);
}

const GOAL_OPTIONS = [
  { value: "weight_loss", label: "Weight Loss" },
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "performance", label: "Performance" },
  { value: "maintenance", label: "Maintenance" },
  { value: "energy", label: "Energy & Focus" },
  { value: "general_fitness", label: "General Fitness" },
];

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const STRESS_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Sedentary" },
  { value: "moderate", label: "Moderately Active" },
  { value: "active", label: "Very Active" },
];

const APPETITE_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const SPICE_OPTIONS = [
  { value: "mild", label: "Mild" },
  { value: "medium", label: "Medium" },
  { value: "spicy", label: "Spicy" },
];

function TagInput({
  value,
  onChange,
  placeholder,
  testIdPrefix,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  testIdPrefix: string;
}) {
  const [inputVal, setInputVal] = useState("");

  const addTag = () => {
    const trimmed = inputVal.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputVal("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          data-testid={`input-${testIdPrefix}`}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={addTag}
          data-testid={`button-add-${testIdPrefix}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag, i) => (
            <Badge key={tag} variant="secondary" data-testid={`badge-${testIdPrefix}-${i}`}>
              {tag}
              <button
                type="button"
                className="ml-1 rounded-full"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                data-testid={`button-remove-${testIdPrefix}-${i}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

type UnitSystem = "imperial" | "metric";

export default function ProfilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [unitSystem, setUnitSystem] = useState<UnitSystem>("imperial");
  const [heightFeet, setHeightFeet] = useState<number | "">("");
  const [heightInches, setHeightInches] = useState<number | "">("");
  const [weightLbs, setWeightLbs] = useState<number | "">("");
  const [targetWeightLbs, setTargetWeightLbs] = useState<number | "">("");

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile | null>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });

  const isNew = !profile;

  const form = useForm<InsertUserProfile>({
    resolver: zodResolver(insertUserProfileSchema),
    defaultValues: {
      unitSystem: "imperial",
      age: 25,
      sex: null,
      heightCm: null,
      weightKg: 70,
      targetWeightKg: null,
      primaryGoal: "general_fitness",
      trainingExperience: "beginner",
      injuries: [],
      mobilityLimitations: [],
      chronicConditions: [],
      sleepHours: null,
      stressLevel: null,
      activityLevel: null,
      trainingDaysOfWeek: [],
      sessionDurationMinutes: null,
      allergies: [],
      intolerances: [],
      religiousRestrictions: [],
      appetiteLevel: null,
      spicePreference: null,
    },
  });

  const syncImperialFromMetric = useCallback((weightKg: number | null, targetWeightKg: number | null, heightCm: number | null) => {
    setWeightLbs(weightKg ? kgToLbs(weightKg) : "");
    setTargetWeightLbs(targetWeightKg ? kgToLbs(targetWeightKg) : "");
    if (heightCm) {
      const { feet, inches } = cmToFtIn(heightCm);
      setHeightFeet(feet);
      setHeightInches(inches);
    } else {
      setHeightFeet("");
      setHeightInches("");
    }
  }, []);

  useEffect(() => {
    if (profile) {
      const savedUnit = (profile.unitSystem as UnitSystem) || "imperial";
      setUnitSystem(savedUnit);
      form.reset({
        unitSystem: savedUnit,
        age: profile.age,
        sex: profile.sex || null,
        heightCm: profile.heightCm || null,
        weightKg: profile.weightKg,
        targetWeightKg: profile.targetWeightKg || null,
        primaryGoal: profile.primaryGoal,
        trainingExperience: profile.trainingExperience as "beginner" | "intermediate" | "advanced",
        injuries: (profile.injuries as string[]) || [],
        mobilityLimitations: (profile.mobilityLimitations as string[]) || [],
        chronicConditions: (profile.chronicConditions as string[]) || [],
        sleepHours: profile.sleepHours || null,
        stressLevel: (profile.stressLevel as "low" | "moderate" | "high") || null,
        activityLevel: (profile.activityLevel as "sedentary" | "moderate" | "active") || null,
        trainingDaysOfWeek: (profile.trainingDaysOfWeek as string[]) || [],
        sessionDurationMinutes: profile.sessionDurationMinutes || null,
        allergies: (profile.allergies as string[]) || [],
        intolerances: (profile.intolerances as string[]) || [],
        religiousRestrictions: (profile.religiousRestrictions as string[]) || [],
        appetiteLevel: (profile.appetiteLevel as "low" | "normal" | "high") || null,
        spicePreference: (profile.spicePreference as "mild" | "medium" | "spicy") || null,
      });
      syncImperialFromMetric(profile.weightKg, profile.targetWeightKg, profile.heightCm);
    }
  }, [profile, form, syncImperialFromMetric]);

  const handleUnitToggle = (newUnit: UnitSystem) => {
    if (newUnit === unitSystem) return;
    setUnitSystem(newUnit);
    form.setValue("unitSystem", newUnit);

    const currentWeightKg = form.getValues("weightKg");
    const currentTargetKg = form.getValues("targetWeightKg");
    const currentHeightCm = form.getValues("heightCm");

    if (newUnit === "imperial") {
      syncImperialFromMetric(currentWeightKg, currentTargetKg ?? null, currentHeightCm ?? null);
    }
  };

  const handleImperialWeightChange = (lbs: number | "") => {
    setWeightLbs(lbs);
    form.setValue("weightKg", lbs === "" ? 0 : lbsToKg(lbs as number));
  };

  const handleImperialTargetWeightChange = (lbs: number | "") => {
    setTargetWeightLbs(lbs);
    form.setValue("targetWeightKg", lbs === "" ? null : lbsToKg(lbs as number));
  };

  const handleImperialHeightChange = (feet: number | "", inches: number | "") => {
    setHeightFeet(feet);
    setHeightInches(inches);
    const f = typeof feet === "number" ? feet : 0;
    const i = typeof inches === "number" ? inches : 0;
    if (f === 0 && i === 0 && feet === "" && inches === "") {
      form.setValue("heightCm", null);
    } else {
      form.setValue("heightCm", ftInToCm(f, i));
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data: InsertUserProfile) => {
      const method = isNew ? "POST" : "PUT";
      const res = await apiRequest(method, "/api/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Profile saved",
        description: "Your performance blueprint has been updated.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertUserProfile) => {
    saveMutation.mutate(data);
  };

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  if (authLoading || profileLoading || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isImperial = unitSystem === "imperial";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-profile-title">
          Performance Blueprint
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isNew
            ? "Set up your profile to unlock personalized plans"
            : "Review and update your personal data for better plan accuracy"}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                <div className="flex items-center gap-3">
                  <Ruler className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-semibold text-base">Physical Stats & Goals</h2>
                </div>
                <div className="flex rounded-md border overflow-visible" data-testid="unit-toggle">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-l-md ${
                      isImperial
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => handleUnitToggle("imperial")}
                    data-testid="button-unit-imperial"
                  >
                    Imperial
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-r-md ${
                      !isImperial
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => handleUnitToggle("metric")}
                    data-testid="button-unit-metric"
                  >
                    Metric
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                          data-testid="input-age"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sex</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-sex">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SEX_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isImperial ? (
                  <div className="space-y-2">
                    <Label>Height (ft / in)</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          type="number"
                          min={0}
                          max={9}
                          placeholder="ft"
                          value={heightFeet === "" ? "" : heightFeet}
                          onChange={(e) => {
                            const v = e.target.value === "" ? "" : Number(e.target.value);
                            handleImperialHeightChange(v as number | "", heightInches);
                          }}
                          data-testid="input-height-feet"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="number"
                          min={0}
                          max={11}
                          placeholder="in"
                          value={heightInches === "" ? "" : heightInches}
                          onChange={(e) => {
                            const v = e.target.value === "" ? "" : Math.min(11, Math.max(0, Number(e.target.value)));
                            handleImperialHeightChange(heightFeet, v as number | "");
                          }}
                          data-testid="input-height-inches"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="heightCm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Height (cm)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                            data-testid="input-height-cm"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isImperial ? (
                  <div className="space-y-2">
                    <Label>Weight (lb)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={weightLbs === "" ? "" : weightLbs}
                      onChange={(e) => handleImperialWeightChange(e.target.value === "" ? "" : Number(e.target.value))}
                      data-testid="input-weight-lbs"
                    />
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="weightKg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weight (kg)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                            data-testid="input-weight-kg"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isImperial ? (
                  <div className="space-y-2">
                    <Label>Target Weight (lb)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={targetWeightLbs === "" ? "" : targetWeightLbs}
                      onChange={(e) => handleImperialTargetWeightChange(e.target.value === "" ? "" : Number(e.target.value))}
                      data-testid="input-target-weight-lbs"
                    />
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="targetWeightKg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Weight (kg)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                            data-testid="input-target-weight-kg"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="primaryGoal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Goal</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-primary-goal">
                            <SelectValue placeholder="Select goal" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GOAL_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="trainingExperience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Training Experience</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-experience">
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EXPERIENCE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <Heart className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold text-base">Health & Medical</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Injuries</Label>
                  <TagInput
                    value={(form.watch("injuries") as string[]) || []}
                    onChange={(v) => form.setValue("injuries", v)}
                    placeholder="e.g. torn ACL, tennis elbow"
                    testIdPrefix="injuries"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Mobility Limitations</Label>
                  <TagInput
                    value={(form.watch("mobilityLimitations") as string[]) || []}
                    onChange={(v) => form.setValue("mobilityLimitations", v)}
                    placeholder="e.g. limited shoulder ROM"
                    testIdPrefix="mobility"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Chronic Conditions</Label>
                  <TagInput
                    value={(form.watch("chronicConditions") as string[]) || []}
                    onChange={(v) => form.setValue("chronicConditions", v)}
                    placeholder="e.g. asthma, diabetes"
                    testIdPrefix="conditions"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sleepHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <span className="flex items-center gap-1.5">
                            <Moon className="h-3.5 w-3.5" />
                            Sleep (hrs/night)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.5"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                            data-testid="input-sleep"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="stressLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <span className="flex items-center gap-1.5">
                            <Brain className="h-3.5 w-3.5" />
                            Stress Level
                          </span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-stress">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {STRESS_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <Dumbbell className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold text-base">Training Capacity</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="activityLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <span className="flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5" />
                          Activity Level
                        </span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-activity">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ACTIVITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="trainingDaysOfWeek"
                  render={({ field }) => {
                    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
                    const dayLabels: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
                    const selected = (field.value as string[]) || [];
                    const toggle = (day: string) => {
                      const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day];
                      field.onChange(next);
                    };
                    return (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>
                          <span className="flex items-center gap-1.5">
                            <Flame className="h-3.5 w-3.5" />
                            Training Days ({selected.length}/week)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <div className="flex flex-wrap gap-1.5" data-testid="input-training-days">
                            {days.map((day) => (
                              <Button
                                key={day}
                                type="button"
                                size="sm"
                                variant={selected.includes(day) ? "default" : "outline"}
                                className={`toggle-elevate ${selected.includes(day) ? "toggle-elevated" : ""}`}
                                onClick={() => toggle(day)}
                                data-testid={`toggle-day-${day}`}
                              >
                                {dayLabels[day]}
                              </Button>
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="sessionDurationMinutes"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Session Duration (minutes)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={10}
                          max={180}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                          data-testid="input-session-duration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold text-base">Nutrition & Lifestyle</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Allergies</Label>
                  <TagInput
                    value={(form.watch("allergies") as string[]) || []}
                    onChange={(v) => form.setValue("allergies", v)}
                    placeholder="e.g. peanuts, shellfish"
                    testIdPrefix="allergies"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Intolerances</Label>
                  <TagInput
                    value={(form.watch("intolerances") as string[]) || []}
                    onChange={(v) => form.setValue("intolerances", v)}
                    placeholder="e.g. lactose, gluten"
                    testIdPrefix="intolerances"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Religious Restrictions</Label>
                  <TagInput
                    value={(form.watch("religiousRestrictions") as string[]) || []}
                    onChange={(v) => form.setValue("religiousRestrictions", v)}
                    placeholder="e.g. halal, kosher"
                    testIdPrefix="restrictions"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="appetiteLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Appetite Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-appetite">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {APPETITE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="spicePreference"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spice Preference</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-spice">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SPICE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pb-8">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save-profile"
            >
              {saveMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {isNew ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  {isNew ? "Create Profile" : "Update Profile"}
                </span>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
