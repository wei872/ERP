import { useEffect, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

/** 经营预测（v5.29）：近 9 月销售 → 加权移动均值 + 线性趋势外推 → 下月预测与销售目标联动预警 */
export default function ForecastPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [chartH, setChartH] = useState<number>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 200 : 300));
  useEffect(() => {
    const onResize = () => setChartH(window.innerWidth < 640 ? 200 : 300);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => { bizApi.salesForecast().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败')); }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">预测模型计算中…</p></div>;

  const forecast = Number(data.forecast || 0);
  const target = Number(data.target || 0);
  const rate = Number(data.rate || 0);
  const nextMonth = String(data.next_month || '');
  const history = (data.history || []).map((h: any) => ({ name: String(h.month).slice(2), 实际销售: Number(h.amount) || 0 }));
  const chartData = [...history, { name: nextMonth.slice(2) + '(预)', 预测值: forecast, 销售目标: target }];
  const risk = target > 0 ? (rate < 60 ? { txt: '高风险：预测大幅低于目标，建议立即启动促销/拓客动作', cls: 'text-red-500 bg-red-50 border-red-200' }
    : rate < 90 ? { txt: '关注：预测低于目标，建议盯紧在途商机与报价单转化', cls: 'text-amber-600 bg-amber-50 border-amber-200' }
    : rate <= 110 ? { txt: '健康：预测与目标基本匹配，保持现有节奏', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
    : { txt: '乐观：预测高于目标，可考虑上调目标或备货扩容', cls: 'text-blue-600 bg-blue-50 border-blue-200' })
    : { txt: '下月暂未设置销售目标，请先到「销售目标」维护', cls: 'text-slate-500 bg-slate-50 border-slate-200' };

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #312e81, #4c1d95 55%, #7c3aed)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-violet-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">🔮 经营预测</h2>
          <p className="text-[11px] md:text-xs text-violet-200 mt-1.5">双模型融合：近 3 月加权移动均值（权重 1:2:3）×50% + 线性回归趋势外推 ×50%</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">下月预测销售额（{nextMonth}）</p><p className="text-xl font-bold tabular-nums text-violet-600">¥{money(forecast)}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">下月销售目标</p><p className="text-xl font-bold tabular-nums text-slate-800">{target > 0 ? `¥${money(target)}` : '未设置'}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">预测达成率</p><p className={`text-xl font-bold tabular-nums ${rate >= 90 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{target > 0 ? `${rate.toFixed(1)}%` : '—'}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">预测缺口 / 盈余</p><p className={`text-xl font-bold tabular-nums ${forecast - target >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{target > 0 ? `${forecast - target >= 0 ? '+' : ''}¥${money(forecast - target)}` : '—'}</p></div>
      </div>

      {/* 风险提示 */}
      <div className={`rounded-2xl border p-4 text-sm font-medium ${risk.cls}`}>💡 {risk.txt}</div>

      {/* 趋势图 */}
      <div className="erp-card p-4 md:p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">📈 销售趋势与下月预测</h3>
        {history.length === 0 ? <p className="text-xs text-slate-400 text-center py-10">暂无销售数据</p> : (
          <ResponsiveContainer width="100%" height={chartH}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v)} />
              <Tooltip formatter={(v: any, n: any) => v == null ? ['—', n] : [`¥${Number(v).toLocaleString()}`, n]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="实际销售" fill="#818cf8" radius={[5, 5, 0, 0]} maxBarSize={34} />
              <Line type="monotone" dataKey="预测值" stroke="#7c3aed" strokeWidth={2.5} strokeDasharray="6 4" dot={{ fill: '#7c3aed', r: 5 }} />
              <Line type="monotone" dataKey="销售目标" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} />
              {target > 0 && <ReferenceLine y={target} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '目标线', fontSize: 10, fill: '#f59e0b', position: 'insideTopRight' }} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="erp-card p-4 text-[11px] text-slate-500 space-y-1">
        <p>🧮 模型说明：加权均值对近期销售更敏感（近月权重更高），线性回归捕捉整体增长/下滑趋势，两者各占 50% 降低单一模型偏差。</p>
        <p>🎯 预测达成率 = 下月预测 ÷ 下月目标（「销售目标」表维护）；&lt;60% 高风险、60~90% 需关注、90~110% 健康、&gt;110% 乐观。</p>
      </div>
    </div>
  );
}
