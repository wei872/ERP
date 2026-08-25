import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { bizApi } from '../api';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

function Stat({ icon, label, value, hint, tone }: { icon: string; label: string; value: string; hint?: string; tone: string }) {
  return (
    <div className="erp-card p-4 flex items-center gap-3.5">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
        <p className="text-lg font-bold text-slate-800 tabular-nums leading-tight truncate">{value}</p>
        {hint && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
}

/** 经营日报：今日业务一屏汇总（今日发生 + 本月累计 + 风险提醒 + 最近动态） */
export default function DailyReportPage() {
  const [data, setData] = useState<any>(null);
  const [targetData, setTargetData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    bizApi.dailyReport().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败'));
    bizApi.targetProgress().then(r => setTargetData(r.data)).catch(() => {});
  }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">日报生成中...</p></div>;

  const t = data.today || {};
  const m = data.month || {};
  const a = data.alerts || {};
  const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* 抬头 */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a, #1e1b4b 60%, #312e81)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-indigo-500/20 blur-2xl"></div>
        <div className="relative flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">📰 经营日报</h2>
            <p className="text-xs text-indigo-200 mt-1.5">{todayStr} · 业务发生实时汇总</p>
          </div>
          <button onClick={() => window.print()} className="no-print px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-sm hover:bg-white/20 transition-colors">🖨️ 打印日报</button>
        </div>
      </div>

      {/* 今日发生 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500"></span>今日发生</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat icon="💰" label="今日销售" value={`${Number(t.salesCount || 0)} 单`} hint={`金额 ¥${money(t.salesAmount)}`} tone="bg-blue-50 text-blue-600" />
          <Stat icon="🛒" label="今日采购" value={`${Number(t.purchaseCount || 0)} 单`} hint={`金额 ¥${money(t.purchaseAmount)}`} tone="bg-cyan-50 text-cyan-600" />
          <Stat icon="📥" label="今日入库" value={`${Number(t.stockIn || 0)} 单`} hint="采购入库/生产入库/调拨" tone="bg-emerald-50 text-emerald-600" />
          <Stat icon="📤" label="今日出库" value={`${Number(t.stockOut || 0)} 单`} hint="销售出库/领料/调拨" tone="bg-amber-50 text-amber-600" />
          <Stat icon="📒" label="今日凭证" value={`${Number(t.vouchers || 0)} 张`} hint="自动联动 + 手工录入" tone="bg-violet-50 text-violet-600" />
          <Stat icon="🔁" label="今日提交审批" value={`${Number(t.approvals || 0)} 条`} tone="bg-indigo-50 text-indigo-600" />
          <Stat icon="✅" label="今日成功登录" value={`${Number(t.logins || 0)} 次`} tone="bg-teal-50 text-teal-600" />
          <Stat icon="🚫" label="今日登录失败" value={`${Number(t.loginFails || 0)} 次`} hint="含防爆破锁定记录" tone="bg-red-50 text-red-500" />
        </div>
      </div>

      {/* 销售目标达成率 */}
      {targetData && (targetData.rows || []).length > 0 && (() => {
        const tt = targetData.totals || {};
        const totRate = Number(tt.rate) || 0;
        return (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-500 to-teal-500"></span>销售目标达成率（{targetData.month}）</h3>
            <div className="erp-card p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-500">团队总达成</span>
                  <span className="tabular-nums font-semibold text-slate-700">¥{money(tt.actual)} / ¥{money(tt.target)}　<b className={totRate >= 100 ? 'text-emerald-600' : totRate >= 60 ? 'text-blue-600' : 'text-amber-600'}>{totRate.toFixed(1)}%</b></span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${totRate >= 100 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-indigo-400 to-violet-500'}`} style={{ width: `${Math.min(100, totRate)}%` }}></div>
                </div>
              </div>
              {/* 目标-实际对比图 */}
              {(targetData.rows || []).some((r: any) => Number(r.target) > 0) && (
                <div className="pt-1">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={(targetData.rows || []).filter((r: any) => Number(r.target) > 0).map((r: any) => ({ name: r.salesperson, 目标: Number(r.target) || 0, 实际: Number(r.actual) || 0 }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v)} />
                      <Tooltip formatter={(v: any, n: any) => [`¥${Number(v).toLocaleString()}`, n]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="目标" fill="#c7d2fe" radius={[4, 4, 0, 0]} maxBarSize={34} />
                      <Bar dataKey="实际" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={34} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {(targetData.rows || []).map((r: any) => {
                  const rate = Number(r.rate) || 0;
                  const hasTarget = Number(r.target) > 0;
                  return (
                    <div key={r.salesperson} className="rounded-xl border border-slate-100 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">{r.salesperson}</span>
                        {hasTarget
                          ? <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${rate >= 100 ? 'bg-emerald-50 text-emerald-600' : rate >= 60 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{rate.toFixed(1)}%</span>
                          : <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">未设目标</span>}
                      </div>
                      {hasTarget && (
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                          <div className={`h-full rounded-full ${rate >= 100 ? 'bg-emerald-400' : rate >= 60 ? 'bg-blue-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, rate)}%` }}></div>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400 tabular-nums">实际 ¥{money(r.actual)}{hasTarget ? ` / 目标 ¥${money(r.target)}` : ''} · {Number(r.count || 0)} 单</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 本月累计 + 风险提醒 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erp-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">📅 本月累计</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <span className="text-xs text-slate-500">销售额</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">¥{money(m.salesAmount)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-50">
              <span className="text-xs text-slate-500">采购额</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">¥{money(m.purchaseAmount)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-slate-500">凭证数量</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{Number(m.vouchers || 0)} 张</span>
            </div>
          </div>
        </div>
        <div className="erp-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">⚠️ 风险与待办提醒</h3>
          <div className="space-y-2.5">
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${Number(a.lowStock) > 0 ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
              <span className="text-xs text-slate-600">📦 库存预警物料</span>
              <span className={`text-sm font-bold tabular-nums ${Number(a.lowStock) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{Number(a.lowStock || 0)} 项</span>
            </div>
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${Number(a.overdueReceivable) > 0 ? 'bg-red-50/60 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
              <span className="text-xs text-slate-600">💰 应收逾期金额</span>
              <span className={`text-sm font-bold tabular-nums ${Number(a.overdueReceivable) > 0 ? 'text-red-500' : 'text-slate-400'}`}>¥{money(a.overdueReceivable)}</span>
            </div>
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${Number(a.overduePayable) > 0 ? 'bg-orange-50/60 border-orange-200' : 'bg-slate-50 border-slate-100'}`}>
              <span className="text-xs text-slate-600">🧾 应付逾期金额</span>
              <span className={`text-sm font-bold tabular-nums ${Number(a.overduePayable) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>¥{money(a.overduePayable)}</span>
            </div>
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${Number(a.pendingApprovals) > 0 ? 'bg-violet-50/60 border-violet-200' : 'bg-slate-50 border-slate-100'}`}>
              <span className="text-xs text-slate-600">🔁 待处理审批</span>
              <span className={`text-sm font-bold tabular-nums ${Number(a.pendingApprovals) > 0 ? 'text-violet-600' : 'text-slate-400'}`}>{Number(a.pendingApprovals || 0)} 条</span>
            </div>
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${Number(a.highCreditUsage) > 0 ? 'bg-orange-50/60 border-orange-200' : 'bg-slate-50 border-slate-100'}`}>
              <span className="text-xs text-slate-600">💳 客户信用占用 ≥90%</span>
              <span className={`text-sm font-bold tabular-nums ${Number(a.highCreditUsage) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>{Number(a.highCreditUsage || 0)} 家</span>
            </div>
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${Number(a.expiredContracts) > 0 ? 'bg-red-50/60 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
              <span className="text-xs text-slate-600">📄 合同已过期未完结</span>
              <span className={`text-sm font-bold tabular-nums ${Number(a.expiredContracts) > 0 ? 'text-red-500' : 'text-slate-400'}`}>{Number(a.expiredContracts || 0)} 份</span>
            </div>
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${Number(a.expiringContracts) > 0 ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-100'}`}>
              <span className="text-xs text-slate-600">📄 合同 30 天内到期</span>
              <span className={`text-sm font-bold tabular-nums ${Number(a.expiringContracts) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{Number(a.expiringContracts || 0)} 份</span>
            </div>
            {(data.expiringContractList || []).length > 0 && (
              <div className="mt-1 space-y-1.5">
                {(data.expiringContractList || []).map((c: any) => {
                  const end = String(c.end_date || '').slice(0, 10);
                  const days = Math.ceil((new Date(end.replace(/-/g, '/')).getTime() - Date.now()) / 86400000);
                  return (
                    <div key={c.id} className="flex items-center justify-between text-[11px] bg-white border border-slate-100 rounded-lg px-2.5 py-1.5">
                      <span className="font-mono text-indigo-600 shrink-0">{c.contract_no}</span>
                      <span className="text-slate-600 truncate mx-2">{c.contract_name}</span>
                      <span className={`shrink-0 font-medium ${days < 0 ? 'text-red-500' : days <= 10 ? 'text-amber-600' : 'text-slate-500'}`}>{days < 0 ? `已过期 ${-days} 天` : `${days} 天后到期`}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 最近动态 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="erp-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">🧾 最近销售单</h3>
          {(data.recentSales || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">暂无销售单</p> : (
            <div className="space-y-2">
              {(data.recentSales || []).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                  <span className="font-mono text-indigo-600">{s.sales_no}</span>
                  <span className="text-slate-600 truncate max-w-[30%]">{s.customer_name}</span>
                  <span className="tabular-nums font-medium text-slate-700">¥{Number(s.total_amount || 0).toLocaleString()}</span>
                  <span className="text-slate-400">{s.sales_status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="erp-card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">🔁 最近审批</h3>
          {(data.recentApprovals || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">暂无审批</p> : (
            <div className="space-y-2">
              {(data.recentApprovals || []).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                  <span className="font-mono text-indigo-600">{s.approval_no}</span>
                  <span className="text-slate-600">{s.approval_type}</span>
                  <span className="text-slate-500">{s.applicant}</span>
                  <span className="tabular-nums text-slate-700">¥{Number(s.amount || 0).toLocaleString()}</span>
                  <span className={`px-1.5 py-0.5 rounded ${s.approval_status === '已通过' ? 'bg-emerald-50 text-emerald-600' : s.approval_status === '已驳回' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>{s.approval_status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
