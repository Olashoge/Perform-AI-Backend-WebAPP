import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import NewPlan from "@/pages/new-plan";
import PlanView from "@/pages/plan-view";
import PlanGenerating from "@/pages/plan-generating";
import PlansList from "@/pages/plans-list";
import PreferencesPage from "@/pages/preferences";
import PlanCalendar from "@/pages/plan-calendar";
import NewWorkout from "@/pages/new-workout";
import WorkoutView from "@/pages/workout-view";
import WorkoutGenerating from "@/pages/workout-generating";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/new-plan" component={NewPlan} />
      <Route path="/plan/:id/generating" component={PlanGenerating} />
      <Route path="/plan/:id" component={PlanView} />
      <Route path="/plans" component={PlansList} />
      <Route path="/preferences" component={PreferencesPage} />
      <Route path="/calendar" component={PlanCalendar} />
      <Route path="/workouts/new" component={NewWorkout} />
      <Route path="/workout/:id/generating" component={WorkoutGenerating} />
      <Route path="/workout/:id" component={WorkoutView} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
