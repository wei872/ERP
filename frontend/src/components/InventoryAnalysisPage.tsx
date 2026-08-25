import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

/** 库存周转分析：周转率 / 可销天数 / 呆滞料 / 出入库趋势 */
export default function InventoryAnalysisPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    bizApi.inventoryAnalysis().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败'));
  }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">库存分析计算中...</p></div>;

  const trend = (data.trend || []).map((t: any) => ({ name: String(t.name).slice(2), 入库: Number(t.in_value) || 0, 出库: Number(t.out_value) || 0 }));
  const turnover = Number(data.turnover_rate_90d) || 0;
  const turnoverTone = turnover >= 1 ? 'text-emerald-600' : turnover >= 0.5 ? 'text-blue-600' : 'text-amber-600';

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">🔄 库存周转分析</h2>
        <p className="text-sm text-slate-400 mt-1">周转率 = 近90天出库成本 ÷ 当前库存金额；可销天数 = 当前库存 ÷ 日均出库成本（按现有库存结构估算）</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="erp-card p-4">
          <p className="text-[11px] text-slate-400 mb-1">当前库存金额</p>
          <p className="text-lg font-bold text-slate-800 tabular-nums">¥{money(data.inventory_value)}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[11px] text-slate-400 mb-1">近90天出库成本</p>
          <p className="text-lg font-bold text-slate-800 tabular-nums">¥{money(data.out_90d_cost)}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[11px] text-slate-400 mb-1">周转率（90天）</p>
          <p className={`text-lg font-bold tabular-nums ${turnoverTone}`}>{turnover.toFixed(2)} 次</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{turnover >= 1 ? '周转健康' : turnover >= 0.5 ? '周转一般' : '周转偏慢，关注呆滞'}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[11px] text-slate-400 mb-1">可销天数</p>
          <p className="text-lg font-bold text-slate-800 tabular-nums">{Number(data.sellable_days) > 0 ? `${data.sellable_days} 天` : '—'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">按当前出库速度估算</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="erp-card p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">📈 出入库金额月度趋势（近6个月）</h3>
          {trend.length === 0 ? <p className="text-center text-xs text-slate-400 py-10">暂无出入库数据</p> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v)} />
                <Tooltip formatter={(v: any, n: any) => [`¥${Number(v).toLocaleString()}`, n]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="入库" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={30} />
                <Bar dataKey="出库" fill="#f59e0b" radius={[5, 5, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="erp-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">🐌 呆滞料预警</h3>
          <p className="text-[11px] text-slate-400 mb-3">近90天无出库记录的存货（按金额排序）</p>
          {(data.slow_moving || []).length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-8">✅ 暂无呆滞物料</p>
          ) : (
            <div className="space-y-2">
              {(data.slow_moving || []).map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-50/60 border border-amber-100 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-700 truncate">{s.product_name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{s.product_code} · 库存 {Number(s.qty || 0)}</p>
                  </div>
                  <span className="font-bold text-amber-600 tabular-nums shrink-0 ml-2">¥{money(s.total_value)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-3">处理建议：促销清仓 / 调拨他用 / 计提减值</p>
        </div>
      </div>
    </div>
  );
}
