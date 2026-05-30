import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { DbManager } from "../settings/DbManager";
import * as tauri from "@/lib/tauri";
import {
  Database,
  Server,
  Cloud,
  Settings,
  Table,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DbTab = "config" | "explorer";

export function DbPage() {
  const [activeTab, setActiveTab] = useState<DbTab>("config");
  
  // Settings Store
  const {
    storageMode,
    fetchSettings,
    setStorageMode,
    fetchDbStats,
    dbStats,
  } = useSettingsStore();

  // Local Form state
  const [selectedMode, setSelectedMode] = useState<"local" | "cloud" | "postgres">("local");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [postgresUrl, setPostgresUrl] = useState("");
  
  // Password Visibility
  const [showSupabaseKey, setShowSupabaseKey] = useState(false);
  const [showPostgresUrl, setShowPostgresUrl] = useState(false);

  // Status and loaders
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch initial config
  const fetchConfig = async () => {
    try {
      const config = await tauri.dbConfigGet();
      setSupabaseUrl(config.supabaseUrl || "");
      setSupabaseKey(config.supabaseServiceKey || "");
      setPostgresUrl(config.postgresUrl || "");
    } catch (e) {
      console.error("加载外接数据库配置失败:", e);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchConfig();
    fetchDbStats();
  }, []);

  useEffect(() => {
    if (storageMode) {
      setSelectedMode(storageMode);
    }
  }, [storageMode]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const type = (selectedMode === "cloud" ? "supabase" : "postgres") as "supabase" | "postgres";
      const params = {
        type,
        supabaseUrl,
        supabaseServiceKey: supabaseKey,
        postgresUrl,
      };
      const res = await tauri.dbConfigTest(params);
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, error: String(err) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);
    try {
      // 1. Save config to config.json
      const configParams = {
        supabaseUrl,
        supabaseServiceKey: supabaseKey,
        postgresUrl,
      };
      await tauri.dbConfigSet(configParams);
      
      // 2. Hot-switch storageMode
      await setStorageMode(selectedMode);
      await fetchSettings();
      await fetchDbStats();
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("保存外接配置失败:", err);
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMigrateSchema = async () => {
    if (!confirm("这将在您配置的 PostgreSQL 数据库中自动创建所有 Jarvis 必需的数据表。确定要继续吗？")) return;
    setIsMigrating(true);
    setMigrationResult(null);
    try {
      // 1. Make sure we save the credentials first
      const configParams = {
        supabaseUrl,
        supabaseServiceKey: supabaseKey,
        postgresUrl,
      };
      await tauri.dbConfigSet(configParams);
      
      // 2. Run migrations
      const res = await tauri.dbConfigMigrate();
      if (res.success) {
        setMigrationResult({ success: true, message: res.message });
      } else {
        setMigrationResult({ success: false, error: "自动初始化失败，请检查数据库配置与权限" });
      }
    } catch (err) {
      setMigrationResult({ success: false, error: String(err) });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">数据库与存储配置</h2>
          <p className="text-sm text-muted-foreground">
            配置本地或外接数据库作为 Jarvis 的主存储仓库，满足本地便携与多端云同步。
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg border border-border/40">
          <button
            onClick={() => setActiveTab("config")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
              activeTab === "config"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            存储连接配置
          </button>
          <button
            onClick={() => setActiveTab("explorer")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
              activeTab === "explorer"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Table className="h-3.5 w-3.5" />
            高级数据浏览器
          </button>
        </div>
      </div>

      {activeTab === "config" ? (
        <div className="grid grid-cols-12 gap-6">
          {/* Left panel: Form */}
          <div className="col-span-8 space-y-6">
            <Card className="p-5 border-border/80 space-y-5">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">存储方式选择 (Storage Mode)</h3>
                <p className="text-xs text-muted-foreground">
                  Jarvis 默认采用本地 SQLite 运行。您可以动态热切换为 Supabase 云端存储或任何外接兼容的通用 PostgreSQL 云端实例。
                </p>
              </div>

              {/* Mode Selectors */}
              <div className="grid grid-cols-3 gap-3">
                {/* SQLite */}
                <button
                  onClick={() => setSelectedMode("local")}
                  className={`flex flex-col items-center gap-2 p-3.5 rounded-lg border-2 text-center transition-all ${
                    selectedMode === "local"
                      ? "border-primary bg-primary/5 font-semibold"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Database className={`h-6 w-6 ${selectedMode === "local" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold">本地 SQLite</p>
                    <p className="text-[10px] text-muted-foreground">本地零配置运行</p>
                  </div>
                </button>

                {/* Supabase */}
                <button
                  onClick={() => setSelectedMode("cloud")}
                  className={`flex flex-col items-center gap-2 p-3.5 rounded-lg border-2 text-center transition-all ${
                    selectedMode === "cloud"
                      ? "border-primary bg-primary/5 font-semibold"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Cloud className={`h-6 w-6 ${selectedMode === "cloud" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold">外接 Supabase</p>
                    <p className="text-[10px] text-muted-foreground">多端无缝云端存储</p>
                  </div>
                </button>

                {/* General Postgres */}
                <button
                  onClick={() => setSelectedMode("postgres")}
                  className={`flex flex-col items-center gap-2 p-3.5 rounded-lg border-2 text-center transition-all ${
                    selectedMode === "postgres"
                      ? "border-primary bg-primary/5 font-semibold"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Server className={`h-6 w-6 ${selectedMode === "postgres" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold">通用 PostgreSQL</p>
                    <p className="text-[10px] text-muted-foreground">通用 PG 云端数据库</p>
                  </div>
                </button>
              </div>

              {/* Dynamic Credential Forms */}
              {selectedMode === "local" && (
                <div className="p-4 rounded-lg bg-muted/30 border border-dashed border-border space-y-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500" /> 本地 SQLite 已就绪
                  </span>
                  <p className="text-xs text-muted-foreground">
                    所有对话交互历史、知识库及任务列表，皆安全保存在本地轻量级数据库中。无需配置任何环境变量即可流畅运行。
                  </p>
                </div>
              )}

              {selectedMode === "cloud" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-3.5 rounded-lg bg-blue-500/5 border border-blue-500/10 space-y-1 text-xs">
                    <span className="font-semibold text-blue-500 flex items-center gap-1">
                      <Cloud className="h-3.5 w-3.5" /> Supabase 外接配置
                    </span>
                    <p className="text-muted-foreground text-[11px]">
                      Jarvis 使用 Supabase Serverless 进行多端云同步。输入您的项目凭据，并确保相应的表结构已在 Supabase 实例中创建完毕。
                    </p>
                  </div>

                  {/* Supabase URL */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Supabase Project URL</label>
                    <input
                      type="text"
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      placeholder="https://your-project.supabase.co"
                      className="w-full px-3 py-2 bg-background border border-border/80 rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Supabase Key */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center justify-between">
                      <span>Supabase Service Role Key</span>
                      <span className="text-[10px] text-red-500 font-normal">具有读写权限的高权限 Key</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showSupabaseKey ? "text" : "password"}
                        value={supabaseKey}
                        onChange={(e) => setSupabaseKey(e.target.value)}
                        placeholder="eyJhbGciOi..."
                        className="w-full pl-3 pr-10 py-2 bg-background border border-border/80 rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => setShowSupabaseKey(!showSupabaseKey)}
                        className="absolute right-2 top-2 p-1 rounded hover:bg-muted text-muted-foreground"
                      >
                        {showSupabaseKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedMode === "postgres" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/10 space-y-1 text-xs">
                    <span className="font-semibold text-amber-600 flex items-center gap-1">
                      <Server className="h-3.5 w-3.5" /> 通用 PostgreSQL 外接配置
                    </span>
                    <p className="text-muted-foreground text-[11px]">
                      支持连接至 Neon.tech, AWS RDS, Aiven 或您自己搭载的任何 PostgreSQL 数据库。配置完成后，您可以直接在下方一键初始化所需表结构。
                    </p>
                  </div>

                  {/* Postgres Connection String */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center justify-between">
                      <span>数据库连接 URL (Database Connection String)</span>
                      <span className="text-[10px] text-muted-foreground">需具有 CREATE TABLE 及 CRUD 权限</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPostgresUrl ? "text" : "password"}
                        value={postgresUrl}
                        onChange={(e) => setPostgresUrl(e.target.value)}
                        placeholder="postgres://username:password@hostname:5432/dbname?sslmode=require"
                        className="w-full pl-3 pr-10 py-2 bg-background border border-border/80 rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => setShowPostgresUrl(!showPostgresUrl)}
                        className="absolute right-2 top-2 p-1 rounded hover:bg-muted text-muted-foreground"
                      >
                        {showPostgresUrl ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t flex justify-between gap-3">
                {selectedMode !== "local" ? (
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTesting || (selectedMode === "cloud" ? (!supabaseUrl || !supabaseKey) : !postgresUrl)}
                    className="gap-1.5 text-xs h-9"
                  >
                    {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    测试连接性
                  </Button>
                ) : (
                  <div />
                )}

                <div className="flex gap-2">
                  {selectedMode === "postgres" && (
                    <Button
                      variant="outline"
                      onClick={handleMigrateSchema}
                      disabled={isMigrating || !postgresUrl}
                      className="gap-1.5 border-amber-500/20 text-amber-600 hover:bg-amber-500/5 text-xs h-9"
                    >
                      {isMigrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings className="h-3.5 w-3.5" />}
                      一键初始化表结构
                    </Button>
                  )}
                  
                  <Button
                    onClick={handleSaveConfig}
                    disabled={isSaving}
                    className="gap-1.5 text-xs h-9 bg-primary text-primary-foreground font-semibold"
                  >
                    {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    保存并热切换
                  </Button>
                </div>
              </div>
            </Card>

            {/* Connection Test Result Messages */}
            {testResult && (
              <div className={`p-4 rounded-xl border flex items-start gap-2.5 animate-in fade-in duration-200 text-xs ${
                testResult.success 
                  ? "bg-green-500/5 border-green-500/20 text-green-600" 
                  : "bg-red-500/5 border-red-500/20 text-red-500"
              }`}>
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-green-500 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-semibold block">连接性测试成功！</span>
                      <span>云端数据库可访问，连通性延时: <strong className="font-mono text-xs">{testResult.latencyMs}ms</strong>。</span>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4.5 w-4.5 shrink-0 text-red-500 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-semibold block">连接测试失败</span>
                      <span className="leading-relaxed">{testResult.error || "请检查网络环境、证书合法性或防火墙规则。"}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Migration Schema Results */}
            {migrationResult && (
              <div className={`p-4 rounded-xl border flex items-start gap-2.5 animate-in fade-in duration-200 text-xs ${
                migrationResult.success 
                  ? "bg-green-500/5 border-green-500/20 text-green-600" 
                  : "bg-red-500/5 border-red-500/20 text-red-500"
              }`}>
                {migrationResult.success ? (
                  <>
                    <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-green-500 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-semibold block">数据表自动初始化成功！</span>
                      <span>{migrationResult.message || "已经创建所需的数据库表。您现在可以立刻开启云数据库存储。"}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4.5 w-4.5 shrink-0 text-red-500 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-semibold block">初始化失败</span>
                      <span>{migrationResult.error || "请确保连接串拥有 DDL/表创建权限。"}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Save success banner */}
            {saveSuccess && (
              <div className="p-3.5 rounded-xl border bg-green-500/5 border-green-500/20 text-green-600 flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>连接配置保存成功，系统存储工厂已即时完成切换！</span>
              </div>
            )}

            {/* Save error banner */}
            {saveError && (
              <div className="p-3.5 rounded-xl border bg-destructive/5 border-destructive/20 text-destructive flex items-center gap-2 text-xs">
                <XCircle className="h-4 w-4" />
                <span>保存失败: {saveError}</span>
              </div>
            )}
          </div>

          {/* Right panel: Info & Health */}
          <div className="col-span-4 space-y-4">
            <Card className="p-4 space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                当前运行状态
              </h4>
              <div className="flex items-center justify-between py-2 border-b border-border/40 text-xs">
                <span className="text-muted-foreground">活动存储介质</span>
                <span className="font-bold text-foreground">
                  {storageMode === "local" ? "本地 SQLite" : storageMode === "cloud" ? "外接 Supabase" : "通用 PG 云数据库"}
                </span>
              </div>
              
              {storageMode === "local" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">本地文件大小</span>
                    <span className="font-mono text-foreground font-semibold">{dbStats?.dbSize || "检测中"}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">本地会话条数</span>
                    <span className="font-mono text-foreground">{dbStats?.entryCount?.conversations || 0} 行</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded bg-muted/40 border border-border/50 text-[11px] text-muted-foreground leading-relaxed">
                  当前处于 <strong className="text-foreground">云端数据库存储模式</strong>。
                  本地 SQLite 将作为离线缓存或备用媒介运行，所有交互自动归档云端。
                </div>
              )}
            </Card>

            <Card className="p-4 bg-muted/20 border-dashed border-border space-y-3">
              <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> 温馨提示
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                切换存储媒介不会物理转移旧数据。例如，您从 SQLite 切换到 Supabase，本地原有的会话和任务不会自动同步到云端。每种介质拥有独立隔离的环境。
              </p>
            </Card>
          </div>
        </div>
      ) : (
        <div className="border border-border/80 rounded-xl p-4 bg-card/50 backdrop-blur-sm shadow-sm">
          <DbManager />
        </div>
      )}
    </div>
  );
}
