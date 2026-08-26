import { useEffect, useState } from 'react';
import { bizApi } from '../api';

/** 审批时效报表（v5.32）：节点耗时统计 + 超 48 小时未处理任务红色预警 */
export default function ApprovalEfficiencyPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => { bizApi.approvalEfficiency().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败')); }, []);

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">审批时效统计中…</p></div>;

  const overdue = Number(data.pending_overdue || 0);

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1200px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #581c87, #7e22ce 55%, #a855f7)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-purple-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">⏱️ 审批时效报表</h2>
          <p className="text-[11px] md:text-xs text-purple-200 mt-1.5">流程节点耗时统计 · 超 48 小时未处理任务红色预警（同步进入仪表盘待办）</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="erp-card p-4 text-center"><p className="text-[10px] text-slate-400 mb-0.5">待处理任务</p><p className="text-xl font-bold tabular-nums text-slate-800">{Number(data.pending || 0)}</p></div>
        <div className={`erp-card p-4 text-center ${overdue ? 'ring-1 ring-red-300' : ''}`}><p className="text-[10px] text-slate-400 mb-0.5">超时未处理（&gt;48h）</p><p className={`text-xl font-bold tabular-nums ${overdue ? 'text-red-500' : 'text-emerald-600'}`}>{overdue}</p></div>
        <div className="erp-card p-4 text-center"><p className="text-[10px] text-slate-400 mb-0.5">平均处理耗时（90天）</p><p className="text-xl font-bold tabular-nums text-slate-800">{Number(data.avg_days_90d || 0).toFixed(1)} 天</p></div>
      </div>

      {/* 超时任务清单 */}
      <div className={`erp-card p-4 md:p-5 ${overdue ? 'border-red-200' : ''}`}>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">🚨 超时未处理任务{overdue > 0 && <span className="ml-2 text-[11px] font-normal text-red-500">请尽快处理，避免阻塞业务流程</span>}</h3>
        {(data.overdueList || []).length === 0 ? <p className="text-xs text-slate-400 text-center py-6">🎉 没有超过 48 小时未处理的任务</p> : (
          <div className="overflow-x-auto">
            <table className="erp-table text-xs w-full min-w-[720px]">
              <thead><tr><th className="text-left">实例单号</th><th className="text-left">当前节点</th><th className="text-left">申请人</th><th>处理人</th><th>创建日期</th><th>已等待</th></tr></thead>
              <tbody>
                {(data.overdueList || []).map((t: any) => (
                  <tr key={t.task_no} className="bg-red-50/40">
                    <td className="text-left font-mono text-indigo-600 whitespace-nowrap">{t.instance_no}</td>
                    <td className="text-left font-medium text-slate-700 whitespace-nowrap">{t.task_name}</td>
                    <td className="whitespace-nowrap">{t.applicant || '—'}</td>
                    <td className="whitespace-nowrap"><span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">{t.assignee}</span></td>
                    <td className="tabular-nums whitespace-nowrap">{String(t.create_date || '').slice(0, 10)}</td>
                    <td><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse whitespace-nowrap">{Number(t.waiting_days || 0)} 天</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 节点时效统计 */}
      <div className="erp-card p-4 md:p-5 overflow-x-auto">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">📊 节点时效统计（按超时数排序）</h3>
        <table className="erp-table text-xs w-full min-w-[720px]">
          <thead><tr><th className="text-left">审批节点</th><th>任务总数</th><th>待处理</th><th>超时待处理</th><th>平均耗时（天）</th><th>时效水位</th></tr></thead>
          <tbody>
            {(data.byTask || []).map((t: any) => {
              const avg = Number(t.avg_days || 0);
              const od = Number(t.overdue || 0);
              return (
                <tr key={t.task_name}>
                  <td className="text-left font-medium text-slate-700 whitespace-nowrap">{t.task_name}</td>
                  <td className="tabular-nums text-center">{Number(t.total || 0)}</td>
                  <td className="tabular-nums text-center">{Number(t.pending || 0)}</td>
                  <td className="tabular-nums text-center">{od > 0 ? <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">{od}</span> : <span className="text-slate-300">0</span>}</td>
                  <td className="tabular-nums text-center">{avg.toFixed(1)}</td>
                  <td className="min-w-[120px]">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${avg <= 1 ? 'bg-emerald-400' : avg <= 3 ? 'bg-blue-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, (avg / 5) * 100)}%` }}></div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="erp-card p-4 text-[11px] text-slate-500 space-y-1">
        <p>📏 口径说明：超时 = 任务创建后超过 48 小时仍为「待处理」；平均耗时 = 近 90 天已完成任务的创建→完成天数均值。</p>
        <p>⏰ 仪表盘待办中心同步显示超时任务数（铃铛角标），处理入口在「工作流审批」页。</p>
      </div>
    </div>
  );
}
