import { useState, useMemo } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { WorkoutPlan, WorkoutPlanOutput, WorkoutSession, WorkoutExercise } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Dumbbell, ArrowLeft, ChevronDown, Clock, Loader2,
  Flame, Target, MoreVertical, Trash2,
  CalendarPlus, CalendarMinus, CalendarClock,
  Zap, Activity, Timer, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const INTENSITY_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  hard: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const MODE_ICONS: Record<string, typeof Dumbbell> = {
  strength: Dumbbell,
  cardio: Activity,
  mixed: Zap,
};

function ExerciseRow({ exercise, index }: { exercise: WorkoutExercise; index: number }) {
  return (
    <div className="flex items-start gap-3 py-2" data-testid={`exercise-${index}`}>
      <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{exercise.name}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {exercise.type && (
            <Badge variant="outline" className="text-[10px]">{exercise.type}</Badge>
          )}
          {exercise.sets && exercise.reps && (
            <span className="text-xs text-muted-foreground">{exercise.sets} x {exercise.reps}</span>
          )}
          {exercise.time && (
            <span className="text-xs text-muted-foreground">{exercise.time}</span>
          )}
          {exercise.restSeconds && (
            <span className="text-xs text-muted-foreground">Rest: {exercise.restSeconds}s</span>
          )}
        </div>
        {exercise.notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">{exercise.notes}</p>
        )}
      </div>
    </div>
  );
}

function SessionCard({ session, dayName, dayIndex }: { session: WorkoutSession; dayName: string; dayIndex: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const ModeIcon = MODE_ICONS[session.mode] || Dumbbell;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-visible">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate pb-3 px-3 sm:px-6">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground">{dayName}</span>
                  <Badge className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${INTENSITY_COLORS[session.intensity] || ""}`} variant="secondary">
                    {session.intensity}
                  </Badge>
                </div>
                <h3 className="text-sm font-semibold mt-1 line-clamp-2" data-testid={`text-session-focus-${dayIndex}`}>
                  {session.focus}
                </h3>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ModeIcon className="h-3 w-3" />
                    {session.mode}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {session.durationMinutes} min
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {session.main.length} exercises
                  </span>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-3 sm:px-6 pb-4 space-y-4">
            {session.warmup && session.warmup.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Warm-up</h4>
                <ul className="space-y-1">
                  {session.warmup.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Main Workout</h4>
              <div className="divide-y divide-border">
                {session.main.map((ex, i) => (
                  <ExerciseRow key={i} exercise={ex} index={i} />
                ))}
              </div>
            </div>

            {session.finisher && session.finisher.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Finisher</h4>
                <ul className="space-y-1">
                  {session.finisher.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Flame className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.cooldown && session.cooldown.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cool-down</h4>
                <ul className="space-y-1">
                  {session.cooldown.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {session.coachingCues && session.coachingCues.length > 0 && (
              <div className="bg-muted/50 rounded-md p-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Coaching Tips</h4>
                <ul className="space-y-1">
                  {session.coachingCues.map((cue, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{cue}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function WorkoutView() {
  const { user, isLoading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: plan, isLoading } = useQuery<WorkoutPlan>({
    queryKey: ["/api/workout", id],
    enabled: !!user && !!id,
  });

  const scheduleMutation = useMutation({
    mutationFn: async (startDate: string | null) => {
      const res = await apiRequest("POST", `/api/workout/${id}/start-date`, { startDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workout", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      setShowDatePicker(false);
    },
    onError: () => {
      toast({ title: "Failed to update schedule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/workouts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workouts"] });
      toast({ title: "Workout plan deleted" });
      navigate("/plans");
    },
    onError: () => {
      toast({ title: "Failed to delete", variant: "destructive" });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b px-3 sm:px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-6 w-48" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  if (!plan || !plan.planJson) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Dumbbell className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Workout plan not found</p>
          <Link href="/plans">
            <Button variant="outline" data-testid="button-back-plans">Back to Plans</Button>
          </Link>
        </div>
      </div>
    );
  }

  const planJson = plan.planJson as WorkoutPlanOutput;
  const prefs = plan.preferencesJson as any;
  const workoutDays = planJson.days.filter(d => d.isWorkoutDay);
  const restDays = planJson.days.filter(d => !d.isWorkoutDay);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b px-3 sm:px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/plans">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Dumbbell className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-sm sm:text-base font-semibold truncate" data-testid="text-plan-title">
              {planJson.title}
            </h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-menu">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowDatePicker(true)} data-testid="menu-schedule">
                <CalendarPlus className="h-4 w-4 mr-2" />
                {plan.planStartDate ? "Reschedule" : "Schedule"}
              </DropdownMenuItem>
              {plan.planStartDate && (
                <DropdownMenuItem onClick={() => scheduleMutation.mutate(null)} data-testid="menu-unschedule">
                  <CalendarMinus className="h-4 w-4 mr-2" />
                  Unschedule
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive" data-testid="menu-delete">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="text-plan-summary">{planJson.summary}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {plan.planStartDate && (
                <Badge variant="outline" className="text-xs" data-testid="badge-start-date">
                  <CalendarClock className="h-3 w-3 mr-1" />
                  Starts {plan.planStartDate}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {workoutDays.length} workout days
              </Badge>
              <Badge variant="outline" className="text-xs">
                {restDays.length} rest days
              </Badge>
            </div>

            <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" data-testid="button-toggle-settings">
                  <span className="text-xs">Plan Settings</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                  <div><span className="font-medium">Goal:</span> {prefs?.goal?.replace("_", " ")}</div>
                  <div><span className="font-medium">Location:</span> {prefs?.location?.replace("_", " ")}</div>
                  <div><span className="font-medium">Mode:</span> {prefs?.trainingMode}</div>
                  <div><span className="font-medium">Session:</span> {prefs?.sessionLength} min</div>
                  <div><span className="font-medium">Level:</span> {prefs?.experienceLevel}</div>
                  <div><span className="font-medium">Focus:</span> {prefs?.focusAreas?.join(", ")}</div>
                  {prefs?.limitations && <div className="col-span-2"><span className="font-medium">Limitations:</span> {prefs.limitations}</div>}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {planJson.days.map((day) => {
            if (!day.isWorkoutDay || !day.session) {
              return (
                <Card key={day.dayIndex} className="overflow-visible" data-testid={`card-rest-day-${day.dayIndex}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">R</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{day.dayName}</p>
                      <p className="text-xs text-muted-foreground">Rest Day</p>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <SessionCard
                key={day.dayIndex}
                session={day.session}
                dayName={day.dayName}
                dayIndex={day.dayIndex}
              />
            );
          })}
        </div>

        {planJson.progressionNotes && planJson.progressionNotes.length > 0 && (
          <Card>
            <CardContent className="p-4 sm:p-6 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Progression Notes
              </h3>
              <ul className="space-y-2">
                {planJson.progressionNotes.map((note, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <ChevronRight className="h-3 w-3 mt-1 text-primary shrink-0" />
                    {note}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Schedule Workout Plan</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={plan.planStartDate ? new Date(plan.planStartDate + "T00:00:00") : undefined}
              onSelect={(date) => {
                if (date) {
                  const dateStr = format(date, "yyyy-MM-dd");
                  scheduleMutation.mutate(dateStr);
                }
              }}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              data-testid="calendar-date-picker"
            />
          </div>
          {scheduleMutation.isPending && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Scheduling...</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workout Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the workout plan. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
