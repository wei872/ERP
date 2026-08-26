import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { toastNotify } from '../utils/toast';

const TYPE_LABELS: Record<string, string> = { daily: '经营日报', weekly: '经营周报', finance: '财务报表（月度）', stocktake: '盘点盈亏分析', workorder: '工单成本报告', aging: '应收账龄报告', monthly: '经营月报' };
const STATUS_CLS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-500', sent: 'bg-emerald-50 text-emerald-600',
  simulated: 'bg-blue-50 text-blue-600', failed: 'bg-red-50 text-red-500',
};

/** 报表邮件订阅：订阅管理 + 发件箱（未配置邮件服务时模拟生成，配置后真实投递） */
export default function ReportSubscriptionPage() {
  const { currentUser } = useAuth();
  const canViewOutbox = currentUser?.role === 'admin' || currentUser?.role === 'accounting';
  const [subs, setSubs] = useState<any[]>([]);
  const [outbox, setOutbox] = useState<any[]>([]);
  const [email, setEmail] = useState(currentUser?.email || '');
  const [type, setType] = useState('daily');
  const [freq, setFreq] = useState('daily');

  const loadSubs = useCallback(async () => {
    try { const r = await bizApi.reportSubList(); setSubs(r.data || []); } catch { /* ignore */ }
  }, []);
  const loadOutbox = useCallback(async () => {
    if (!canViewOutbox) return;
    try { const r = await bizApi.reportOutbox(); setOutbox(r.data || []); } catch { /* ignore */ }
  }, [canViewOutbox]);

  useEffect(() => { loadSubs(); loadOutbox(); }, [loadSubs, loadOutbox]);

  const doSubscribe = async () => {
    try {
      const r = await bizApi.reportSubSave({ email, report_type: type, frequency: freq });
      toastNotify(String((r as any).data || '订阅成功'));
      loadSubs();
    } catch (e: any) { toastNotify('订阅失败：' + (e.message || '')); }
  };

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1100px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">📮 报表邮件订阅</h2>
        <p className="text-sm text-slate-400 mt-1">订阅后系统按计划自动生成报表并投递；未配置邮件服务时进入发件箱标记"模拟"，配置后可重发真实投递</p>
      </div>

      {/* 订阅表单 */}
      <div className="erp-card p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">➕ 新增订阅</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">收件邮箱 *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="erp-input w-56" />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">报表类型</label>
            <select value={type} onChange={e => setType(e.target.value)} className="erp-input w-44">
              <option value="daily">经营日报</option>
              <option value="weekly">经营周报</option>
              <option value="finance">财务报表（月度）</option>
              <option value="stocktake">盘点盈亏分析</option>
              <option value="workorder">工单成本报告</option>
              <option value="aging">应收账龄报告</option>
              <option value="monthly">经营月报</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">频率</label>
            <select value={freq} onChange={e => setFreq(e.target.value)} className="erp-input w-28">
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
            </select>
          </div>
          <button onClick={doSubscribe} className="erp-btn erp-btn-primary mb-0.5">订阅</button>
        </div>
      </div>

      {/* 我的订阅 */}
      <div className="erp-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">📋 我的订阅</h3></div>
        {subs.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-10">暂无订阅 —— 在上方添加报表订阅</p>
        ) : (
          <table className="erp-table">
            <thead><tr><th>报表类型</th><th>收件邮箱</th><th>频率</th><th>状态</th><th>上次发送</th><th className="text-center">操作</th></tr></thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap font-medium text-slate-700">{TYPE_LABELS[s.report_type] || s.report_type}</td>
                  <td className="whitespace-nowrap text-slate-600">{s.email}</td>
                  <td className="whitespace-nowrap text-slate-500">{s.frequency === 'weekly' ? '每周' : '每天'}</td>
                  <td><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${Number(s.enabled) ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{Number(s.enabled) ? '启用' : '停用'}</span></td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{s.last_sent_at ? String(s.last_sent_at).replace('T', ' ').slice(0, 16) : '—'}</td>
                  <td className="text-center whitespace-nowrap">
                    <button onClick={async () => { await bizApi.reportSubToggle(Number(s.id)); loadSubs(); }} className="px-2 py-1 text-[11px] text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-md mr-1.5">{Number(s.enabled) ? '停用' : '启用'}</button>
                    <button onClick={async () => { if (confirm('退订该报表？')) { await bizApi.reportSubDelete(Number(s.id)); toastNotify('已退订'); loadSubs(); } }} className="px-2 py-1 text-[11px] text-red-500 bg-red-50 hover:bg-red-100 rounded-md">退订</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 发件箱 */}
      {canViewOutbox && (
        <div className="erp-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">📤 发件箱（最近 50 条）</h3>
            <button onClick={loadOutbox} className="text-xs text-slate-400 hover:text-indigo-600">↻ 刷新</button>
          </div>
          {outbox.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-10">发件箱为空 —— 订阅到期后自动进入</p>
          ) : (
            <table className="erp-table">
              <thead><tr><th>主题</th><th>收件人</th><th>状态</th><th>生成时间</th><th>备注</th><th className="text-center">操作</th></tr></thead>
              <tbody>
                {outbox.map(o => (
                  <tr key={o.id}>
                    <td className="max-w-[260px] truncate text-slate-700" title={o.subject}>{o.subject}</td>
                    <td className="whitespace-nowrap text-slate-600">{o.email}</td>
                    <td><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CLS[o.status] || 'bg-slate-100 text-slate-500'}`}>{o.status === 'sent' ? '已发送' : o.status === 'simulated' ? '模拟' : o.status === 'failed' ? '失败' : '待发送'}</span></td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{String(o.created_at || '').replace('T', ' ').slice(0, 16)}</td>
                    <td className="max-w-[180px] truncate text-[11px] text-slate-400" title={o.error_msg || ''}>{o.error_msg || '—'}</td>
                    <td className="text-center whitespace-nowrap">
                      {(o.status === 'simulated' || o.status === 'failed' || o.status === 'pending') && (
                        <button onClick={async () => { const r = await bizApi.reportOutboxSend(Number(o.id)); toastNotify(String((r as any).data || '')); loadOutbox(); }} className="px-2 py-1 text-[11px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md">重发</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
