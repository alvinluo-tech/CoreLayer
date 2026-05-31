import { useEffect, useState } from 'react';
import * as tauri from '@/lib/tauri';
import {
  Database,
  Trash2,
  Eye,
  Search,
  RefreshCw,
  AlertTriangle,
  FileJson,
  X,
  Layers,
} from 'lucide-react';

interface DbManagerProps {
  className?: string;
}

export function DbManager({ className }: DbManagerProps) {
  const [tables, setTables] = useState<tauri.DbTableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('conversations');
  const [rows, setRows] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Row Detail Viewer
  const [activeRowDetail, setActiveRowDetail] = useState<any | null>(null);

  // Purging Table confirmation state
  const [purgingTable, setPurgingTable] = useState<string | null>(null);
  const [purgeInput, setPurgeInput] = useState('');

  const loadTables = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await tauri.dbManagerListTables();
      if (res.success) {
        const tablesList = res.tables || [];
        setTables(tablesList);
        if (tablesList.length > 0 && !selectedTable) {
          const firstTable = tablesList[0];
          if (firstTable) {
            setSelectedTable(firstTable.id);
          }
        }
      } else {
        setError('获取数据表信息失败');
      }
    } catch (err) {
      setError(`加载错误: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRows = async (tableName: string) => {
    setIsLoadingRows(true);
    setActiveRowDetail(null);
    try {
      const res = await tauri.dbManagerGetTableRows(tableName);
      if (res.success) {
        setRows(res.rows);
      }
    } catch (err) {
      console.error('加载数据行错误:', err);
      setError(`加载数据行失败: ${String(err)}`);
    } finally {
      setIsLoadingRows(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      loadRows(selectedTable);
    }
  }, [selectedTable]);

  const handleDeleteRow = async (id: string) => {
    if (!selectedTable) return;
    try {
      const res = await tauri.dbManagerDeleteRow(selectedTable, id);
      if (res.success && res.deleted) {
        // Refresh local rows list
        setRows((prev) => prev.filter((r) => r.id !== id));
        // Refresh counts
        setTables((prev) =>
          prev.map((t) => (t.id === selectedTable ? { ...t, count: Math.max(0, t.count - 1) } : t))
        );
        if (activeRowDetail?.id === id) {
          setActiveRowDetail(null);
        }
      }
    } catch (err) {
      console.error('删除数据行错误:', err);
      setError(`删除失败: ${String(err)}`);
    }
  };

  const handleClearTable = async () => {
    if (!selectedTable || purgingTable !== selectedTable) return;
    try {
      setIsLoadingRows(true);
      const res = await tauri.dbManagerClearTable(selectedTable);
      if (res.success) {
        setRows([]);
        setTables((prev) => prev.map((t) => (t.id === selectedTable ? { ...t, count: 0 } : t)));
        setActiveRowDetail(null);
        setPurgingTable(null);
        setPurgeInput('');
      }
    } catch (err) {
      console.error('清空数据表错误:', err);
      setError(`清空失败: ${String(err)}`);
    } finally {
      setIsLoadingRows(false);
    }
  };

  // Dynamic Column Mapping for premium display
  const getColumns = (tableId: string) => {
    switch (tableId) {
      case 'conversations':
        return [
          { key: 'id', label: 'ID', render: (r: any) => r.id.substring(0, 8) + '...' },
          { key: 'title', label: '会话标题', render: (r: any) => r.title || '未命名会话' },
          {
            key: 'createdAt',
            label: '创建时间',
            render: (r: any) => new Date(r.createdAt).toLocaleString('zh-CN'),
          },
        ];
      case 'tasks':
        return [
          { key: 'title', label: '任务名称', render: (r: any) => r.title },
          {
            key: 'priority',
            label: '优先级',
            render: (r: any) => (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  r.priority >= 4
                    ? 'bg-red-500/10 text-red-500'
                    : r.priority === 3
                      ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-blue-500/10 text-blue-500'
                }`}
              >
                P{r.priority}
              </span>
            ),
          },
          {
            key: 'status',
            label: '状态',
            render: (r: any) => (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  r.status === 'done'
                    ? 'bg-green-500/10 text-green-500'
                    : r.status === 'in_progress'
                      ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {r.status}
              </span>
            ),
          },
          {
            key: 'createdAt',
            label: '时间',
            render: (r: any) => new Date(r.createdAt).toLocaleDateString('zh-CN'),
          },
        ];
      case 'articles':
        return [
          { key: 'title', label: '文章标题', render: (r: any) => r.title },
          { key: 'category', label: '分类', render: (r: any) => r.category || '未分类' },
          {
            key: 'status',
            label: '状态',
            render: (r: any) => (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  r.status === 'finished'
                    ? 'bg-green-500/10 text-green-500'
                    : r.status === 'reading'
                      ? 'bg-blue-500/10 text-blue-500'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {r.status}
              </span>
            ),
          },
          { key: 'rating', label: '评分', render: (r: any) => (r.rating ? `⭐ ${r.rating}` : '-') },
        ];
      case 'memories':
        return [
          { key: 'type', label: '类型', render: (r: any) => r.type },
          {
            key: 'key',
            label: '健值',
            render: (r: any) => (
              <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">{r.key}</code>
            ),
          },
          {
            key: 'content',
            label: '记忆内容',
            render: (r: any) =>
              r.content.length > 30 ? r.content.substring(0, 30) + '...' : r.content,
          },
        ];
      default:
        return [{ key: 'id', label: 'ID', render: (r: any) => r.id }];
    }
  };

  // Client-side filtering
  const filteredRows = rows.filter((row) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();

    // Check main fields
    if (row.id && String(row.id).toLowerCase().includes(q)) return true;
    if (row.title && String(row.title).toLowerCase().includes(q)) return true;
    if (row.content && String(row.content).toLowerCase().includes(q)) return true;
    if (row.key && String(row.key).toLowerCase().includes(q)) return true;
    if (row.category && String(row.category).toLowerCase().includes(q)) return true;
    return false;
  });

  const columns = getColumns(selectedTable);

  return (
    <div className={`flex flex-col h-[62vh] ${className}`}>
      {/* Top Controls */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            高级数据管理
          </h3>
          <p className="text-xs text-muted-foreground">
            浏览表行数据，删除损坏记录或重置数据。自动兼容本地 SQLite 及云端 Supabase 引擎。
          </p>
        </div>
        <button
          onClick={() => {
            loadTables();
            if (selectedTable) loadRows(selectedTable);
          }}
          disabled={isLoading || isLoadingRows}
          className="p-1.5 rounded-md hover:bg-muted border border-border/60 transition-colors flex items-center gap-1.5 text-xs font-medium"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading || isLoadingRows ? 'animate-spin' : ''}`}
          />
          刷新数据
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 mb-3">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Main Grid Splitter */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left Side: Table Selector */}
        <div className="col-span-3 border border-border/85 rounded-xl bg-muted/10 p-2.5 flex flex-col space-y-2 overflow-y-auto">
          <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase px-2 mb-1 block">
            系统核心数据表
          </span>
          {tables.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTable(t.id)}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs transition-all ${
                selectedTable === t.id
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'hover:bg-muted/70 text-foreground'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t.name.split(' ')[0]}</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  selectedTable === t.id
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}

          {/* Purge Zone inside selector bottom */}
          <div className="pt-4 mt-auto border-t border-border/60">
            {selectedTable && (
              <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/10 space-y-2">
                <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> 危险区域
                </span>

                {purgingTable !== selectedTable ? (
                  <button
                    onClick={() => setPurgingTable(selectedTable)}
                    className="w-full py-1.5 rounded bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all text-xs font-semibold"
                  >
                    清空本表数据
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-muted-foreground block">
                      请输入{' '}
                      <code className="font-mono text-red-500 bg-red-500/10 px-1 rounded">
                        CLEAR
                      </code>{' '}
                      以确认:
                    </span>
                    <input
                      type="text"
                      value={purgeInput}
                      onChange={(e) => setPurgeInput(e.target.value)}
                      placeholder="CLEAR"
                      className="w-full text-center py-1 text-xs bg-background border border-red-500/30 rounded focus:outline-none"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setPurgingTable(null);
                          setPurgeInput('');
                        }}
                        className="flex-1 py-1 text-[10px] border rounded hover:bg-muted text-foreground transition-all"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleClearTable}
                        disabled={purgeInput !== 'CLEAR'}
                        className="flex-1 py-1 text-[10px] bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-all disabled:opacity-40"
                      >
                        确认清空
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Data Browser Grid */}
        <div className="col-span-9 flex flex-col border border-border/85 rounded-xl bg-card overflow-hidden min-h-0">
          {/* Header Filtering Search Bar */}
          <div className="p-2.5 border-b border-border/60 bg-muted/5 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索 ID、标题、关键字或记录内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border rounded-lg focus:outline-none focus:border-primary"
              />
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1.5 text-xs hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-all"
              >
                清除
              </button>
            )}
          </div>

          {/* Table Data list */}
          <div className="flex-1 overflow-y-auto relative">
            {isLoadingRows ? (
              <div className="absolute inset-0 flex items-center justify-center bg-card/60 backdrop-blur-[1px] z-10">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  <span>正在调取数据表行...</span>
                </div>
              </div>
            ) : null}

            {filteredRows.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-muted-foreground">
                <FileJson className="h-8 w-8 mb-2 opacity-35" />
                <p className="text-xs">暂无匹配的数据行记录</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/30 border-b border-border/50 sticky top-0 z-20 backdrop-blur">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className="p-3 font-semibold text-muted-foreground border-r border-border/30"
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="p-3 font-semibold text-muted-foreground text-center">
                      数据操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-accent/40 transition-colors ${
                        activeRowDetail?.id === row.id ? 'bg-accent/60' : ''
                      }`}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className="p-3 align-middle max-w-[200px] truncate border-r border-border/30"
                        >
                          {col.render(row)}
                        </td>
                      ))}
                      <td className="p-3 align-middle text-center flex items-center justify-center gap-2">
                        <button
                          onClick={() => setActiveRowDetail(row)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-0.5 text-[10px]"
                          title="查看底层 JSON 属性"
                        >
                          <Eye className="h-3 w-3 text-primary" /> 查看
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('确定要永久删除此条记录吗？此操作无法撤销。')) {
                              handleDeleteRow(row.id);
                            }
                          }}
                          className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all flex items-center gap-0.5 text-[10px]"
                          title="彻底删除该行"
                        >
                          <Trash2 className="h-3 w-3" /> 删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Table Footer Stats */}
          <div className="p-2 border-t border-border/50 bg-muted/10 flex justify-between items-center text-[10px] text-muted-foreground font-mono">
            <span>总计行数: {rows.length} 条</span>
            {searchQuery && <span>过滤后: {filteredRows.length} 条</span>}
          </div>
        </div>
      </div>

      {/* Row detail Side Sheet Overlay */}
      {activeRowDetail && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex justify-end z-40 transition-all">
          <div className="w-[60%] bg-card border-l border-border h-full flex flex-col shadow-2xl p-4 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b mb-3">
              <div className="flex items-center gap-2">
                <FileJson className="h-4.5 w-4.5 text-primary" />
                <h4 className="text-sm font-semibold truncate max-w-[240px]">数据记录详情</h4>
              </div>
              <button
                onClick={() => setActiveRowDetail(null)}
                className="p-1 rounded-md hover:bg-muted transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Fields list */}
            <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[11px] leading-relaxed">
              <div className="p-2 rounded bg-muted/40 border border-border/60">
                <span className="text-[10px] text-muted-foreground font-bold uppercase block mb-1">
                  主键 ID
                </span>
                <span className="font-semibold text-foreground select-all">
                  {activeRowDetail.id}
                </span>
              </div>

              <div className="flex flex-col h-[38vh] border rounded-lg overflow-hidden">
                <span className="text-[10px] font-bold text-muted-foreground uppercase px-3 py-1.5 bg-muted/40 border-b block">
                  数据行完整内容 (JSON)
                </span>
                <pre className="flex-1 p-3 bg-muted/20 font-mono text-[10px] text-muted-foreground overflow-auto whitespace-pre leading-relaxed select-all">
                  {JSON.stringify(activeRowDetail, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t mt-3 flex justify-end">
              <button
                onClick={() => setActiveRowDetail(null)}
                className="px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-md text-xs font-semibold transition-all"
              >
                关闭面板
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
