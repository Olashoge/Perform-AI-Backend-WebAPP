import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2 } from "lucide-react";
import type { WeeklyAdaptation } from "@shared/schema";

const TREND_CONFIG: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
  improving: { label: "Improving", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
  stable: { label: "Stable", icon: Minus, color: "text-blue-600 dark:text-blue-400" },
  declining: { label: "Declining", icon: TrendingDown, color: "text-amber-600 dark:text-amber-400" },
  insufficient_data: { label: "Building baseline", icon: Sparkles, color: "text-muted-foreground" },
};

const ACTION_LABELS: Record<string, string> = {
  maintain: "Maintaining course",
  reduce_load: "Reducing load",
  increase_load: "Increasing intensity",
  simplify_plan: "Simplifying plans",
  nutrition_bias_training_days: "Nutrition bias on training days",
};

export function WeeklyAdaptationCard() {
  const { data: adaptation } = useQuery<WeeklyAdaptation | null>({
    queryKey: ["/api/weekly-adaptation/latest"],
  });

  const computeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/weekly-adaptation/compute");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weekly-adaptation/latest"] });
    },
  });

  if (!adaptation) {
    return (
      <Card data-testid="card-weekly-adaptation-empty">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Weekly Adaptation</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => computeMutation.mutate()}
              disabled={computeMutation.isPending}
              data-testid="button-compute-adaptation"
            >
              {computeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Complete a check-in to see your weekly adaptation insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  const signals = adaptation.computedSignals as any;
  const params = adaptation.adaptationParams as any;
  const trend = signals?.trend || "insufficient_data";
  const trendInfo = TREND_CONFIG[trend] || TREND_CONFIG.insufficient_data;
  const TrendIcon = trendInfo.icon;
  const action = params?.adjustmentAction || "maintain";

  return (
    <Card data-testid="card-weekly-adaptation">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium">Weekly Adaptation</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <TrendIcon className={`h-3 w-3 mr-1 ${trendInfo.color}`} />
              {trendInfo.label}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => computeMutation.mutate()}
              disabled={computeMutation.isPending}
              data-testid="button-recompute-adaptation"
            >
              {computeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {adaptation.summaryText && (
          <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-adaptation-summary">
            {adaptation.summaryText}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-xs" data-testid="badge-adaptation-action">
            {ACTION_LABELS[action] || action}
          </Badge>
          {signals?.adherenceScore != null && (
            <Badge variant="outline" className="text-xs" data-testid="badge-adherence-score">
              Score: {Math.round(signals.adherenceScore)}%
            </Badge>
          )}
          {params?.economyDelta?.regenBonus > 0 && (
            <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" data-testid="badge-economy-bonus">
              +1 regen bonus
            </Badge>
          )}
          {params?.economyDelta?.regenBonus < 0 && (
            <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" data-testid="badge-economy-penalty">
              -1 regen penalty
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
