import { Fragment, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';
import { useAuth } from '../context/AuthContext';

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

const PLAN_STYLE: Record<string, string> = {
  '未收款': 'bg-slate-100 text-slate-500', '部分收款': 'bg-blue-50 text-blue-600',
  '已收款': 'bg-emerald-50 text-emerald-600', '已逾期': 'bg-red-50 text-red-600',
};

/** 合同执行跟踪（v5.27/5.28）：合同↔订单↔收付款三单关联 + 收款计划/开票管理，到期自动预警 */
export default function ContractTrackingPage() {
  const { currentUser } = useAuth();
  const canManage = ['admin', 'sales', 'accounting'].includes(currentUser?.role || '');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | '销售合同' | '采购合同'>('all');
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [openNo, setOpenNo] = useState('');
  // 收款计划 / 开票
  const [planData, setPlanData] = useState<any>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genTerms, setGenTerms] = useState(3);
  const [genFirst, setGenFirst] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addDue, setAddDue] = useState('');
  const [addAmt, setAddAmt] = useState<number | ''>('');
  const [collectPlan, setCollectPlan] = useState<any>(null);
  const [collectAmt, setCollectAmt] = useState<number | ''>('');
  const [invOpen, setInvOpen] = useState(false);
  const [invType, setInvType] = useState('增值税专票');
  const [invAmt, setInvAmt] = useState<number | ''>('');
  const [invRate, setInvRate] = useState<number>(13);
  const [busy, setBusy] = useState(false);

  useEffect(() => { bizApi.contractTracking().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败')); }, []);
  useEffect(() => {
    setPlanData(null);
    if (openNo) bizApi.contractPlanList(openNo).then(r => setPlanData(r.data)).catch(() => {});
  }, [openNo]);

  const reloadAll = () => bizApi.contractTracking().then(r => setData(r.data)).catch(() => {});
  const reloadPlans = () => { if (openNo) bizApi.contractPlanList(openNo).then(r => setPlanData(r.data)).catch(() => {}); };

  const doGen = async () => {
    setBusy(true);
    try {
      const r = await bizApi.planGenerate({ contract_no: openNo, terms: genTerms, first_date: genFirst });
      toastNotify(String(r.data)); setGenOpen(false); reloadPlans();
    } catch (e: any) { toastNotify(e.message || '生成失败', 'error'); }
    setBusy(false);
  };
  const doAdd = async () => {
    if (!addDue || !(Number(addAmt) > 0)) { toastNotify('请填写应收日期与金额', 'warn'); return; }
    setBusy(true);
    try {
      const r = await bizApi.planAdd({ contract_no: openNo, due_date: addDue, plan_amount: Number(addAmt) });
      toastNotify(String(r.data)); setAddOpen(false); setAddDue(''); setAddAmt(''); reloadPlans();
    } catch (e: any) { toastNotify(e.message || '追加失败', 'error'); }
    setBusy(false);
  };
  const doCollect = async () => {
    if (!(Number(collectAmt) > 0)) { toastNotify('请填写收款金额', 'warn'); return; }
    setBusy(true);
    try {
      const r = await bizApi.planCollect({ id: collectPlan.id, amount: Number(collectAmt) });
      toastNotify(`收款登记成功（流水 ${r.data.income_no}），本期状态：${r.data.status}`);
      setCollectPlan(null); setCollectAmt(''); reloadPlans(); reloadAll();
    } catch (e: any) { toastNotify(e.message || '收款登记失败', 'error'); }
    setBusy(false);
  };
  const doInvoice = async () => {
    if (!(Number(invAmt) > 0)) { toastNotify('请填写开票金额', 'warn'); return; }
    setBusy(true);
    try {
      const r = await bizApi.invoiceCreate({ contract_no: openNo, invoice_type: invType, amount: Number(invAmt), tax_rate: invRate });
      toastNotify(`开票登记成功：${r.data.invoice_no}`); setInvOpen(false); setInvAmt(''); reloadPlans();
    } catch (e: any) { toastNotify(e.message || '开票失败', 'error'); }
    setBusy(false);
  };
  const doVoid = async (id: number) => {
    try { await bizApi.invoiceVoid(id); toastNotify('发票已作废'); reloadPlans(); }
    catch (e: any) { toastNotify(e.message || '作废失败', 'error'); }
  };

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
          <p className="text-[11px] md:text-xs text-blue-100 mt-1.5">合同 ↔ 订单 ↔ 收付款 ↔ 收款计划 ↔ 开票 五单关联 · 执行/回款进度可视化 · 到期与逾期分期自动预警</p>
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
              {rows.map((r: any) => {
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
                      <td className="text-center text-slate-400 whitespace-nowrap">{openNo === r.contract_no ? '▲ 收起' : '▼ 五单明细'}</td>
                    </tr>
                    {openNo === r.contract_no && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50/70 p-0">
                          <div className="px-4 py-3 space-y-4">
                            {/* 关联订单 */}
                            <div>
                              <p className="text-[11px] font-bold text-slate-500 mb-2">🔗 关联订单（{r.orders?.length || 0} 单）{r.orders?.length > 0 ? ` · ${r.contract_type.includes('销售') ? '发货金额' : '到货金额'} ¥${money(r.delivered_amount)}` : ''}</p>
                              {(r.orders || []).length === 0 ? <p className="text-[11px] text-slate-400 py-1">该合同尚未关联任何订单——在销售单/采购单的 contract_no 字段填写合同号即可自动关联。</p> : (
                                <div className="space-y-1.5">
                                  {(r.orders || []).map((o: any) => (
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
                            {/* 收款计划 + 开票（销售合同） */}
                            {r.contract_type.includes('销售') && (
                              <div>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                  <p className="text-[11px] font-bold text-slate-500">💰 收款计划与开票</p>
                                  {canManage && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {(planData?.plans || []).length === 0
                                        ? <button onClick={() => { setGenFirst(''); setGenTerms(3); setGenOpen(true); }} className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-500">⚡ 生成收款计划</button>
                                        : <button onClick={() => setAddOpen(true)} className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-600 text-[11px] font-medium hover:bg-indigo-50">＋ 追加期数</button>}
                                      <button onClick={() => { setInvAmt(''); setInvOpen(true); }} className="px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-teal-600 text-[11px] font-medium hover:bg-teal-50">🧾 开票登记</button>
                                    </div>
                                  )}
                                </div>
                                {!planData ? <p className="text-[11px] text-slate-400">加载中…</p> : (
                                  <div className="space-y-2">
                                    {(planData.plans || []).length === 0 ? <p className="text-[11px] text-slate-400">暂无收款计划，点「生成收款计划」按合同金额均摊分期。</p> : (
                                      <div className="overflow-x-auto">
                                        <table className="erp-table text-[11px] w-full min-w-[560px]">
                                          <thead><tr><th>期数</th><th>应收日期</th><th>计划金额</th><th>已收</th><th>状态</th>{canManage && <th>操作</th>}</tr></thead>
                                          <tbody>
                                            {(planData.plans || []).map((p: any) => {
                                              const overdue = p.status !== '已收款' && new Date(String(p.due_date).slice(0, 10).replace(/-/g, '/')).getTime() < Date.now();
                                              const st = overdue && p.status !== '已收款' ? '已逾期' : p.status;
                                              const remain = Number(p.plan_amount || 0) - Number(p.received_amount || 0);
                                              return (
                                                <tr key={p.id} className={st === '已逾期' ? 'bg-red-50/50' : ''}>
                                                  <td className="text-center font-bold">第 {p.term_no} 期</td>
                                                  <td className="tabular-nums">{String(p.due_date || '').slice(0, 10)}</td>
                                                  <td className="tabular-nums">¥{money(p.plan_amount)}</td>
                                                  <td className="tabular-nums text-emerald-600">¥{money(p.received_amount)}</td>
                                                  <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PLAN_STYLE[st]} ${st === '已逾期' ? 'animate-pulse' : ''}`}>{st}</span></td>
                                                  {canManage && <td>{p.status !== '已收款' ? <button onClick={() => { setCollectPlan(p); setCollectAmt(Number(remain.toFixed(2))); }} className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-500">收款 ¥{money(remain)}</button> : <span className="text-[10px] text-slate-300">已结清</span>}</td>}
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                    {(planData.invoices || []).length > 0 && (
                                      <div className="overflow-x-auto">
                                        <table className="erp-table text-[11px] w-full min-w-[560px]">
                                          <thead><tr><th>发票号</th><th>类型</th><th>开票日期</th><th>金额</th><th>税率</th><th>状态</th>{canManage && <th>操作</th>}</tr></thead>
                                          <tbody>
                                            {(planData.invoices || []).map((v: any) => (
                                              <tr key={v.id}>
                                                <td className="font-mono text-teal-600">{v.invoice_no}</td>
                                                <td>{v.invoice_type}</td>
                                                <td className="tabular-nums">{String(v.invoice_date || '').slice(0, 10)}</td>
                                                <td className="tabular-nums font-semibold">¥{money(v.amount)}</td>
                                                <td className="tabular-nums">{Number(v.tax_rate || 0)}%</td>
                                                <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.status === '已开具' ? 'bg-teal-50 text-teal-600' : 'bg-slate-100 text-slate-400 line-through'}`}>{v.status}</span></td>
                                                {canManage && <td>{v.status === '已开具' && <button onClick={() => doVoid(v.id)} className="px-2 py-0.5 rounded-lg bg-white border border-red-200 text-red-500 text-[10px] font-medium hover:bg-red-50">作废</button>}</td>}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
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

      {/* 生成收款计划 */}
      {genOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 erp-modal-bg" onClick={() => setGenOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-indigo-50 flex items-center justify-between"><h3 className="font-bold text-slate-800">⚡ 生成收款计划</h3><button onClick={() => setGenOpen(false)} className="text-slate-400">✕</button></div>
            <div className="p-6 space-y-3 text-sm">
              <div><label className="text-xs font-medium text-slate-500">分期数（1~24）</label><input type="number" min={1} max={24} value={genTerms} onChange={e => setGenTerms(Number(e.target.value) || 3)} className="erp-input font-mono"/></div>
              <div><label className="text-xs font-medium text-slate-500">首期应收日期（选填，默认今日）</label><input type="date" value={genFirst} onChange={e => setGenFirst(e.target.value)} className="erp-input"/></div>
              <p className="text-[11px] text-slate-400">按合同金额均摊，每期间隔 3 个月；尾期吸收除不尽的尾差。生成后逐期登记收款，逾期分期自动进入待办提醒。</p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50">
              <button onClick={() => setGenOpen(false)} className="erp-btn erp-btn-ghost">取消</button>
              <button onClick={doGen} disabled={busy} className="erp-btn erp-btn-primary">{busy ? '生成中…' : '确认生成'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 追加期数 */}
      {addOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 erp-modal-bg" onClick={() => setAddOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-indigo-50 flex items-center justify-between"><h3 className="font-bold text-slate-800">＋ 追加一期收款</h3><button onClick={() => setAddOpen(false)} className="text-slate-400">✕</button></div>
            <div className="p-6 space-y-3 text-sm">
              <div><label className="text-xs font-medium text-slate-500">应收日期 *</label><input type="date" value={addDue} onChange={e => setAddDue(e.target.value)} className="erp-input"/></div>
              <div><label className="text-xs font-medium text-slate-500">计划金额 *</label><input type="number" min={0} step="0.01" value={addAmt} onChange={e => setAddAmt(e.target.value === '' ? '' : Number(e.target.value))} className="erp-input font-mono tabular-nums"/></div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50">
              <button onClick={() => setAddOpen(false)} className="erp-btn erp-btn-ghost">取消</button>
              <button onClick={doAdd} disabled={busy} className="erp-btn erp-btn-primary">{busy ? '提交中…' : '确认追加'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 收款登记 */}
      {collectPlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 erp-modal-bg" onClick={() => setCollectPlan(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-emerald-50 flex items-center justify-between"><h3 className="font-bold text-slate-800">💰 收款登记 · 第 {collectPlan.term_no} 期</h3><button onClick={() => setCollectPlan(null)} className="text-slate-400">✕</button></div>
            <div className="p-6 space-y-3 text-sm">
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">本期计划 <b>¥{money(collectPlan.plan_amount)}</b>，已收 <b className="text-emerald-600">¥{money(collectPlan.received_amount)}</b>，未收余额 <b className="text-red-500">¥{money(Number(collectPlan.plan_amount || 0) - Number(collectPlan.received_amount || 0))}</b></p>
              <div><label className="text-xs font-medium text-slate-500">本次收款金额 *</label><input type="number" min={0} step="0.01" value={collectAmt} onChange={e => setCollectAmt(e.target.value === '' ? '' : Number(e.target.value))} className="erp-input font-mono tabular-nums"/></div>
              <p className="text-[11px] text-slate-400">确认后同步生成收款流水（财务收入台账），支持分次收款。</p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50">
              <button onClick={() => setCollectPlan(null)} className="erp-btn erp-btn-ghost">取消</button>
              <button onClick={doCollect} disabled={busy} className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">{busy ? '登记中…' : '确认收款'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 开票登记 */}
      {invOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 erp-modal-bg" onClick={() => setInvOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-teal-50 flex items-center justify-between"><h3 className="font-bold text-slate-800">🧾 开票登记 · {openNo}</h3><button onClick={() => setInvOpen(false)} className="text-slate-400">✕</button></div>
            <div className="p-6 space-y-3 text-sm">
              <div><label className="text-xs font-medium text-slate-500">发票类型</label><select value={invType} onChange={e => setInvType(e.target.value)} className="erp-input">{['增值税专票', '增值税普票'].map(x => <option key={x}>{x}</option>)}</select></div>
              <div><label className="text-xs font-medium text-slate-500">开票金额 *</label><input type="number" min={0} step="0.01" value={invAmt} onChange={e => setInvAmt(e.target.value === '' ? '' : Number(e.target.value))} className="erp-input font-mono tabular-nums"/></div>
              <div><label className="text-xs font-medium text-slate-500">税率（%）</label><input type="number" min={0} max={100} step="0.5" value={invRate} onChange={e => setInvRate(Number(e.target.value) || 0)} className="erp-input font-mono tabular-nums"/></div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50">
              <button onClick={() => setInvOpen(false)} className="erp-btn erp-btn-ghost">取消</button>
              <button onClick={doInvoice} disabled={busy} className="px-5 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-500 disabled:opacity-50">{busy ? '登记中…' : '确认开票'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
