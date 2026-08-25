import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

function Card({ icon, label, value, sub, tone }: { icon: string; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="erp-card p-4 flex items-center gap-3.5">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
        <p className="text-lg font-bold text-slate-800 tabular-nums leading-tight truncate">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

/** 盘点盈亏分析（v5.26）：月度盈亏趋势 / 仓库分布 / TOP 差异商品，闭环批量盘点能力 */
export default function StocktakeAnalysisPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [chartH, setChartH] = useState<number>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 180 : 240));
  useEffect(() => {
    const onResize = () => setChartH(window.innerWidth < 640 ? 180 : 240);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => { bizApi.stocktakeAnalysis().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败')); }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">盘点分析生成中…</p></div>;

  const s = data.summary || {};
  const monthly = [...(data.monthly || [])].reverse().map((m: any) => ({ name: String(m.month).slice(2), 盘盈: Number(m.gain) || 0, 盘亏: Number(m.loss) || 0, 笔数: Number(m.cnt) || 0 }));
  const gain = Number(s.gain_amount || 0), loss = Number(s.loss_amount || 0);
  const whData = (data.byWarehouse || []).map((w: any) => ({ name: w.warehouse, 盘盈: Number(w.gain) || 0, 盘亏: Number(w.loss) || 0 }));
  const pieData = (data.topProducts || []).slice(0, 6).map((p: any) => ({ name: p.product_name || p.product_code, value: Number(p.total) || 0 }));
  const COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#06b6d4', '#8b5cf6'];

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #064e3b, #065f46 55%, #0f766e)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-emerald-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">📦 盘点盈亏分析</h2>
          <p className="text-[11px] md:text-xs text-emerald-100 mt-1.5">盘点差异按月份 / 仓库 / 商品聚合 · 与「整仓批量盘点」实时联动</p>
        </div>
      </div>

      {/* 汇总卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon="🧾" label="盘点单 / 明细笔数" value={`${Number(s.docs || 0)} 单`} sub={`共 ${Number(s.checks || 0)} 条明细`} tone="bg-slate-100 text-slate-600" />
        <Card icon="📈" label="累计盘盈金额" value={`¥${money(gain)}`} sub="实盘多于账面，已自动入库" tone="bg-emerald-50 text-emerald-600" />
        <Card icon="📉" label="累计盘亏金额" value={`¥${money(loss)}`} sub="实盘少于账面，已自动出库" tone="bg-red-50 text-red-500" />
        <Card icon="⚖️" label="净盈亏" value={`${gain - loss >= 0 ? '+' : '-'}¥${money(Math.abs(gain - loss))}`} sub={gain - loss >= 0 ? '整体盘盈' : '整体盘亏，建议核查出入库流程'} tone={gain - loss >= 0 ? 'bg-teal-50 text-teal-600' : 'bg-orange-50 text-orange-500'} />
      </div>

      {/* 趋势 + 仓库分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="erp-card p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">📊 月度盈亏趋势（近 6 个月）</h3>
          {monthly.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">暂无盘点数据，先到「库存直调&期末 → 库存盘点」执行盘点</p> : (
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v)} />
                <Tooltip formatter={(v: any, n: any) => [n === '笔数' ? v : `¥${Number(v).toLocaleString()}`, n]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="盘盈" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="盘亏" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="erp-card p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">🏬 各仓库盈亏分布</h3>
          {whData.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">暂无数据</p> : (
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart data={whData} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={72} />
                <Tooltip formatter={(v: any, n: any) => [`¥${Number(v).toLocaleString()}`, n]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="盘盈" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={18} />
                <Bar dataKey="盘亏" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* TOP 差异商品 + 占比 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="erp-card p-4 md:p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">🔥 TOP 差异商品（按差异金额绝对值）</h3>
          {(data.topProducts || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-8">暂无差异记录，账实一致 👍</p> : (
            <div className="overflow-x-auto">
              <table className="erp-table text-xs w-full">
                <thead><tr><th className="text-left">商品</th><th>盘点次数</th><th>盘盈金额</th><th>盘亏金额</th><th>差异总额</th><th>差异结构</th></tr></thead>
                <tbody>
                  {(data.topProducts || []).map((p: any) => {
                    const g = Number(p.gain || 0), l = Number(p.loss || 0), t = Number(p.total || 0) || 1;
                    return (
                      <tr key={p.product_code}>
                        <td className="text-left"><p className="font-medium text-slate-700 whitespace-nowrap">{p.product_name || p.product_code}</p><p className="font-mono text-[10px] text-slate-400">{p.product_code}</p></td>
                        <td className="tabular-nums text-center">{p.cnt}</td>
                        <td className="tabular-nums text-emerald-600">¥{money(g)}</td>
                        <td className="tabular-nums text-red-500">¥{money(l)}</td>
                        <td className="tabular-nums font-bold">¥{money(t)}</td>
                        <td className="min-w-[110px]"><div className="h-2 rounded-full overflow-hidden bg-slate-100 flex"><div className="bg-emerald-400 h-full" style={{ width: `${(g / t) * 100}%` }}></div><div className="bg-red-400 h-full" style={{ width: `${(l / t) * 100}%` }}></div></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="erp-card p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">🧩 差异金额构成</h3>
          {pieData.length === 0 ? <p className="text-xs text-slate-400 text-center py-8">暂无数据</p> : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={3}>
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `¥${Number(v).toLocaleString()}`} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {pieData.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-500 truncate"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }}></span>{p.name}</span>
                    <span className="tabular-nums font-medium text-slate-700">¥{money(p.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
