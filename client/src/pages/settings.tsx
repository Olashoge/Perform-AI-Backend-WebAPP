import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateAccountSchema, changePasswordSchema } from "@shared/schema";
import type { GoalPlan } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  User, Target, Heart, ClipboardCheck, Dumbbell,
  Sun, Moon, Monitor, LogOut, ChevronRight, CalendarDays, Lock, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

const WEEK_START_OPTIONS = [
  { value: 0 as const, label: "Sunday" },
  { value: 1 as const, label: "Monday" },
];

type AccountForm = z.infer<typeof updateAccountSchema>;

const changePasswordClientSchema = changePasswordSchema.extend({
  confirmNewPassword: z.string().min(1, "Please confirm your new password"),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "Passwords do not match",
  path: ["confirmNewPassword"],
});
type ChangePasswordForm = z.infer<typeof changePasswordClientSchema>;

export default function SettingsPage() {
  const { user, logout, isLoading, updateUser, refreshUser } = useAuth();
  const { preference, setPreference } = useTheme();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(() => {
    try {
      const stored = localStorage.getItem("cal_weekStart");
      return stored === "1" ? 1 : 0;
    } catch { return 0; }
  });

  const { data: goalPlans } = useQuery<GoalPlan[]>({
    queryKey: ["/api/goal-plans"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [isLoading, user, navigate]);

  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(updateAccountSchema),
    defaultValues: { firstName: user?.firstName ?? "", email: user?.email ?? "" },
  });

  useEffect(() => {
    if (user) {
      accountForm.reset({ firstName: user.firstName ?? "", email: user.email ?? "" });
    }
  }, [user]);

  const passwordForm = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordClientSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (data: AccountForm) => {
      const res = await apiRequest("PATCH", "/api/account", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update account");
      }
      return res.json();
    },
    onSuccess: (data) => {
      updateUser({ firstName: data.firstName, email: data.email });
      toast({ title: "Profile updated", description: "Your account information has been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordForm) => {
      const res = await apiRequest("POST", "/api/account/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to change password");
      }
      return res.json();
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({ title: "Password changed", description: "Your password has been updated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Password change failed", description: err.message, variant: "destructive" });
    },
  });

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
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <User className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Account</h2>
            </div>
            {!user.firstName && (
              <div className="mb-4 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                Add your first name so we can personalise your experience.
              </div>
            )}
            <Form {...accountForm}>
              <form onSubmit={accountForm.handleSubmit(d => updateAccountMutation.mutate(d))} className="space-y-4">
                <FormField
                  control={accountForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="Your first name" data-testid="input-first-name" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={accountForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" data-testid="input-email" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={updateAccountMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateAccountMutation.isPending ? (
                    <div className="h-3.5 w-3.5 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-2" />
                  )}
                  Save Profile
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Security</h2>
            </div>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(d => changePasswordMutation.mutate(d))} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter current password" data-testid="input-current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="At least 6 characters" data-testid="input-new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmNewPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Repeat new password" data-testid="input-confirm-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={changePasswordMutation.isPending}
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending ? (
                    <div className="h-3.5 w-3.5 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-2" />
                  )}
                  Change Password
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <Target className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Active Wellness Plan</h2>
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
                    Create Wellness Plan
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

        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/preferences/exercise")} data-testid="card-exercise-preferences">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Dumbbell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="font-semibold text-base">Exercise Preferences</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Liked, disliked, and avoided exercises</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Week Starts On</h2>
            </div>
            <div className="flex gap-2">
              {WEEK_START_OPTIONS.map((opt) => {
                const isSelected = weekStartsOn === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setWeekStartsOn(opt.value);
                      try { localStorage.setItem("cal_weekStart", String(opt.value)); } catch {}
                    }}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-md border transition-colors duration-150 ${
                      isSelected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover-elevate"
                    }`}
                    data-testid={`button-weekstart-${opt.label.toLowerCase()}`}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Controls the calendar and dashboard week views.</p>
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
