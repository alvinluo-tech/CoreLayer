import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrendingUp, CheckCircle2, BookOpen, Target } from "lucide-react";
import { useReviewStore } from "@/stores/reviewStore";

export function DailySummary() {
  const { dailySummary, isLoading, error, fetchDailySummary } = useReviewStore();

  useEffect(() => {
    fetchDailySummary();
  }, [fetchDailySummary]);

  const stats = dailySummary ?? {
    tasksCompleted: 0,
    tasksTotal: 0,
    completionRate: 0,
    articlesRead: 0,
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">今日总结</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-xs text-destructive text-center py-4">{error}</p>
        ) : isLoading && !dailySummary ? (
          <p className="text-xs text-muted-foreground text-center py-4">加载中...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-muted-foreground text-xs">任务完成</p>
                <p className="font-medium">
                  {stats.tasksCompleted}/{stats.tasksTotal}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-muted-foreground text-xs">完成率</p>
                <p className="font-medium">{stats.completionRate}%</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-muted-foreground text-xs">阅读</p>
                <p className="font-medium">{stats.articlesRead} 篇</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-muted-foreground text-xs">连续天数</p>
                <p className="font-medium">-</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
