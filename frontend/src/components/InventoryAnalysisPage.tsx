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

      {/* ABC 分析（v5.30）：按库存金额累计占比分类管理 */}
      {data.abc && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-500"></span>库存 ABC 分类（按金额累计占比：A≤70% / B≤90% / C&gt;90%）</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(data.abc.classes || []).map((cl: any) => {
                const tone = cl.class === 'A' ? 'border-violet-200 bg-violet-50/60' : cl.class === 'B' ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-slate-50';
                const pct = Number(data.abc.total_value || 0) > 0 ? (Number(cl.value || 0) / Number(data.abc.total_value)) * 100 : 0;
                const advice = cl.class === 'A' ? '重点管控：循环盘点每月一次、安全库存复核、采购议价' : cl.class === 'B' ? '常规管控：季度盘点、按周转率调订货点' : '简化管理：放宽盘点频率、关注呆滞、批量采购降本';
                return (
                  <div key={cl.class} className={`rounded-2xl border p-4 ${tone}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-base font-bold text-slate-700">{cl.class}</span>
                      <span className="text-[11px] text-slate-500">金额占比 <b className="tabular-nums text-slate-700">{pct.toFixed(1)}%</b></span>
                    </div>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{Number(cl.count || 0)} 种物料 · ¥{money(cl.value)}</p>
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">{advice}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="erp-card p-4 md:p-5 overflow-x-auto">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">TOP 30 高价值物料</h4>
            <table className="erp-table text-xs w-full min-w-[640px]">
              <thead><tr><th className="text-left">物料</th><th>分类</th><th>库存数量</th><th>库存金额</th><th>累计占比</th></tr></thead>
              <tbody>
                {(data.abc.items || []).map((it: any) => (
                  <tr key={it.product_code}>
                    <td className="text-left"><p className="font-medium text-slate-700 whitespace-nowrap">{it.product_name}</p><p className="font-mono text-[10px] text-slate-400">{it.product_code}</p></td>
                    <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${it.class === 'A' ? 'bg-violet-100 text-violet-600' : it.class === 'B' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{it.class} 类</span></td>
                    <td className="tabular-nums">{Number(it.qty || 0).toLocaleString()}</td>
                    <td className="tabular-nums font-semibold">¥{money(it.value)}</td>
                    <td className="min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex-1"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" style={{ width: `${Math.min(100, Number(it.cum_pct || 0))}%` }}></div></div>
                        <span className="tabular-nums text-[10px] text-slate-400 shrink-0">{Number(it.cum_pct || 0).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
