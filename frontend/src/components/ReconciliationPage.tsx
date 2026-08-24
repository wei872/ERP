import { toastNotify } from '../utils/toast';
import { useCallback, useEffect, useState } from 'react';
import { bizApi, dataApi } from '../api';
import { useAuth } from '../context/AuthContext';

function fmt(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'; }

type Row = Record<string, unknown>;
const STATUS_STYLE: Record<string, string> = {
  '应收': 'bg-blue-100 text-blue-700', '应付': 'bg-cyan-100 text-cyan-700',
  '已核销': 'bg-emerald-100 text-emerald-700', '部分核销': 'bg-amber-100 text-amber-700',
};

export default function ReconciliationPage() {
  const { currentUser } = useAuth();
  const canAccess = currentUser?.role === 'admin' || currentUser?.role === 'accounting';
  const [showGuide, setShowGuide] = useState(false);
  const [tab, setTab] = useState<'receivable' | 'payable'>('receivable');
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 核销 modal
  const [active, setActive] = useState<Row | null>(null);
  const [amount, setAmount] = useState(0);

  const toastFn = useCallback((m: string) => toastNotify(m), []);
  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true); setError('');
    const t = tab === 'receivable' ? 'finance_receivable_main' : 'finance_payable_main';
    try {
      const r = await dataApi.list(t, 1, 100, search);
      setRows(r.data?.rows || []);
    } catch (e: any) { setError(e.message || '加载失败'); setRows([]); }
    setLoading(false);
  }, [tab, search, canAccess]);

  useEffect(() => { load(); }, [load]);

  const openReconcile = (row: Row) => {
    setActive(row);
    const remain = Number(tab === 'receivable' ? row.remain_amount : row.remain_amount) || 0;
    setAmount(remain > 0 ? remain : 0);
  };

  const doReconcile = async () => {
    if (!active) return;
    const no = String(tab === 'receivable' ? active.receivable_no : active.payable_no);
    if (!no) { toastFn('单号缺失'); return; }
    if (amount <= 0) { toastFn('核销金额必须大于 0'); return; }
    try {
      await bizApi.reconcile(tab, no, amount);
      toastFn(`核销成功：${no} ¥${fmt(amount)}`);
      setActive(null);
      load();
    } catch (e: any) { toastFn('核销失败: ' + e.message); }
  };

  if (!canAccess) return <div className="p-12 text-center"><div className="text-5xl mb-3">🔒</div><p className="text-gray-500">仅 admin / accounting 可访问</p></div>;

  const totalAmt = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const totalDone = rows.reduce((s, r) => s + (Number(tab === 'receivable' ? r.received_amount : r.paid_amount) || 0), 0);
  const totalRemain = rows.reduce((s, r) => s + (Number(r.remain_amount) || 0), 0);

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* UI 引导与数据联动说明 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl px-5 py-3 text-white shadow-lg">
        <button onClick={() => setShowGuide(s => !s)} className="w-full flex items-center justify-between text-left">
          <h3 className="font-bold text-sm flex items-center gap-2 text-indigo-300"> <span>💡</span> 应收应付核销使用指南与后台数据联动说明 </h3>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">资金流水 + 记账凭证全联动</span>
            <span className="text-indigo-300/70 text-xs">{showGuide ? '▲ 收起' : '▼ 展开'}</span>
          </span>
        </button>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed mt-3 ${showGuide ? '' : 'hidden'}`}>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <span>📝</span> 步骤指引：
            </div>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
              <li>切换顶部【应收单】或【应付单】查看客户打款/供应商付款待处理清单。</li>
              <li>在目标行点击 **【核销】** 按钮。</li>
              <li>在弹窗中确认或修改本次实收/实付金额，点击 **【确认核销】**。</li>
            </ol>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <span>🔄</span> 自动数据联动：
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
              <li>核销完成 ➔ 自动向 `finance_income`/`expense` 写入资金流水，单据置为 `已核销`。</li>
              <li>应收核销完成 ➔ **自动生成收款凭证（借:1002银行存款 贷:1122应收账款）**。</li>
              <li>应付核销完成 ➔ **自动生成付款凭证（借:2202应付账款 贷:1002银行存款）**，并实时更新总账科目余额。</li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-800">💸 应收应付核销</h2>
        <p className="text-sm text-gray-500 mt-1">基于 finance_receivable_main / finance_payable_main 真实核销：累加已收/已付、更新余额与状态、同步资金流水</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          <button onClick={()=>{setTab('receivable'); setSearch('');}} className={`px-4 py-2 rounded-lg text-sm ${tab==='receivable'?'bg-blue-600 text-white':'bg-white border'}`}>应收单</button>
          <button onClick={()=>{setTab('payable'); setSearch('');}} className={`px-4 py-2 rounded-lg text-sm ${tab==='payable'?'bg-cyan-600 text-white':'bg-white border'}`}>应付单</button>
        </div>
        <div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索单号/客户/供应商..." className="px-3 py-2 border rounded-lg text-sm w-64"/>
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-white border rounded-lg text-sm">↻ 刷新</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 p-4 rounded-lg"><div className="text-xs text-blue-400">单据总额</div><div className="text-xl font-bold text-blue-700">¥{fmt(totalAmt)}</div></div>
        <div className="bg-emerald-50 p-4 rounded-lg"><div className="text-xs text-emerald-400">已{tab==='receivable'?'收':'付'}</div><div className="text-xl font-bold text-emerald-700">¥{fmt(totalDone)}</div></div>
        <div className="bg-amber-50 p-4 rounded-lg"><div className="text-xs text-amber-400">未{tab==='receivable'?'收':'付'}</div><div className="text-xl font-bold text-amber-700">¥{fmt(totalRemain)}</div></div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b">
              <th className="px-3 py-3 text-left text-xs text-gray-500">单号</th>
              {tab === 'receivable'
                ? <><th className="px-3 py-3 text-left text-xs text-gray-500">客户</th><th className="px-3 py-3 text-left text-xs text-gray-500">到期日</th></>
                : <><th className="px-3 py-3 text-left text-xs text-gray-500">供应商</th><th className="px-3 py-3 text-left text-xs text-gray-500">到期日</th></>}
              <th className="px-3 py-3 text-right text-xs text-gray-500">总额</th>
              <th className="px-3 py-3 text-right text-xs text-gray-500">已{tab==='receivable'?'收':'付'}</th>
              <th className="px-3 py-3 text-right text-xs text-gray-500">未{tab==='receivable'?'收':'付'}</th>
              <th className="px-3 py-3 text-center text-xs text-gray-500">状态</th>
              <th className="px-3 py-3 text-center text-xs text-gray-500 w-32">操作</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 && !loading && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">暂无{tab==='receivable'?'应收':'应付'}单据<br/><span className="text-xs">提示：销售/采购单通过 DataController 写入后会自动生成应收/应付基表</span></td></tr>}
              {rows.map((r, i) => {
                const no = String(tab === 'receivable' ? r.receivable_no : r.payable_no);
                const remain = Number(r.remain_amount) || 0;
                const isDone = String(r.status) === '已核销';
                return (
                  <tr key={no || i} className="hover:bg-blue-50/30">
                    <td className="px-3 py-2.5 text-xs font-mono text-blue-600">{no || '-'}</td>
                    <td className="px-3 py-2.5 text-xs">{tab === 'receivable' ? String(r.customer_name || '-') : String(r.supplier_name || '-')}</td>
                    <td className="px-3 py-2.5 text-xs">{String(r.due_date || '-').slice(0, 10)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">¥{fmt(r.total_amount)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-600">¥{fmt(tab==='receivable' ? r.received_amount : r.paid_amount)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-amber-600">¥{fmt(r.remain_amount)}</td>
                    <td className="px-3 py-2.5 text-center"><span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-semibold ${STATUS_STYLE[String(r.status)]||'bg-gray-100 text-gray-600'}`}>{String(r.status || '-')}</span></td>
                    <td className="px-3 py-2.5 text-center">
                      {isDone
                        ? <span className="text-xs text-gray-400">已完成</span>
                        : <button onClick={()=>openReconcile(r)} className="px-3 py-1 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600">核销</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {active && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setActive(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-emerald-50 flex items-center justify-between">
              <h3 className="font-bold">{tab==='receivable'?'应收':'应付'}核销</h3>
              <button onClick={()=>setActive(null)} className="text-gray-400">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <Row label="单号" value={String(tab==='receivable'?active.receivable_no:active.payable_no)} />
              <Row label={tab==='receivable'?'客户':'供应商'} value={String(tab==='receivable'?active.customer_name:active.supplier_name) || '-'} />
              <Row label="单据总额" value={`¥${fmt(active.total_amount)}`} />
              <Row label={`已${tab==='receivable'?'收':'付'}`} value={`¥${fmt(tab==='receivable'?active.received_amount:active.paid_amount)}`} />
              <Row label="未核销余额" value={`¥${fmt(active.remain_amount)}`} className="text-amber-700" />
              <div>
                <label className="text-xs text-gray-500">本次核销金额</label>
                <input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value)||0)} max={Number(active.remain_amount)||0} step="0.01" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/>
                <div className="text-xs text-gray-400 mt-1">最大可核销 ¥{fmt(active.remain_amount)}</div>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
              <button onClick={()=>setActive(null)} className="px-4 py-2 text-sm text-gray-600">取消</button>
              <button onClick={doReconcile} className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg">确认核销</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className="flex justify-between text-sm"><span className="text-gray-500">{label}</span><span className={`font-medium ${className||''}`}>{value}</span></div>;
}