import { useEffect, useState } from 'react';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
      <p className={`text-base font-bold tabular-nums ${tone || 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

/** 经营月报（v5.32）：销售/采购/库存/财务/质量五板块月度综合，一键打印归档，可邮件订阅 */
export default function MonthlyReportPage() {
  const [month, setMonth] = useState<string>(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    bizApi.monthlyReport(month).then(r => setData(r.data)).catch(e => setError(e.message || '加载失败'));
  }, [month]);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;

  const sales = data?.sales || {}, pur = data?.purchase || {}, inv = data?.inventory || {}, fin = data?.finance || {}, qua = data?.quality || {};

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1100px] mx-auto">
      {/* 抬头（打印区） */}
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden no-print" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b 55%, #334155)' }}>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">🗓️ 经营月报</h2>
            <p className="text-[11px] md:text-xs text-slate-300 mt-1.5">销售 · 采购 · 库存 · 财务 · 质量 五板块月度综合 · 支持打印归档与邮件订阅</p>
          </div>
          <div className="flex gap-2">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-sm focus:outline-none [color-scheme:dark]"/>
            <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-white/15 border border-white/20 text-sm hover:bg-white/25 transition-colors">🖨️ 打印月报</button>
          </div>
        </div>
      </div>

      {!data && !error && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">月报汇总中…</p></div>}

      {data && (
        <div className="space-y-4 print-area">
          <h3 className="text-lg font-bold text-slate-800 hidden print:block">经营月报（{month}）</h3>

          {/* 销售 */}
          <div className="erp-card p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">💰 销售板块</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label="销售订单数" value={`${Number(sales.count || 0)} 单`} />
              <Stat label="销售额" value={`¥${money(sales.amount)}`} tone="text-blue-600" />
              <Stat label="平均单值" value={Number(sales.count || 0) > 0 ? `¥${money(Number(sales.amount || 0) / Number(sales.count))}` : '—'} />
            </div>
            {(sales.topProduct || []).length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">TOP5 热销商品</p>
                <div className="space-y-1">
                  {(sales.topProduct || []).map((p: any, i: number) => (
                    <div key={p.product_code} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 text-center text-slate-400">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                      <span className="text-slate-600 truncate flex-1">{p.product_name}</span>
                      <span className="tabular-nums font-semibold text-slate-700">¥{money(p.amt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 采购 + 库存 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="erp-card p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">🛒 采购板块</h3>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="采购订单数" value={`${Number(pur.count || 0)} 单`} />
                <Stat label="采购额" value={`¥${money(pur.amount)}`} tone="text-cyan-600" />
              </div>
            </div>
            <div className="erp-card p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">📦 库存板块</h3>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="当前库存金额" value={`¥${money(inv.value)}`} />
                <Stat label="当月入库" value={`¥${money(inv.in_amount)}`} tone="text-emerald-600" />
                <Stat label="当月出库" value={`¥${money(inv.out_amount)}`} tone="text-amber-600" />
              </div>
            </div>
          </div>

          {/* 财务 + 质量 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="erp-card p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">📒 财务板块</h3>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="当月凭证数" value={`${Number(fin.vouchers || 0)} 张`} />
                <Stat label="当月费用申请" value={`¥${money(fin.expense)}`} />
                <Stat label="应收未收余额" value={`¥${money(fin.receivable_remain)}`} tone={Number(fin.receivable_remain) > 0 ? 'text-red-500' : 'text-emerald-600'} />
                <Stat label="应付未付余额" value={`¥${money(fin.payable_remain)}`} />
              </div>
            </div>
            <div className="erp-card p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">🔬 质量板块</h3>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="质量异常单" value={`${Number(qua.ncr_count || 0)} 单`} tone={Number(qua.ncr_count || 0) > 0 ? 'text-red-500' : 'text-emerald-600'} />
                <Stat label="报废数量" value={Number(qua.scrap_qty || 0).toLocaleString()} tone={Number(qua.scrap_qty || 0) > 0 ? 'text-red-500' : 'text-emerald-600'} />
                <Stat label="检验合格率" value={`${Number(qua.pass_rate || 0).toFixed(1)}%`} tone={Number(qua.pass_rate || 0) >= 98 ? 'text-emerald-600' : 'text-amber-600'} />
              </div>
            </div>
          </div>

          <div className="erp-card p-4 text-[11px] text-slate-500 no-print">
            💡 本页可加入定时邮件：「报表邮件订阅」选择「经营月报」，每月初自动发送上月汇总到指定邮箱。
          </div>
        </div>
      )}
    </div>
  );
}
