import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';
import { useAuth } from '../context/AuthContext';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const DEPTS = ['销售部', '采购部', '生产部', '仓储部', '财务部', '人事部'];

/** 部门预算编制与执行看板（v5.30）：月度预算编制 + 费用执行率三色预警（口径同工作流费用审批） */
export default function BudgetDashboardPage() {
  const { currentUser } = useAuth();
  const canManage = ['admin', 'accounting', 'hr'].includes(currentUser?.role || '');
  const [month, setMonth] = useState<string>(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [editRow, setEditRow] = useState<any | 'new' | null>(null);
  const [fDept, setFDept] = useState(DEPTS[0]);
  const [fAmt, setFAmt] = useState<number | ''>('');
  const [fRemark, setFRemark] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback((m: string) => {
    setError(''); setData(null);
    bizApi.budgetDashboard(m).then(r => setData(r.data)).catch(e => setError(e.message || '加载失败'));
  }, []);
  useEffect(() => { load(month); }, [month, load]);

  const openEdit = (row: any | 'new') => {
    setEditRow(row);
    if (row === 'new') { setFDept(DEPTS[0]); setFAmt(''); setFRemark(''); }
    else { setFDept(row.department); setFAmt(Number(row.budget)); setFRemark(String(row.remark || '')); }
  };
  const doSave = async () => {
    if (!(Number(fAmt) > 0)) { toastNotify('预算金额须大于 0', 'warn'); return; }
    setBusy(true);
    try {
      await bizApi.budgetSet({ department: fDept, budget_month: month, budget_amount: Number(fAmt), remark: fRemark });
      toastNotify(`${fDept} ${month} 预算已保存：¥${money(fAmt)}`);
      setEditRow(null);
      load(month);
    } catch (e: any) { toastNotify('保存失败：' + (e.message || ''), 'error'); }
    setBusy(false);
  };

  const t = data?.totals || {};

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1200px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #14532d, #166534 55%, #16a34a)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-green-400/20 blur-2xl"></div>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">🧮 部门预算看板</h2>
            <p className="text-[11px] md:text-xs text-green-100 mt-1.5">月度预算编制 · 执行口径 = 费用审批（待审批+已通过）金额 · 超支红色预警</p>
          </div>
          <div className="flex gap-2">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-sm focus:outline-none [color-scheme:dark]"/>
            {canManage && <button onClick={() => openEdit('new')} className="px-4 py-2 rounded-xl bg-white text-green-700 text-sm font-semibold hover:bg-green-50 transition-colors">＋ 编制预算</button>}
          </div>
        </div>
      </div>

      {/* 汇总卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">预算总额（{t.month || month}）</p><p className="text-xl font-bold tabular-nums text-slate-800">¥{money(t.budget)}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">已发生费用</p><p className="text-xl font-bold tabular-nums text-blue-600">¥{money(t.used)}</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">整体执行率</p><p className={`text-xl font-bold tabular-nums ${Number(t.rate || 0) > 100 ? 'text-red-500' : Number(t.rate || 0) >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{Number(t.rate || 0).toFixed(1)}%</p></div>
        <div className="erp-card p-4"><p className="text-[11px] text-slate-400 mb-1">超支部门</p><p className={`text-xl font-bold tabular-nums ${Number(t.over_count || 0) ? 'text-red-500' : 'text-slate-400'}`}>{Number(t.over_count || 0)} 个</p></div>
      </div>

      {error && <div className="erp-card p-8 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-sm text-red-500">{error}</p></div>}
      {!data && !error && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">预算数据加载中…</p></div>}

      {data && (
        <div className="erp-card p-3 md:p-4 overflow-x-auto">
          <table className="erp-table text-xs w-full min-w-[760px]">
            <thead><tr><th className="text-left">部门</th><th>月度预算</th><th>已发生</th><th>执行率</th><th>剩余可用</th><th>备注</th>{canManage && <th>操作</th>}</tr></thead>
            <tbody>
              {(data.rows || []).length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="text-center py-10 text-slate-400">本月尚未编制预算{canManage ? '，点右上「编制预算」开始' : ''}</td></tr>}
              {(data.rows || []).map((r: any) => {
                const rate = Number(r.rate || 0);
                return (
                  <tr key={r.department} className={rate > 100 ? 'bg-red-50/40' : ''}>
                    <td className="text-left font-semibold text-slate-700 whitespace-nowrap">{r.department}</td>
                    <td className="tabular-nums whitespace-nowrap">¥{money(r.budget)}</td>
                    <td className="tabular-nums whitespace-nowrap text-slate-600">¥{money(r.used)}</td>
                    <td className="min-w-[150px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex-1"><div className={`h-full rounded-full ${rate > 100 ? 'bg-red-500' : rate >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, rate)}%` }}></div></div>
                        <span className={`tabular-nums font-bold shrink-0 ${rate > 100 ? 'text-red-500' : rate >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>{rate.toFixed(1)}%</span>
                      </div>
                      {rate > 100 && <p className="text-[9px] text-red-500 mt-0.5">⚠️ 已超支 ¥{money(Number(r.used) - Number(r.budget))}</p>}
                    </td>
                    <td className={`tabular-nums whitespace-nowrap font-medium ${Number(r.available) < 0 ? 'text-red-500' : 'text-slate-600'}`}>¥{money(r.available)}</td>
                    <td className="text-slate-400 max-w-[140px] truncate">{r.remark || '—'}</td>
                    {canManage && <td><button onClick={() => openEdit(r)} className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-500">调整</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 编制/调整弹窗 */}
      {editRow && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 erp-modal-bg" onClick={() => setEditRow(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-green-50 flex items-center justify-between"><h3 className="font-bold text-slate-800">{editRow === 'new' ? '＋ 编制预算' : `调整预算 · ${editRow.department}`}</h3><button onClick={() => setEditRow(null)} className="text-slate-400">✕</button></div>
            <div className="p-6 space-y-3 text-sm">
              <div><label className="text-xs font-medium text-slate-500">部门</label>
                <select value={fDept} onChange={e => setFDept(e.target.value)} disabled={editRow !== 'new'} className="erp-input disabled:bg-slate-50 disabled:text-slate-400">{DEPTS.map(x => <option key={x}>{x}</option>)}</select>
              </div>
              <div><label className="text-xs font-medium text-slate-500">预算金额（{month}）*</label><input type="number" min={0} step="100" value={fAmt} onChange={e => setFAmt(e.target.value === '' ? '' : Number(e.target.value))} className="erp-input font-mono tabular-nums"/></div>
              <div><label className="text-xs font-medium text-slate-500">备注</label><input value={fRemark} onChange={e => setFRemark(e.target.value)} placeholder="如：含差旅与展会费用" className="erp-input"/></div>
              <p className="text-[11px] text-slate-400">执行口径：{month} 提交的费用审批（待审批+已通过）金额合计；重复保存同部门同月份即覆盖更新。</p>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50">
              <button onClick={() => setEditRow(null)} className="erp-btn erp-btn-ghost">取消</button>
              <button onClick={doSave} disabled={busy} className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-500 disabled:opacity-50">{busy ? '保存中…' : '确认保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
