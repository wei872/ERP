import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';
import { useAuth } from '../context/AuthContext';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const TIERS = [
  { label: '达成率 < 60%', rate: '1.0%' },
  { label: '60% ≤ 达成率 < 80%', rate: '1.5%' },
  { label: '80% ≤ 达成率 < 100%', rate: '2.0%' },
  { label: '达成率 ≥ 100%', rate: '2.5%，且超额部分加计 1%' },
];

/** 销售提成（v5.26）：按目标达成率阶梯计提 → 审核 → 一键同步工资表（叠加奖金列并重算实发） */
export default function CommissionPage() {
  const { currentUser } = useAuth();
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'hr';
  const [period, setPeriod] = useState<string>(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [rows, setRows] = useState<any[]>([]);
  const [loadedPeriod, setLoadedPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (p: string) => {
    setLoading(true); setError('');
    try {
      const r = await bizApi.commissionList(p);
      setRows(r.data?.rows || []);
      setLoadedPeriod(r.data?.period || p);
    } catch (e: any) { setError(e.message || '加载失败'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(period); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doCalc = async () => {
    setCalcBusy(true);
    try {
      const r = await bizApi.commissionCalc(period);
      toastNotify(`提成计算完成（${r.data.period}）：共 ${r.data.persons} 人，重算 ${r.data.calc} 条，跳过已审批/已同步 ${r.data.skipped} 条`);
      await load(period);
    } catch (e: any) { toastNotify('提成计算失败：' + (e.message || ''), 'error'); }
    setCalcBusy(false);
  };
  const doApprove = async (id: number) => {
    try { await bizApi.commissionApprove(id); toastNotify('提成单已审批通过，可同步工资表'); await load(period); }
    catch (e: any) { toastNotify('审批失败：' + (e.message || ''), 'error'); }
  };
  const doSync = async (id: number) => {
    try {
      const r = await bizApi.commissionSync(id);
      toastNotify(`已同步工资表 ${r.data.salary_no}：提成 ¥${money(r.data.amount)} 计入奖金并重算实发`);
      await load(period);
    } catch (e: any) { toastNotify('同步工资失败：' + (e.message || ''), 'error'); }
  };

  const totalCommission = rows.reduce((s, r) => s + (Number(r.commission) || 0), 0);
  const pending = rows.filter(r => r.status === '待审核').length;

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4c1d95, #5b21b6 55%, #7c3aed)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-violet-400/20 blur-2xl"></div>
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">💎 销售提成计算</h2>
            <p className="text-[11px] md:text-xs text-violet-200 mt-1.5">目标达成率阶梯计提 · 审批留痕 · 一键联动工资表（奖金列 + 实发重算）</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-sm text-white focus:outline-none [color-scheme:dark]"/>
            <button onClick={() => load(period)} className="px-4 py-2 rounded-xl bg-white/15 border border-white/20 text-sm hover:bg-white/25 transition-colors">查询</button>
            {canManage && <button onClick={doCalc} disabled={calcBusy} className="px-4 py-2 rounded-xl bg-white text-violet-700 text-sm font-semibold hover:bg-violet-50 transition-colors disabled:opacity-60">{calcBusy ? '计算中…' : '⚡ 计算本月提成'}</button>}
          </div>
        </div>
      </div>

      {/* 阶梯规则 + 汇总 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="erp-card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-2.5">📏 阶梯提成规则</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TIERS.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs">
                <span className="text-slate-600">{t.label}</span>
                <span className="font-bold text-violet-600 tabular-nums shrink-0 ml-3">{t.rate}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">提成 = 实际销售额 × 阶梯率；达成率 ≥100% 时，超出目标部分另按 1% 加计。重算仅覆盖「待审核」单据，已审批/已同步不被影响。</p>
        </div>
        <div className="erp-card p-4 flex flex-col justify-center gap-2">
          <div className="flex items-center justify-between text-xs"><span className="text-slate-500">本期提成单</span><b className="tabular-nums text-slate-800 text-base">{rows.length} 张</b></div>
          <div className="flex items-center justify-between text-xs"><span className="text-slate-500">待审核</span><b className={`tabular-nums text-base ${pending ? 'text-amber-600' : 'text-slate-400'}`}>{pending} 张</b></div>
          <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2"><span className="text-slate-500">提成总额（{loadedPeriod}）</span><b className="tabular-nums text-violet-600 text-base">¥{money(totalCommission)}</b></div>
        </div>
      </div>

      {error && <div className="erp-card p-8 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-sm text-red-500">{error}</p></div>}
      {loading && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">提成单加载中…</p></div>}

      {!loading && rows.length > 0 && (
        <div className="erp-card p-3 md:p-4 overflow-x-auto">
          <table className="erp-table text-xs w-full min-w-[860px]">
            <thead><tr><th className="text-left">提成单号</th><th className="text-left">销售</th><th>目标金额</th><th>实际销售</th><th>达成率</th><th>提成率</th><th>提成金额</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const rate = Number(r.achieve_rate || 0);
                return (
                  <tr key={r.id}>
                    <td className="font-mono whitespace-nowrap">{r.commission_no}</td>
                    <td className="font-medium text-slate-700 whitespace-nowrap">{r.salesperson}</td>
                    <td className="tabular-nums">¥{money(r.target_amount)}</td>
                    <td className="tabular-nums">¥{money(r.actual_amount)}</td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex-1"><div className={`h-full rounded-full ${rate >= 100 ? 'bg-emerald-400' : rate >= 60 ? 'bg-blue-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, rate)}%` }}></div></div>
                        <span className={`tabular-nums font-bold shrink-0 ${rate >= 100 ? 'text-emerald-600' : rate >= 60 ? 'text-blue-600' : 'text-amber-600'}`}>{rate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="tabular-nums text-violet-600 font-medium">{Number(r.rate_pct || 0)}%</td>
                    <td className="tabular-nums font-bold">¥{money(r.commission)}</td>
                    <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${r.status === '待审核' ? 'bg-amber-50 text-amber-600' : r.status === '已通过' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>{r.status}</span></td>
                    <td className="whitespace-nowrap">
                      {canManage && r.status === '待审核' && <button onClick={() => doApprove(r.id)} className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-500">通过</button>}
                      {canManage && r.status === '已通过' && <button onClick={() => doSync(r.id)} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-500">同步工资</button>}
                      {r.status === '已同步工资' && <span className="text-[10px] text-slate-400">{String(r.remark || '').includes('已同步') ? '已入账' : '已完成'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="erp-card p-12 text-center">
          <div className="text-5xl mb-3">💎</div>
          <p className="text-sm text-slate-500 font-medium mb-1">{loadedPeriod} 暂无提成单</p>
          <p className="text-xs text-slate-400">{canManage ? '点击右上角「⚡ 计算本月提成」，按销售目标达成率自动生成阶梯提成' : '管理员/HR 可点击「计算本月提成」生成'}</p>
        </div>
      )}
    </div>
  );
}
