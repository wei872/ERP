import { toastNotify } from '../utils/toast';
import { getCurrentCompanyName } from '../utils/company';
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
  // 对账单打印
  const [statement, setStatement] = useState<{ customer: string; items: Row[] } | null>(null);

  const doPrintStatement = async () => {
    if (tab !== 'receivable') return;
    const customers = Array.from(new Set(rows.map(r => String(r.customer_name || '')))).filter(Boolean);
    if (customers.length === 0) { toastNotify('当前无应收单可打印对账单', 'warn'); return; }
    const target = window.prompt(`请输入要打印对账单的客户名称：\n（现有：${customers.slice(0, 6).join('、')}${customers.length > 6 ? '…' : ''}）`, customers[0]);
    if (!target) return;
    try {
      const r = await dataApi.list('finance_receivable_main', 1, 200, target.trim());
      const items = (r.data?.rows || []).filter((x: any) => String(x.customer_name) === target.trim());
      if (items.length === 0) { toastNotify('未找到该客户的应收单', 'warn'); return; }
      setStatement({ customer: target.trim(), items });
    } catch (e: any) { toastFn('查询失败：' + (e.message || '')); }
  };

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
        {tab === 'receivable' && <button onClick={doPrintStatement} title="按客户打印应收对账单" className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700">🖨️ 打印对账单</button>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 p-4 rounded-lg"><div className="text-xs text-blue-400">单据总额</div><div className="text-xl font-bold text-blue-700">¥{fmt(totalAmt)}</div></div>
        <div className="bg-emerald-50 p-4 rounded-lg"><div className="text-xs text-emerald-400">已{tab==='receivable'?'收':'付'}</div><div className="text-xl font-bold text-emerald-700">¥{fmt(totalDone)}</div></div>
        <div className="bg-amber-50 p-4 rounded-lg"><div className="text-xs text-amber-400">未{tab==='receivable'?'收':'付'}</div><div className="text-xl font-bold text-amber-700">¥{fmt(totalRemain)}</div></div>
      </div>

      {/* 账龄分析：未核销余额按到期日分桶，催收/付款节奏一目了然 */}
      {(() => {
        const now = Date.now();
        const buckets = [
          { key: '未到期', cls: 'bg-emerald-400', text: 'text-emerald-600', amt: 0 },
          { key: '逾期 1-30 天', cls: 'bg-amber-300', text: 'text-amber-600', amt: 0 },
          { key: '逾期 31-60 天', cls: 'bg-orange-400', text: 'text-orange-600', amt: 0 },
          { key: '逾期 61-90 天', cls: 'bg-red-400', text: 'text-red-500', amt: 0 },
          { key: '逾期 90 天以上', cls: 'bg-red-600', text: 'text-red-700', amt: 0 },
        ];
        for (const r of rows) {
          const remain = Number(r.remain_amount) || 0;
          if (remain <= 0) continue;
          const due = new Date(String(r.due_date || '').slice(0, 10).replace(/-/g, '/')).getTime();
          const overdue = Number.isFinite(due) ? Math.floor((now - due) / 86400000) : 0;
          if (overdue <= 0) buckets[0].amt += remain;
          else if (overdue <= 30) buckets[1].amt += remain;
          else if (overdue <= 60) buckets[2].amt += remain;
          else if (overdue <= 90) buckets[3].amt += remain;
          else buckets[4].amt += remain;
        }
        const maxAmt = Math.max(...buckets.map(b => b.amt), 1);
        const overdueTotal = buckets.slice(1).reduce((s, b) => s + b.amt, 0);
        return (
          <div className="erp-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-400 to-red-500"></span>{tab === 'receivable' ? '应收' : '应付'}账龄分析（未核销余额）</h3>
              {overdueTotal > 0
                ? <span className="text-[11px] font-medium text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">⚠️ 逾期合计 ¥{overdueTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                : <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">✅ 无逾期</span>}
            </div>
            <div className="space-y-2.5">
              {buckets.map(b => (
                <div key={b.key} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-28 shrink-0">{b.key}</span>
                  <div className="flex-1 bg-slate-50 rounded-full h-4 overflow-hidden">
                    <div className={`h-full rounded-full ${b.cls} transition-all duration-500`} style={{ width: `${Math.max(b.amt > 0 ? 2 : 0, (b.amt / maxAmt) * 100)}%` }}></div>
                  </div>
                  <span className={`text-xs font-semibold tabular-nums w-32 text-right ${b.amt > 0 ? b.text : 'text-slate-300'}`}>¥{b.amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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

      {/* 客户对账单打印弹窗 */}
      {statement && (() => {
        const total = statement.items.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
        const received = statement.items.reduce((s, r) => s + (Number(r.received_amount) || 0), 0);
        const remain = statement.items.reduce((s, r) => s + (Number(r.remain_amount) || 0), 0);
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[95] p-4" onClick={() => setStatement(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-3 border-b flex items-center justify-between no-print shrink-0">
                <h3 className="font-bold text-slate-800 text-sm">🖨️ 客户对账单预览 · {statement.customer}</h3>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="px-4 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-700">打印</button>
                  <button onClick={() => setStatement(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs hover:bg-slate-200">关闭</button>
                </div>
              </div>
              <div className="p-8 overflow-y-auto flex-1 print-area">
                <div className="text-center mb-6">
                  <p className="text-sm font-semibold text-slate-700 tracking-widest">{getCurrentCompanyName()}</p>
                  <h1 className="text-xl font-bold tracking-[0.3em] text-slate-800 mt-1">客 户 对 账 单</h1>
                  <p className="text-[11px] text-slate-400 mt-1">打印时间：{new Date().toLocaleString('zh-CN')}</p>
                </div>
                <div className="flex justify-between text-xs text-slate-600 mb-3">
                  <span>客户名称：<b>{statement.customer}</b></span>
                  <span>单据笔数：<b>{statement.items.length}</b></span>
                </div>
                <table className="w-full text-xs border-collapse mb-4">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 px-2 py-1.5">应收单号</th>
                      <th className="border border-slate-300 px-2 py-1.5">日期</th>
                      <th className="border border-slate-300 px-2 py-1.5">到期日</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right">应收金额</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right">已收款</th>
                      <th className="border border-slate-300 px-2 py-1.5 text-right">未收余额</th>
                      <th className="border border-slate-300 px-2 py-1.5">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.items.map((r, i) => (
                      <tr key={i}>
                        <td className="border border-slate-300 px-2 py-1.5 font-mono">{String(r.receivable_no)}</td>
                        <td className="border border-slate-300 px-2 py-1.5">{String(r.created_at || '').slice(0, 10)}</td>
                        <td className="border border-slate-300 px-2 py-1.5">{String(r.due_date || '').slice(0, 10)}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{fmt(r.total_amount)}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{fmt(r.received_amount)}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-medium">{fmt(r.remain_amount)}</td>
                        <td className="border border-slate-300 px-2 py-1.5">{String(r.status)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td className="border border-slate-300 px-2 py-2 text-center" colSpan={3}>合计</td>
                      <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">¥{fmt(total)}</td>
                      <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">¥{fmt(received)}</td>
                      <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">¥{fmt(remain)}</td>
                      <td className="border border-slate-300 px-2 py-2"></td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 mb-8">截至打印日，贵司未结清余额为 <b className="text-slate-800">¥{fmt(remain)}</b>。如有异议请于 7 个工作日内与我司财务部联系核对。</p>
                <div className="grid grid-cols-2 gap-8 text-xs text-slate-500">
                  <div>供方（盖章）：{getCurrentCompanyName()}<br/><br/>经办人：__________</div>
                  <div>客方（确认）：{statement.customer}<br/><br/>经办人：__________</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className="flex justify-between text-sm"><span className="text-gray-500">{label}</span><span className={`font-medium ${className||''}`}>{value}</span></div>;
}