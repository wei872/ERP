import { Fragment, useEffect, useState } from 'react';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** 采购比价与供应商评级（v5.26）：同物料多供应商历史价对比 + 最优推荐 + 潜在节省测算 */
export default function PriceComparePage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openRow, setOpenRow] = useState<string>('');

  const load = async (kw: string) => {
    setLoading(true); setError('');
    try { const r = await bizApi.priceCompare(kw); setData(r.data); }
    catch (e: any) { setError(e.message || '加载失败'); }
    setLoading(false);
  };
  useEffect(() => { load(''); }, []);

  const t = data?.totals || {};
  const rows: any[] = data?.rows || [];

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7c2d12, #9a3412 55%, #c2410c)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-orange-400/20 blur-2xl"></div>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">⚖️ 采购比价与供应商评级</h2>
            <p className="text-[11px] md:text-xs text-orange-100 mt-1.5">基于历史采购单明细：同物料多供应商价格对比 · 最低价自动推荐 · 潜在节省测算</p>
          </div>
          <div className="flex gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(q)} placeholder="搜索物料编码 / 名称" className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-sm placeholder-orange-200/70 focus:outline-none focus:bg-white/15 w-48"/>
            <button onClick={() => load(q)} className="px-4 py-2 rounded-xl bg-white/15 border border-white/20 text-sm hover:bg-white/25 transition-colors shrink-0">🔍 比价</button>
          </div>
        </div>
      </div>

      {/* 汇总卡 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="erp-card p-4 text-center"><p className="text-[11px] text-slate-400 mb-1">比价物料数</p><p className="text-xl font-bold text-slate-800 tabular-nums">{Number(t.products || 0)}</p></div>
        <div className="erp-card p-4 text-center"><p className="text-[11px] text-slate-400 mb-1">参与供应商</p><p className="text-xl font-bold text-slate-800 tabular-nums">{Number(t.suppliers || 0)} 家</p></div>
        <div className="erp-card p-4 text-center"><p className="text-[11px] text-slate-400 mb-1">潜在可节省金额</p><p className="text-xl font-bold text-emerald-600 tabular-nums">¥{money(t.saving)}</p><p className="text-[10px] text-slate-400 mt-0.5">高价供应商采购量 × 价差</p></div>
      </div>

      {error && <div className="erp-card p-8 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-sm text-red-500">{error}</p></div>}
      {loading && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">比价计算中…</p></div>}

      {!loading && rows.length > 0 && (
        <div className="erp-card p-3 md:p-4 overflow-x-auto">
          <table className="erp-table text-xs w-full min-w-[760px]">
            <thead><tr><th className="text-left">物料</th><th>供应商数</th><th className="text-left">推荐供应商（均价最低）</th><th>推荐均价</th><th>潜在节省</th><th>明细</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <Fragment key={r.product_code}>
                  <tr className="cursor-pointer hover:bg-slate-50/80" onClick={() => setOpenRow(openRow === r.product_code ? '' : r.product_code)}>
                    <td className="text-left"><p className="font-medium text-slate-700 whitespace-nowrap">{r.product_name}</p><p className="font-mono text-[10px] text-slate-400">{r.product_code}</p></td>
                    <td className="tabular-nums text-center">{r.supplier_count} 家</td>
                    <td className="text-left"><span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-2 py-0.5 font-medium">🏆 {r.best_supplier || '—'}</span></td>
                    <td className="tabular-nums font-semibold">¥{money(r.best_avg_price)}</td>
                    <td className={`tabular-nums font-medium ${Number(r.saving) > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{Number(r.saving) > 0 ? `¥${money(r.saving)}` : '—'}</td>
                    <td className="text-center text-slate-400">{openRow === r.product_code ? '▲ 收起' : '▼ 展开对比'}</td>
                  </tr>
                  {openRow === r.product_code && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50/70 p-0">
                        <div className="px-4 py-3 space-y-1.5">
                          {r.suppliers.map((s: any) => {
                            const isBest = s.supplier_name === r.best_supplier;
                            return (
                              <div key={s.supplier_code} className={`flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border px-3 py-2 text-[11px] ${isBest ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-100'}`}>
                                <span className="font-semibold text-slate-700 min-w-[120px]">{isBest && '🏆 '}{s.supplier_name}</span>
                                <span className="text-slate-500">采购 <b className="tabular-nums text-slate-700">{s.order_cnt}</b> 单 / <b className="tabular-nums text-slate-700">{Number(s.total_qty || 0).toLocaleString()}</b> 件</span>
                                <span className="text-slate-500">最低 <b className="tabular-nums text-emerald-600">¥{money(s.min_price)}</b></span>
                                <span className="text-slate-500">均价 <b className={`tabular-nums ${isBest ? 'text-emerald-700' : 'text-slate-700'}`}>¥{money(s.avg_price)}</b></span>
                                <span className="text-slate-500">最近 <b className="tabular-nums text-slate-700">¥{money(s.last_price)}</b>{s.last_date ? <span className="text-slate-400">（{String(s.last_date).slice(0, 10)}）</span> : null}</span>
                                {isBest ? <span className="ml-auto text-emerald-600 font-bold">★ 推荐：价格最优</span> : <span className="ml-auto text-slate-400">高于最优均价 ¥{money(Number(s.avg_price || 0) - Number(r.best_avg_price || 0))}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="erp-card p-12 text-center">
          <div className="text-5xl mb-3">🛒</div>
          <p className="text-sm text-slate-500 font-medium mb-1">暂无可对比的采购价格数据</p>
          <p className="text-xs text-slate-400">录入包含多供应商的历史采购单后，即可自动生成本物料的多供应商比价</p>
        </div>
      )}
    </div>
  );
}
