import { Fragment, useEffect, useState } from 'react';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

function DaysBadge({ days, status }: { days: number; status: string }) {
  if (status !== '执行中' && status !== '草稿') return <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full whitespace-nowrap">{status}</span>;
  if (days < 0) return <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full whitespace-nowrap animate-pulse">已过期 {-days} 天</span>;
  if (days <= 30) return <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">{days} 天后到期</span>;
  return <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">剩余 {days} 天</span>;
}

/** 合同执行跟踪（v5.27）：合同 ↔ 订单 ↔ 收付款 三单关联视图，执行/回款进度 + 到期自动预警 */
export default function ContractTrackingPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | '销售合同' | '采购合同'>('all');
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [openNo, setOpenNo] = useState('');

  useEffect(() => { bizApi.contractTracking().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败')); }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">合同执行数据汇总中…</p></div>;

  const t = data.totals || {};
  const rows: any[] = ((data.rows || []) as any[]).filter((r: any) =>
    (tab === 'all' || r.contract_type === tab) &&
    (!onlyRisk || (r.status === '执行中' && Number(r.days_left) <= 30)));

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8 55%, #3b82f6)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-blue-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">📑 合同执行跟踪</h2>
          <p className="text-[11px] md:text-xs text-blue-100 mt-1.5">合同 ↔ 订单 ↔ 收付款三单关联 · 执行/回款进度可视化 · 30 天内到期自动预警（仪表盘待办同步提醒）</p>
        </div>
      </div>

      {/* 汇总卡 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="erp-card p-3.5 text-center"><p className="text-[10px] text-slate-400 mb-0.5">合同总数</p><p className="text-lg font-bold tabular-nums text-slate-800">{Number(t.count || 0)}</p></div>
        <div className="erp-card p-3.5 text-center"><p className="text-[10px] text-slate-400 mb-0.5">合同总金额</p><p className="text-lg font-bold tabular-nums text-slate-800">¥{money(t.amount)}</p></div>
        <div className="erp-card p-3.5 text-center"><p className="text-[10px] text-slate-400 mb-0.5">已下订单金额</p><p className="text-lg font-bold tabular-nums text-blue-600">¥{money(t.ordered)}</p></div>
        <div className="erp-card p-3.5 text-center"><p className="text-[10px] text-slate-400 mb-0.5">执行中</p><p className="text-lg font-bold tabular-nums text-indigo-600">{Number(t.in_progress || 0)}</p></div>
        <div className="erp-card p-3.5 text-center"><p className="text-[10px] text-slate-400 mb-0.5">30天内到期</p><p className={`text-lg font-bold tabular-nums ${Number(t.expiring || 0) ? 'text-amber-600' : 'text-slate-400'}`}>{Number(t.expiring || 0)}</p></div>
        <div className="erp-card p-3.5 text-center"><p className="text-[10px] text-slate-400 mb-0.5">已过期未完结</p><p className={`text-lg font-bold tabular-nums ${Number(t.expired || 0) ? 'text-red-500' : 'text-slate-400'}`}>{Number(t.expired || 0)}</p></div>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', '销售合同', '采购合同'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors ${tab === k ? 'bg-blue-600 text-white shadow' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{k === 'all' ? '全部合同' : k}</button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer ml-auto"><input type="checkbox" checked={onlyRisk} onChange={e => setOnlyRisk(e.target.checked)} className="accent-amber-500"/>只看到期风险（执行中且 ≤30 天）</label>
      </div>

      {/* 合同列表 */}
      {rows.length === 0 ? <div className="erp-card p-12 text-center"><div className="text-5xl mb-3">📑</div><p className="text-sm text-slate-400">无符合条件的合同</p></div> : (
        <div className="erp-card p-3 md:p-4 overflow-x-auto">
          <table className="erp-table text-xs w-full min-w-[900px]">
            <thead><tr><th className="text-left">合同</th><th className="text-left">对方单位</th><th>类型</th><th>合同金额</th><th>订单执行</th><th>回款/付款</th><th>到期状态</th><th>明细</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const exec = Number(r.exec_rate || 0), settle = Number(r.settle_rate || 0);
                const risk = r.status === '执行中' && Number(r.days_left) <= 30;
                return (
                  <Fragment key={r.contract_no}>
                    <tr className={`cursor-pointer hover:bg-slate-50/80 ${risk ? 'bg-amber-50/40' : ''}`} onClick={() => setOpenNo(openNo === r.contract_no ? '' : r.contract_no)}>
                      <td className="text-left"><p className="font-mono text-indigo-600 whitespace-nowrap">{r.contract_no}</p><p className="text-slate-600 font-medium truncate max-w-[180px]">{r.contract_name}</p></td>
                      <td className="text-left whitespace-nowrap text-slate-600">{r.party_name}</td>
                      <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${r.contract_type === '销售合同' ? 'bg-blue-50 text-blue-600' : r.contract_type === '采购合同' ? 'bg-cyan-50 text-cyan-600' : 'bg-slate-100 text-slate-500'}`}>{r.contract_type}</span></td>
                      <td className="tabular-nums font-semibold whitespace-nowrap">¥{money(r.amount)}</td>
                      <td className="min-w-[130px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex-1"><div className={`h-full rounded-full ${exec >= 100 ? 'bg-emerald-400' : 'bg-blue-400'}`} style={{ width: `${Math.min(100, exec)}%` }}></div></div>
                          <span className="tabular-nums font-bold shrink-0">{exec.toFixed(0)}%</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">{r.order_count} 单 · ¥{money(r.ordered_amount)}</p>
                      </td>
                      <td className="min-w-[130px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex-1"><div className={`h-full rounded-full ${settle >= 100 ? 'bg-emerald-400' : settle >= 50 ? 'bg-teal-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, settle)}%` }}></div></div>
                          <span className="tabular-nums font-bold shrink-0">{settle.toFixed(0)}%</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">{r.contract_type.includes('销售') ? '已回款' : '已付款'} ¥{money(r.settled_amount)}</p>
                      </td>
                      <td><DaysBadge days={Number(r.days_left)} status={r.status} /></td>
                      <td className="text-center text-slate-400 whitespace-nowrap">{openNo === r.contract_no ? '▲ 收起' : '▼ 三单明细'}</td>
                    </tr>
                    {openNo === r.contract_no && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50/70 p-0">
                          <div className="px-4 py-3">
                            <p className="text-[11px] font-bold text-slate-500 mb-2">🔗 关联订单（{r.orders?.length || 0} 单）{r.orders?.length > 0 ? ` · ${r.contract_type.includes('销售') ? '发货金额' : '到货金额'} ¥${money(r.delivered_amount)}（回款/付款依据应收应付台账核销记录）` : ''}</p>
                            {(r.orders || []).length === 0 ? <p className="text-[11px] text-slate-400 py-2">该合同尚未关联任何订单——在销售单/采购单的 contract_no 字段填写合同号即可自动关联。</p> : (
                              <div className="space-y-1.5">
                                {r.orders.map((o: any) => (
                                  <div key={o.doc_no} className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-white border border-slate-100 rounded-xl px-3 py-2 text-[11px]">
                                    <span className="font-mono text-indigo-600">{o.doc_no}</span>
                                    <span className="text-slate-400">{String(o.doc_date || '').slice(0, 10)}</span>
                                    <span className="tabular-nums font-semibold text-slate-700">¥{money(o.total_amount)}</span>
                                    <span className="text-slate-500">{o.doc_status}</span>
                                    {o.ship && <span className={`px-1.5 py-0.5 rounded ${o.ship === '已出库' || o.ship === '已入库' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{o.ship}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
