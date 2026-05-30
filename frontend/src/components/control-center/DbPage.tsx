import { DbManager } from "../settings/DbManager";

export function DbPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">数据库管理</h2>
        <p className="text-sm text-muted-foreground">直接在客户端管理本地 SQLite 和云端数据库的数据表行数据</p>
      </div>

      <div className="border border-border/80 rounded-xl p-4 bg-card/50 backdrop-blur-sm shadow-sm">
        <DbManager />
      </div>
    </div>
  );
}
