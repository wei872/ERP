import { useEffect, useState } from 'react';
import { bizApi } from '../api';

const DAY = 86400000;
const d = (s: unknown) => new Date(String(s).slice(0, 10).replace(/-/g, '/')).getTime();

/** 生产排程看板（v5.26 计划中的排程能力落地）：工单起止排程条 + 今日线 + 逾期红色预警 + 车间负载 */
export default function ProductionSchedulePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  useEffect(() => { bizApi.productionSchedule().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败')); }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">排程数据加载中…</p></div>;

  const t = data.totals || {};
  const rangeStart = d(data.range_start), rangeEnd = d(data.range_end);
  const total = Math.max(1, rangeEnd - rangeStart);
  const todayPct = Math.min(100, Math.max(0, ((d(data.today) - rangeStart) / total) * 100));
  const rows: any[] = ((data.rows || []) as any[]).filter((r: any) => !onlyOverdue || Number(r.overdue_days || 0) > 0);

  const barStyle = (r: any) => {
    const s = r.start_date ? d(r.start_date) : rangeStart;
    const e = r.plan_end_date ? d(r.plan_end_date) : s + 7 * DAY;
    const left = Math.min(100, Math.max(0, ((s - rangeStart) / total) * 100));
    const width = Math.max(1.5, Math.min(100 - left, ((Math.max(e, s + DAY) - s) / total) * 100));
    return { left: `${left}%`, width: `${width}%` };
  };
  const barColor = (r: any) => {
    if (r.order_status === '已完成') return 'bg-emerald-400/80';
    if (Number(r.overdue_days || 0) > 0) return 'bg-red-500 animate-pulse';
    if (r.order_status === '进行中') return 'bg-blue-500';
    return 'bg-slate-400';
  };

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e293b, #334155 55%, #475569)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-slate-300/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">📅 生产排程看板</h2>
          <p className="text-[11px] md:text-xs text-slate-300 mt-1.5">工单起止时间轴 · 今日线实时定位 · 逾期未完工红色脉冲预警 · 车间负载统计</p>
        </div>
      </div>

      {/* KPI + 车间负载 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="erp-card p-4 text-center"><p className="text-[10px] text-slate-400 mb-0.5">工单总数</p><p className="text-xl font-bold tabular-nums text-slate-800">{Number(t.count || 0)}</p></div>
        <div className="erp-card p-4 text-center"><p className="text-[10px] text-slate-400 mb-0.5">进行中</p><p className="text-xl font-bold tabular-nums text-blue-600">{Number(t.in_progress || 0)}</p></div>
        <div className="erp-card p-4 text-center"><p className="text-[10px] text-slate-400 mb-0.5">逾期未完工</p><p className={`text-xl font-bold tabular-nums ${Number(t.overdue || 0) ? 'text-red-500' : 'text-slate-400'}`}>{Number(t.overdue || 0)}</p></div>
        <div className="erp-card p-4 text-center"><p className="text-[10px] text-slate-400 mb-0.5">已完成</p><p className="text-xl font-bold tabular-nums text-emerald-600">{Number(t.finished || 0)}</p></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {(data.workshops || []).map((w: any) => (
          <div key={w.workshop} className={`erp-card p-4 ${Number(w.overdue_orders || 0) ? 'ring-1 ring-red-200' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">🏗️ {w.workshop}</span>
              {Number(w.overdue_orders || 0) > 0 && <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">{w.overdue_orders} 单逾期</span>}
            </div>
            <p className="text-xs text-slate-500">在制工单 <b className="tabular-nums text-slate-800">{Number(w.active_orders || 0)}</b> 张 · 在制计划量 <b className="tabular-nums text-slate-800">{Number(w.active_qty || 0).toLocaleString()}</b></p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={onlyOverdue} onChange={e => setOnlyOverdue(e.target.checked)} className="accent-red-500"/>只看逾期工单</label>
      </div>

      {/* 排程甘特图 */}
      <div className="erp-card p-4 md:p-5 overflow-x-auto">
        <div className="min-w-[820px]">
          {/* 时间轴头 */}
          <div className="relative h-6 mb-1 ml-[220px] border-b border-slate-100">
            <span className="absolute left-0 text-[10px] text-slate-400 -translate-y-0.5">{String(data.range_start).slice(5)}</span>
            <span className="absolute text-[10px] text-slate-400 -translate-y-0.5 -translate-x-1/2" style={{ left: `${todayPct}%` }}>今日</span>
            <span className="absolute right-0 text-[10px] text-slate-400 -translate-y-0.5">{String(data.range_end).slice(5)}</span>
          </div>
          <div className="space-y-1.5 relative">
            {/* 今日竖线 */}
            <div className="absolute top-0 bottom-0 w-px bg-red-300 z-10 ml-[220px]" style={{ left: `calc(220px + (100% - 220px) * ${todayPct / 100})` }}></div>
            {rows.length === 0 && <p className="text-xs text-slate-400 text-center py-10">无符合条件的工单</p>}
            {rows.map((r: any) => {
              const overdue = Number(r.overdue_days || 0) > 0;
              const progress = Math.min(100, Number(r.progress || 0));
              return (
                <div key={r.work_order_no} className="flex items-center gap-3 group">
                  <div className="w-[220px] shrink-0 min-w-0">
                    <p className="font-mono text-[11px] text-indigo-600 truncate">{r.work_order_no}</p>
                    <p className="text-[10px] text-slate-400 truncate">{r.product_name} · {r.workshop}</p>
                  </div>
                  <div className="flex-1 relative h-8 bg-slate-50 rounded-lg overflow-hidden">
                    <div className={`absolute top-1 bottom-1 rounded-md ${barColor(r)} shadow-sm`} style={barStyle(r)} title={`${String(r.start_date || '').slice(0, 10)} → ${String(r.plan_end_date || '').slice(0, 10)}`}>
                      <div className="h-full rounded-md bg-white/30" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                  <div className="w-[130px] shrink-0 text-right">
                    {r.order_status === '已完成'
                      ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ 已完成</span>
                      : overdue
                        ? <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full animate-pulse whitespace-nowrap">逾期 {r.overdue_days} 天</span>
                        : <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">{r.order_status} {progress.toFixed(0)}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-blue-500"></span>进行中（白色叠加=完工进度）</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-red-500"></span>逾期未完工</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-emerald-400"></span>已完成</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-slate-400"></span>待排产/已下达</span>
          </div>
        </div>
      </div>
    </div>
  );
}
