import { toastNotify } from '../utils/toast';
import { useState } from 'react';
import { bizApi } from '../api';

const PRESETS = ['资产', '负债', '权益', '利润', '现金流'] as const;
type Stmt = 'balance' | 'income' | 'cashflow';
const NAMES: Record<Stmt, string> = { balance: '资产负债表', income: '利润表', cashflow: '现金流量表' };

function fmt(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'; }

export default function FinancialStatementsPage() {
  const [showGuide, setShowGuide] = useState(false);
  const [stmt, setStmt] = useState<Stmt>('balance');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError(''); setData(null);
    try {
      const r = stmt === 'balance' ? await bizApi.balanceSheet(period)
        : stmt === 'income' ? await bizApi.incomeStatement(period)
        : await bizApi.cashFlow(period);
      setData(r.data);
    } catch (e: any) { setError(e.message || '加载失败'); }
    setLoading(false);
  };

  const toastFn = (m: string) => toastNotify(m);

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* UI 引导与数据联动说明 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl px-5 py-3 text-white shadow-lg">
        <button onClick={() => setShowGuide(s => !s)} className="w-full flex items-center justify-between text-left">
          <h3 className="font-bold text-sm flex items-center gap-2 text-indigo-300"> <span>💡</span> 三大财务报表使用指南与后台数据联动说明 </h3>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">科目余额实时穿透聚合</span>
            <span className="text-indigo-300/70 text-xs">{showGuide ? '▲ 收起' : '▼ 展开'}</span>
          </span>
        </button>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed mt-3 ${showGuide ? '' : 'hidden'}`}>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <span>📝</span> 步骤指引：
            </div>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
              <li>点击切换【资产负债表】/【利润表】/【现金流量表】。</li>
              <li>选择会计期间（如 `2026-08`），点击【查询】。</li>
              <li>查看各科目期末余额明细与会计恒等式校验。</li>
            </ol>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <span>🔄</span> 自动数据联动：
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
              <li>资产负债表 ➔ 自动按 1/2/4 科目聚合，严格满足 资产 ＝ 负债 ＋ 所有者权益 恒等式。</li>
              <li>利润表 ➔ 自动按 6 开头损益类科目聚合，算清营业收入、6401 成本与净利润。</li>
              <li>现金流量表 ➔ 自动按资金流水（`finance_income`/`expense`）计算经营现金净流量。</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-xl font-bold text-gray-800">📊 三大财务报表</h2>
          <p className="text-sm text-gray-500 mt-1">按会计期间查询：资产负债表 / 利润表 / 现金流量表（后端基于 account_subject_balance 实时聚合）</p>
        </div>
        {data && <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-sm bg-slate-800 text-white hover:bg-slate-700 transition-colors flex items-center gap-1.5">🖨️ 打印报表</button>}
      </div>
      {/* 打印专用抬头（屏幕上隐藏） */}
      <div className="hidden print:block text-center mb-2">
        <h1 className="text-lg font-bold text-slate-800">ERP 企业管理系统 · {NAMES[stmt]}</h1>
        <p className="text-xs text-slate-500 mt-1">会计期间：{period} · 打印时间：{new Date().toLocaleString('zh-CN')}</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {(Object.keys(NAMES) as Stmt[]).map(k => (
            <button key={k} onClick={()=>{setStmt(k); setData(null);}} className={`px-4 py-2 rounded-lg text-sm ${stmt===k?'bg-blue-600 text-white':'bg-gray-100 text-gray-600'}`}>{NAMES[k]}</button>
          ))}
        </div>
        <div>
          <label className="text-xs text-gray-500">会计期间</label>
          <input type="month" value={period} onChange={e=>setPeriod(e.target.value)} className="ml-2 px-3 py-2 border rounded-lg text-sm"/>
        </div>
        <button onClick={load} disabled={loading} className="px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">{loading?'加载中...':'查询'}</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {data && stmt === 'balance' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border space-y-4">
          <h3 className="font-semibold text-gray-800 text-lg">{NAMES.balance} - {period}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-50 p-4 rounded-lg"><div className="text-xs text-blue-400">资产合计</div><div className="text-xl font-bold text-blue-700">¥{fmt(data.assets)}</div></div>
            <div className="bg-red-50 p-4 rounded-lg"><div className="text-xs text-red-400">负债合计</div><div className="text-xl font-bold text-red-700">¥{fmt(data.liabilities)}</div></div>
            <div className="bg-emerald-50 p-4 rounded-lg"><div className="text-xs text-emerald-400">所有者权益</div><div className="text-xl font-bold text-emerald-700">¥{fmt(data.equity)}</div></div>
            <div className="bg-purple-50 p-4 rounded-lg"><div className="text-xs text-purple-400">负债+权益</div><div className="text-xl font-bold text-purple-700">¥{fmt(data.total_liability_equity)}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left text-xs text-gray-500">科目编码</th><th className="px-3 py-2 text-left text-xs text-gray-500">科目名称</th><th className="px-3 py-2 text-right text-xs text-gray-500">期末余额</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {(data.assetItems || []).map((it:any, i:number) => (
                  <tr key={i}><td className="px-3 py-2">{it.code}</td><td className="px-3 py-2">{it.name}</td><td className="px-3 py-2 text-right font-mono">¥{fmt(it.balance)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && stmt === 'income' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border space-y-4">
          <h3 className="font-semibold text-gray-800 text-lg">{NAMES.income} - {period}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-emerald-50 p-4 rounded-lg"><div className="text-xs">营业收入</div><div className="text-xl font-bold text-emerald-700">¥{fmt(data.revenue)}</div></div>
            <div className="bg-amber-50 p-4 rounded-lg"><div className="text-xs">营业成本</div><div className="text-xl font-bold text-amber-700">¥{fmt(data.cost)}</div></div>
            <div className="bg-blue-50 p-4 rounded-lg"><div className="text-xs">毛利润</div><div className="text-xl font-bold text-blue-700">¥{fmt(data.gross_profit)}</div></div>
            <div className="bg-purple-50 p-4 rounded-lg"><div className="text-xs">净利润</div><div className="text-xl font-bold text-purple-700">¥{fmt(data.net_profit)}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b"><th className="px-3 py-2 text-left text-xs">科目编码</th><th className="px-3 py-2 text-left text-xs">科目名称</th><th className="px-3 py-2 text-right text-xs">借方</th><th className="px-3 py-2 text-right text-xs">贷方</th><th className="px-3 py-2 text-right text-xs">期末余额</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {(data.items || []).map((it:any, i:number) => (
                  <tr key={i}><td className="px-3 py-2">{it.subject_code}</td><td className="px-3 py-2">{it.subject_name}</td><td className="px-3 py-2 text-right font-mono">¥{fmt(it.debit_amount)}</td><td className="px-3 py-2 text-right font-mono">¥{fmt(it.credit_amount)}</td><td className="px-3 py-2 text-right font-mono">¥{fmt(it.end_balance)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && stmt === 'cashflow' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border space-y-4">
          <h3 className="font-semibold text-gray-800 text-lg">{NAMES.cashflow} - {period}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 p-4 rounded-lg"><div className="text-xs">现金流入</div><div className="text-xl font-bold text-emerald-700">¥{fmt(data.cash_in)}</div></div>
            <div className="bg-red-50 p-4 rounded-lg"><div className="text-xs">现金流出</div><div className="text-xl font-bold text-red-700">¥{fmt(data.cash_out)}</div></div>
            <div className="bg-blue-50 p-4 rounded-lg"><div className="text-xs">净现金流</div><div className="text-xl font-bold text-blue-700">¥{fmt(data.net_cash)}</div></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">流入明细</div>
              {(data.inflow_items || []).length === 0 ? <div className="text-xs text-gray-400">暂无</div> :
                <div className="space-y-1">{data.inflow_items.map((it:any,i:number)=><div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-100"><span>{it.name}</span><span className="font-mono">¥{fmt(it.value)}</span></div>)}</div>}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">流出明细</div>
              {(data.outflow_items || []).length === 0 ? <div className="text-xs text-gray-400">暂无</div> :
                <div className="space-y-1">{data.outflow_items.map((it:any,i:number)=><div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-100"><span>{it.name}</span><span className="font-mono">¥{fmt(it.value)}</span></div>)}</div>}
            </div>
          </div>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="bg-white rounded-xl p-12 shadow-sm border text-center text-gray-400">
          <div className="text-4xl mb-3">{PRESETS}</div>
          <p>选择报表类型与期间后点击"查询"</p>
        </div>
      )}
    </div>
  );
}