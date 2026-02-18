import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Timer, Repeat, RotateCcw, Sparkles, Gift, Info, Loader2,
} from "lucide-react";

export interface AllowanceStateData {
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

export function AllowancePanel({ planId }: { planId?: string }) {
  const queryKey = planId
    ? ["/api/allowance/current", planId]
    : ["/api/allowance/current"];

  const { data: allowanceState, isLoading } = useQuery<AllowanceStateData | null>({
    queryKey,
    queryFn: async () => {
      const url = planId
        ? `/api/allowance/current?mealPlanId=${planId}`
        : `/api/allowance/current`;
      const res = await fetch(url, { credentials: "include" });
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
      queryClient.invalidateQueries({ queryKey });
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
