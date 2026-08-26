import { useEffect, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="erp-card p-5 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${tone}`}></div>
      <p className="text-xs text-slate-400 font-medium mb-1.5">{label}</p>
      <p className="text-2xl font-bold text-slate-800 tabular-nums tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>}
    </div>
  );
}

function RateBadge({ v }: { v: unknown }) {
  const n = Number(v) || 0;
  const cls = n >= 60 ? 'bg-emerald-50 text-emerald-700' : n >= 30 ? 'bg-blue-50 text-blue-600' : n > 0 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600';
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${cls}`}>{n.toFixed(1)}%</span>;
}

/** 销售毛利分析：收入/成本/毛利按月度、产品、客户三维度穿透 + 质量成本（COQ）联动（v5.28） */
export default function ProfitPage() {
  const [data, setData] = useState<any>(null);
  const [coq, setCoq] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    bizApi.profitAnalysis().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败'));
    bizApi.coqAnalysis().then(r => setCoq(r.data)).catch(() => {});
  }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">毛利分析计算中...</p></div>;

  const t = data.totals || {};
  const monthly = (data.monthly || []).map((m: any) => ({ name: String(m.name).slice(2), revenue: Number(m.revenue) || 0, cost: Number(m.cost) || 0, profit: Number(m.profit) || 0 }));
  const byProduct = data.byProduct || [];
  const byCustomer = data.byCustomer || [];
  const maxProfit = Math.max(...byProduct.map((p: any) => Number(p.profit) || 0), 1);

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1500px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">💹 销售毛利分析</h2>
        <p className="text-sm text-slate-400 mt-1">基于已出库销售单：收入 = 销售额，成本 = 出库时点加权成本（{t.count || 0} 张已出库单据），毛利 = 收入 − 成本</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="销售收入（已出库）" value={`¥${money(t.revenue)}`} tone="from-blue-400 to-indigo-500" />
        <KpiCard label="销售成本" value={`¥${money(t.cost)}`} tone="from-slate-400 to-slate-500" />
        <KpiCard label="毛利额" value={`¥${money(t.profit)}`} tone="from-emerald-400 to-teal-500" />
        <KpiCard label="综合毛利率" value={`${Number(t.rate || 0).toFixed(1)}%`} sub="毛利额 ÷ 销售收入" tone="from-violet-400 to-purple-500" />
      </div>

      {/* 月度收入-成本-毛利 */}
      <div className="erp-card p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">📅 月度收入 / 成本 / 毛利趋势</h3>
        {monthly.length === 0 ? <p className="text-center text-sm text-slate-400 py-8">暂无已出库销售数据</p> : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v)} />
              <Tooltip formatter={(v: any, n: any) => [`¥${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, n]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="收入" fill="#6366f1" radius={[5, 5, 0, 0]} maxBarSize={34} />
              <Bar dataKey="cost" name="成本" fill="#cbd5e1" radius={[5, 5, 0, 0]} maxBarSize={34} />
              <Line type="monotone" dataKey="profit" name="毛利" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 产品利润排行榜（v5.31）：名次 + 贡献度 + 帕累托累计 */}
        <div className="erp-card p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">🏆 产品利润排行榜</h3>
          <p className="text-[10px] text-slate-400 mb-4">按毛利额排名 · 贡献度 = 单品毛利 ÷ 总毛利 · 累计达 80% 即为核心利润产品</p>
          {byProduct.length === 0 ? <p className="text-center text-sm text-slate-400 py-8">暂无数据</p> : (() => {
            const ranked = [...byProduct].sort((a: any, b: any) => (Number(b.profit) || 0) - (Number(a.profit) || 0));
            const totalProfit = ranked.reduce((s: number, p: any) => s + Math.max(0, Number(p.profit) || 0), 0);
            let cum = 0;
            return (
              <div className="space-y-3">
                {ranked.map((p: any, i: number) => {
                  const profit = Number(p.profit) || 0;
                  const contrib = totalProfit > 0 ? (Math.max(0, profit) / totalProfit) * 100 : 0;
                  cum += contrib;
                  return (
                    <div key={p.product_code}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700 truncate max-w-[58%] flex items-center gap-1.5">
                          <span className="shrink-0">{i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="inline-block w-5 text-center text-slate-400 tabular-nums">{i + 1}</span>}</span>
                          <span className="truncate">{p.product_name}</span> <span className="font-mono text-slate-400">{p.product_code}</span>
                        </span>
                        <span className="flex items-center gap-2 tabular-nums shrink-0">
                          <span className="font-semibold text-emerald-600">¥{money(p.profit)}</span>
                          <span className="text-violet-600 font-bold">{contrib.toFixed(1)}%</span>
                          <RateBadge v={p.rate} />
                        </span>
                      </div>
                      <div className="h-2 bg-slate-50 rounded-full overflow-hidden relative">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500" style={{ width: `${Math.max(2, ((Number(p.profit) || 0) / maxProfit) * 100)}%` }}></div>
                      </div>
                      {cum >= 80 && (() => { const prevCum = cum - contrib; return prevCum < 80 ? <p className="text-[9px] text-violet-500 font-medium mt-0.5">— 以上产品累计贡献 {cum.toFixed(1)}%，已达 80% 核心利润线 —</p> : null; })()}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* 客户毛利明细 */}
        <div className="erp-card p-6 overflow-hidden">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">👥 客户毛利明细</h3>
          {byCustomer.length === 0 ? <p className="text-center text-sm text-slate-400 py-8">暂无数据</p> : (
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead><tr><th>客户</th><th className="text-right">收入</th><th className="text-right">成本</th><th className="text-right">毛利</th><th className="text-right">毛利率</th></tr></thead>
                <tbody>
                  {byCustomer.map((c: any) => (
                    <tr key={c.customer_code}>
                      <td className="whitespace-nowrap"><span className="font-medium text-slate-700">{c.customer_name}</span><span className="block font-mono text-[10px] text-slate-400">{c.customer_code}</span></td>
                      <td className="text-right tabular-nums whitespace-nowrap">{money(c.revenue)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap text-slate-500">{money(c.cost)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap font-semibold text-emerald-600">{money(c.profit)}</td>
                      <td className="text-right whitespace-nowrap"><RateBadge v={c.rate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 质量成本 COQ（v5.28）：毛利要扣掉质量损失才是真利润 */}
      {coq && (() => {
        const ct = coq.totals || {};
        const coqMonthly = (coq.monthly || []).map((m: any) => ({ name: String(m.month).slice(2), loss: Number(m.loss) || 0 }));
        const totalLoss = Number(ct.total_loss || 0);
        const parts = [
          { label: '生产报废', v: Number(ct.scrap_loss || 0), color: 'bg-red-400' },
          { label: '检验失败', v: Number(ct.inspection_loss || 0), color: 'bg-amber-400' },
          { label: 'NCR报废', v: Number(ct.ncr_scrap_loss || 0), color: 'bg-orange-400' },
        ];
        return (
          <div className="erp-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-semibold text-slate-700">🧯 质量成本（COQ）——毛利的隐形侵蚀</h3>
              <span className="text-[11px] text-slate-400">报废 / 检验失败 / 异常单损失 × 库存单位成本</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <KpiCard label="质量损失合计" value={`¥${money(totalLoss)}`} sub={`占销售收入 ${Number(ct.loss_to_sales || 0).toFixed(2)}%`} tone="from-red-400 to-rose-500" />
              <KpiCard label="生产报废率" value={`${Number(ct.scrap_rate || 0).toFixed(2)}%`} sub="报废数量 ÷ 生产产量" tone="from-amber-400 to-orange-500" />
              <KpiCard label="NCR 异常单" value={`${Number(ct.ncr_count || 0)} 单`} sub={`返工 ${Number(ct.rework_count || 0)} · 让步 ${Number(ct.concession_count || 0)}`} tone="from-violet-400 to-purple-500" />
              <KpiCard label="真实利润参考" value={`¥${money(Number(data?.totals?.profit || 0) - totalLoss)}`} sub="毛利额 − 质量损失" tone="from-emerald-400 to-teal-500" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">月度质量损失趋势（近 8 月）</p>
                {coqMonthly.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">暂无质量损失记录</p> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={coqMonthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v)} />
                      <Tooltip formatter={(v: any) => [`¥${Number(v).toLocaleString()}`, '质量损失']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="loss" fill="#f87171" radius={[5, 5, 0, 0]} maxBarSize={30} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">损失构成</p>
                <div className="h-3 rounded-full overflow-hidden bg-slate-100 flex mb-3">
                  {parts.map(p => totalLoss > 0 && p.v > 0 ? <div key={p.label} className={p.color} style={{ width: `${(p.v / totalLoss) * 100}%` }} title={`${p.label} ¥${money(p.v)}`}></div> : null)}
                </div>
                <div className="space-y-2">
                  {parts.map(p => (
                    <div key={p.label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-slate-500"><span className={`w-2.5 h-2.5 rounded-full ${p.color}`}></span>{p.label}</span>
                      <span className="tabular-nums font-semibold text-slate-700">¥{money(p.v)}<span className="text-slate-400 font-normal ml-2">{totalLoss > 0 ? ((p.v / totalLoss) * 100).toFixed(1) : '0.0'}%</span></span>
                    </div>
                  ))}
                </div>
                {(coq.topProducts || []).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">TOP 损失物料</p>
                    {(coq.topProducts || []).slice(0, 5).map((p: any) => (
                      <div key={p.product_code} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-50 last:border-0">
                        <span className="font-mono text-slate-500">{p.product_code}</span>
                        <span className="tabular-nums font-medium text-red-500">-¥{money(p.loss)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
