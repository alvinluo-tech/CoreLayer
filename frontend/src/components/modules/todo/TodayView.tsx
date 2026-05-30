import type React from "react";
import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { useTaskStore } from "@/stores/taskStore";

const statusIcon = {
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  in_progress: <Clock className="h-4 w-4 text-yellow-500" />,
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
};

const priorityLabel: Record<number, React.ReactNode> = {
  1: <Badge variant="destructive">紧急</Badge>,
  2: <Badge variant="default">高</Badge>,
  3: <Badge variant="secondary">中</Badge>,
  4: <Badge variant="outline">低</Badge>,
  5: <Badge variant="outline">最低</Badge>,
};

export function TodayView() {
  const { tasks, isLoading, error, fetchTasks } = useTaskStore();

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const today = new Date().toISOString().split("T")[0];
  const todayTasks = tasks.filter(
    (t) =>
      t.status !== "deleted" &&
      (t.dueDate === today || (t.priority <= 2 && t.status !== "done")),
  );
  const completed = todayTasks.filter((t) => t.status === "done").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">今日任务</CardTitle>
          <span className="text-xs text-muted-foreground">
            {completed}/{todayTasks.length} 完成
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {error && !isLoading ? (
          <p className="text-xs text-destructive text-center py-4">⚠️ {error}—请尝试刷新页面</p>
        ) : isLoading && tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">加载中...</p>
        ) : todayTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">暂无今日任务</p>
        ) : (
          <div className="space-y-2">
            {todayTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                {statusIcon[task.status as keyof typeof statusIcon]}
                <span className="flex-1 truncate">{task.title}</span>
                {priorityLabel[task.priority]}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
