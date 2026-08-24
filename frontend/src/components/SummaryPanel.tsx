import { useEffect, useState } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dataApi } from '../api';

const PIE_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];

function fmtVal(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * 业务列表页通用汇总面板：
 *   汇总卡片（记录数 / 金额合计 / 预警数…） + 一键生成分析图（近6月趋势 / TOP8 分布）
 */
export default function SummaryPanel({ tableKey }: { tableKey: string }) {
  const [data, setData] = useState<{ cards?: any[]; trend?: { title: string; points: any[] }; groups?: { title: string; points: any[] } } | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [chart, setChart] = useState<'trend' | 'groups'>('trend');

  useEffect(() => {
    setData(null); setShowChart(false);
    dataApi.summary(tableKey)
      .then(r => {
        const d = r.data || {};
        setData(d);
        if (d.trend?.points?.length) setChart('trend');
        else if (d.groups?.points?.length) setChart('groups');
      })
      .catch(() => setData(null));
  }, [tableKey]);

  if (!data || !data.cards?.length) return null;
  const hasChart = Boolean(data.trend?.points?.length || data.groups?.points?.length);
  const activePoints = chart === 'trend' ? data.trend?.points : data.groups?.points;
  const activeTitle = chart === 'trend' ? data.trend?.title : data.groups?.title;

  return (
    <div className="erp-card p-5 space-y-4">
      {/* 标题行：汇总 + 生成分析图按钮 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500"></span>
          数据汇总
        </h3>
        {hasChart && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setShowChart(s => !s); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${showChart ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'}`}>
              📈 {showChart ? '收起分析图' : '生成分析图'}
            </button>
            {showChart && data.trend?.points?.length && data.groups?.points?.length && (
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                <button onClick={() => setChart('trend')} className={`px-2.5 py-1.5 font-medium ${chart === 'trend' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>趋势</button>
                <button onClick={() => setChart('groups')} className={`px-2.5 py-1.5 font-medium ${chart === 'groups' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>分布</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {data.cards.map((c: any, i: number) => (
          <div key={i} className={`rounded-xl px-4 py-3 border ${c.tone === 'warn' && Number(c.value) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
            <p className="text-[11px] text-slate-400 font-medium mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums tracking-tight ${c.tone === 'warn' && Number(c.value) > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {fmtVal(c.value)}
              {c.unit && <span className="text-xs font-medium text-slate-400 ml-1">{c.unit}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* 分析图 */}
      {showChart && activePoints && activePoints.length > 0 && (
        <div className="border-t border-slate-100 pt-4 erp-fade-in">
          <p className="text-xs font-medium text-slate-500 mb-3">{activeTitle}</p>
          {chart === 'trend' ? (
            <div style={{ width: '100%', height: 190 }}>
              <ResponsiveContainer>
                <AreaChart data={activePoints} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="summaryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => fmtVal(v)} />
                  <Tooltip formatter={(v: any) => [Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }), '数值']} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#summaryGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ width: '100%', height: 190 }} className="flex items-center">
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie data={activePoints} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={3}>
                    {activePoints.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => Number(v).toLocaleString()} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 pr-2">
                {activePoints.slice(0, 6).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-500 truncate max-w-[120px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}></span>{p.name}
                    </span>
                    <span className="font-mono tabular-nums text-slate-700">{Number(p.value).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
