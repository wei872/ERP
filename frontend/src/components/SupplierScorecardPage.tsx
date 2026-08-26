import { Fragment, useEffect, useState } from 'react';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const GRADE_STYLE: Record<string, string> = {
  A: 'bg-emerald-500 text-white', B: 'bg-blue-500 text-white',
  C: 'bg-amber-500 text-white', D: 'bg-red-400 text-white', '—': 'bg-slate-200 text-slate-500',
};

function DimBar({ label, value, weight }: { label: string; value: number | null; weight: string }) {
  return (
    <div className="min-w-[110px]">
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-slate-400">{label} <span className="text-slate-300">({weight})</span></span>
        <span className="tabular-nums font-bold text-slate-700">{value == null ? '—' : `${Number(value).toFixed(1)}%`}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${value == null ? '' : Number(value) >= 90 ? 'bg-emerald-400' : Number(value) >= 75 ? 'bg-blue-400' : Number(value) >= 60 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, Number(value || 0))}%` }}></div>
      </div>
    </div>
  );
}

/** 供应商记分卡（v5.28）：交期40% + 质量40% + 价格20% 加权评分，星级榜单（数据源：采购单/来料检验/采购比价） */
export default function SupplierScorecardPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 交付绩效明细（v5.31 行展开）
  const [openCode, setOpenCode] = useState('');
  const [deliv, setDeliv] = useState<any>(null);

  useEffect(() => {
    bizApi.supplierScorecard().then(r => setRows(r.data || [])).catch(e => setError(e.message || '加载失败')).finally(() => setLoading(false));
  }, []);

  const toggleDelivery = async (code: string) => {
    if (openCode === code) { setOpenCode(''); return; }
    setOpenCode(code); setDeliv(null);
    try { setDeliv(await bizApi.supplierDelivery(code).then(r => r.data)); }
    catch { setDeliv({ stats: {}, trend: [], orders: [] }); }
  };

  const ranked = rows.filter(r => Number(r.total_score ?? 0) > 0 || r.order_cnt > 0);

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #134e4a, #0f766e 55%, #14b8a6)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-teal-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">🏅 供应商记分卡</h2>
          <p className="text-[11px] md:text-xs text-teal-100 mt-1.5">三维加权评分：交期准时率 40%（全部到货订单占比）· 来料质量合格率 40% · 价格竞争力 20%（与同料最低价之比）</p>
        </div>
      </div>

      {error && <div className="erp-card p-8 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-sm text-red-500">{error}</p></div>}
      {loading && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">评分计算中…</p></div>}

      {!loading && !error && (
        <div className="erp-card p-3 md:p-4 overflow-x-auto">
          <table className="erp-table text-xs w-full min-w-[960px]">
            <thead><tr><th>排名</th><th className="text-left">供应商</th><th>采购规模</th><th>交期（40%）</th><th>质量（40%）</th><th>价格（20%）</th><th>综合得分</th><th>评级</th></tr></thead>
            <tbody>
              {ranked.map((r, i) => (
                <Fragment key={r.supplier_code}>
                <tr className="cursor-pointer hover:bg-slate-50/80" onClick={() => toggleDelivery(r.supplier_code)} title="点击查看交付绩效明细">
                  <td className="text-center">{i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-slate-400 tabular-nums">{i + 1}</span>}</td>
                  <td className="text-left"><p className="font-medium text-slate-700 whitespace-nowrap">{r.supplier_name} <span className="text-[9px] text-slate-300">{openCode === r.supplier_code ? '▲' : '▼'}</span></p><p className="text-[10px] text-slate-400">{r.supplier_code} · {r.supplier_type} · {r.level}</p></td>
                  <td className="whitespace-nowrap"><p className="tabular-nums font-semibold">¥{money(r.order_amount)}</p><p className="text-[10px] text-slate-400">{r.order_cnt} 单</p></td>
                  <td><DimBar label="全部到货率" value={r.delivery_rate == null ? null : Number(r.delivery_rate)} weight="40%" /></td>
                  <td><DimBar label="来料合格率" value={r.quality_rate == null ? null : Number(r.quality_rate)} weight="40%" /></td>
                  <td><DimBar label="价格竞争力" value={r.price_score == null ? null : Number(r.price_score)} weight="20%" /></td>
                  <td className="tabular-nums text-lg font-bold text-slate-800">{Number(r.total_score || 0).toFixed(1)}</td>
                  <td className="text-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold text-sm ${GRADE_STYLE[r.grade] || GRADE_STYLE['—']}`}>{r.grade}</span>
                    <p className="text-[10px] text-amber-500 mt-0.5">{'★'.repeat(Number(r.stars || 0))}<span className="text-slate-200">{'★'.repeat(Math.max(0, 5 - Number(r.stars || 0)))}</span></p>
                  </td>
                </tr>
                {openCode === r.supplier_code && (
                  <tr>
                    <td colSpan={8} className="bg-slate-50/70 p-0">
                      {!deliv ? <p className="text-[11px] text-slate-400 px-4 py-4"><span className="erp-spinner inline-block mr-2"></span>交付明细加载中…</p> : (
                        <div className="px-4 py-3 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center"><p className="text-[10px] text-slate-400">历史订单</p><p className="text-sm font-bold tabular-nums text-slate-800">{Number(deliv.stats?.order_count || 0)} 单</p></div>
                            <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center"><p className="text-[10px] text-slate-400">累计采购额</p><p className="text-sm font-bold tabular-nums text-slate-800">¥{money(deliv.stats?.amount)}</p></div>
                            <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center"><p className="text-[10px] text-slate-400">全部到货率</p><p className="text-sm font-bold tabular-nums text-emerald-600">{Number(deliv.stats?.full_rate || 0).toFixed(1)}%</p></div>
                            <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center"><p className="text-[10px] text-slate-400">在途/未到货</p><p className={`text-sm font-bold tabular-nums ${Number(deliv.stats?.in_transit || 0) ? 'text-amber-600' : 'text-slate-400'}`}>{Number(deliv.stats?.in_transit || 0)} 单</p></div>
                          </div>
                          {(deliv.trend || []).length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-500 mb-1.5">近 6 月采购金额</p>
                              <div className="flex items-end gap-2 h-14">
                                {(deliv.trend || []).map((t: any) => {
                                  const max = Math.max(...(deliv.trend || []).map((x: any) => Number(x.amount) || 0), 1);
                                  return (
                                    <div key={t.month} className="flex-1 flex flex-col items-center gap-0.5" title={`${t.month}：¥${Number(t.amount).toLocaleString()}`}>
                                      <div className="w-full rounded-t bg-teal-400/80" style={{ height: `${Math.max(6, (Number(t.amount) / max) * 40)}px` }}></div>
                                      <span className="text-[8px] text-slate-400">{String(t.month).slice(5)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                            <table className="erp-table text-[11px] w-full min-w-[520px]">
                              <thead><tr><th className="text-left">采购单</th><th>日期</th><th>金额</th><th>采购员</th><th>状态</th><th>到货</th></tr></thead>
                              <tbody>
                                {(deliv.orders || []).map((o: any) => (
                                  <tr key={o.purchase_no}>
                                    <td className="text-left font-mono text-indigo-600 whitespace-nowrap">{o.purchase_no}</td>
                                    <td className="tabular-nums whitespace-nowrap">{String(o.purchase_date || '').slice(0, 10)}</td>
                                    <td className="tabular-nums font-semibold whitespace-nowrap">¥{money(o.total_amount)}</td>
                                    <td className="whitespace-nowrap">{o.buyer}</td>
                                    <td className="whitespace-nowrap text-slate-500">{o.purchase_status}</td>
                                    <td className="whitespace-nowrap"><span className={`px-1.5 py-0.5 rounded text-[10px] ${o.arrival_status === '全部到货' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{o.arrival_status}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {ranked.length === 0 && <p className="text-xs text-slate-400 text-center py-10">暂无采购数据，录入采购单与来料检验后即可生成记分卡</p>}
        </div>
      )}

      <div className="erp-card p-4 text-[11px] text-slate-500 space-y-1">
        <p>📏 评分口径：综合得分 = 各可用维度加权平均（缺数据维度不参与，避免误伤新供应商）。</p>
        <p>🏆 评级标准：≥90 → A（战略优先）；80~90 → B（合格优选）；70~80 → C（观察改进）；&lt;70 → D（限期整改/减量）。</p>
        <p>🔗 与「采购比价评级」页联动：下单前先看记分卡选供应商，再看比价页核价格。</p>
      </div>
    </div>
  );
}
