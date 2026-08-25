import { useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';

function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}天${h}小时` : h > 0 ? `${h}小时${m}分` : `${m}分钟`;
}

/** 系统运行监控：健康状态 + JVM + 审计统计（仅管理员） */
export default function SystemMonitorPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => bizApi.systemMonitor().then(r => { if (alive) { setData(r.data); setError(''); } }).catch(e => { if (alive) setError(e.message || '加载失败'); });
    load();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">监控数据加载中...</p></div>;

  const h = data.health || {};
  const a = data.audit || {};
  const heapPct = h.heap_max_mb > 0 ? Math.round((h.heap_used_mb / h.heap_max_mb) * 100) : 0;
  const maxUserCnt = Math.max(...(a.top_users || []).map((u: any) => Number(u.cnt) || 0), 1);
  const maxModCnt = Math.max(...(a.top_modules || []).map((u: any) => Number(u.cnt) || 0), 1);

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1300px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">📡 系统运行监控</h2>
          <p className="text-sm text-slate-400 mt-1">服务健康 · JVM 资源 · 审计统计（每 30 秒自动刷新）</p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${h.db === 'UP' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {h.db === 'UP' ? '● 运行正常' : '● 数据库异常'}
        </span>
      </div>

      {/* 数据备份 */}
      <div className="erp-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">💾 数据备份</h3>
          <p className="text-xs text-slate-400 mt-1">一键导出全库逻辑备份（全部数据表生成 INSERT 语句的 .sql 文件，恢复时先建库再导入）。建议配合 crontab 每日自动备份（见 docs/DEPLOYMENT.md）。</p>
        </div>
        <button onClick={async () => {
          try { toastNotify('正在生成备份文件…'); await bizApi.backupSql(); toastNotify('备份文件已开始下载'); }
          catch (e: any) { toastNotify('备份失败：' + (e.message || '')); }
        }} className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold shadow-md hover:opacity-90 shrink-0">⬇ 下载数据备份 (.sql)</button>
      </div>

      {/* 健康卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">连续运行</p><p className="text-lg font-bold text-slate-800 tabular-nums">{fmtUptime(Number(h.uptime_seconds))}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">数据库延迟</p><p className={`text-lg font-bold tabular-nums ${Number(h.db_latency_ms) < 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{Number(h.db_latency_ms) >= 0 ? `${h.db_latency_ms} ms` : '—'}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">注册数据表</p><p className="text-lg font-bold text-slate-800 tabular-nums">{h.table_count} 张</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">活动线程</p><p className="text-lg font-bold text-slate-800 tabular-nums">{h.threads}</p></div>
      </div>

      {/* JVM 内存 */}
      <div className="erp-card p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">☕ JVM 堆内存（v{data.info?.version} · Java {data.info?.java}）</h3>
          <span className="text-xs tabular-nums text-slate-500">{h.heap_used_mb} MB / {h.heap_max_mb} MB（{heapPct}%）</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${heapPct > 85 ? 'bg-red-400' : heapPct > 70 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${heapPct}%` }}></div>
        </div>
      </div>

      {/* 审计统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">今日操作数</p><p className="text-lg font-bold text-indigo-600 tabular-nums">{Number(a.ops_today || 0).toLocaleString()}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">近7日操作数</p><p className="text-lg font-bold text-slate-800 tabular-nums">{Number(a.ops_7d || 0).toLocaleString()}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">今日成功登录</p><p className="text-lg font-bold text-emerald-600 tabular-nums">{Number(a.logins_today || 0)}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">今日登录失败</p><p className={`text-lg font-bold tabular-nums ${Number(a.login_fails_today) > 0 ? 'text-red-500' : 'text-slate-400'}`}>{Number(a.login_fails_today || 0)}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erp-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">👤 今日活跃用户 TOP5</h3>
          {(a.top_users || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">今日暂无操作记录</p> : (
            <div className="space-y-2.5">
              {(a.top_users || []).map((u: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-16 text-slate-600 font-medium shrink-0">{u.username}</span>
                  <div className="flex-1 h-2 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.max(3, (Number(u.cnt) / maxUserCnt) * 100)}%` }}></div>
                  </div>
                  <span className="w-14 text-right tabular-nums text-slate-500 shrink-0">{Number(u.cnt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="erp-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">🗂️ 今日操作模块 TOP5</h3>
          {(a.top_modules || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">今日暂无操作记录</p> : (
            <div className="space-y-2.5">
              {(a.top_modules || []).map((u: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-16 text-slate-600 font-medium shrink-0 truncate">{u.module}</span>
                  <div className="flex-1 h-2 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${Math.max(3, (Number(u.cnt) / maxModCnt) * 100)}%` }}></div>
                  </div>
                  <span className="w-14 text-right tabular-nums text-slate-500 shrink-0">{Number(u.cnt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
