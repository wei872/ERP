import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';

const TYPE_ICON: Record<string, string> = { '采购审批': '🛒', '费用审批': '💸', '请假审批': '🏖️' };
const FILTERS = ['全部', '采购审批', '费用审批', '请假审批'] as const;

/** 移动端审批中心：大按钮卡片式审批，手机上单手完成通过/驳回 */
export default function MobileApprovalPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('全部');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [expanded, setExpanded] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await bizApi.myTasks();
      setTasks(r.data || []);
    } catch (e: any) { toastNotify('待办加载失败：' + (e.message || '')); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const doApprove = async (no: string) => {
    setBusy(no);
    try { await bizApi.approve(no, '同意'); toastNotify('已通过'); await load(); }
    catch (e: any) { toastNotify('通过失败：' + (e.message || '')); }
    setBusy('');
  };
  const doReject = async (no: string) => {
    if (!confirm('确认驳回该审批？')) return;
    setBusy(no);
    try { await bizApi.reject(no, '驳回'); toastNotify('已驳回'); await load(); }
    catch (e: any) { toastNotify('驳回失败：' + (e.message || '')); }
    setBusy('');
  };

  const shown = filter === '全部' ? tasks : tasks.filter(t => t.approval_type === filter);
  const totalAmount = shown.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  return (
    <div className="erp-fade-in p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      {/* 头部 */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
        <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/10 blur-xl"></div>
        <div className="relative">
          <h2 className="text-lg font-bold flex items-center gap-2">📱 移动审批中心</h2>
          <p className="text-xs text-indigo-100 mt-1">
            待办 <b className="text-base tabular-nums">{tasks.length}</b> 条
            {filter !== '全部' && <> · 当前筛选 <b className="tabular-nums">{shown.length}</b> 条 · 涉及金额 <b className="tabular-nums">¥{totalAmount.toLocaleString()}</b></>}
          </p>
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
            {f}{f !== '全部' && <span className="ml-1 opacity-70">{tasks.filter(t => t.approval_type === f).length}</span>}
          </button>
        ))}
        <button onClick={load} disabled={loading} className="ml-auto px-3 py-2 rounded-full text-xs bg-white border border-slate-200 text-slate-500 shrink-0">↻</button>
      </div>

      {/* 任务卡片 */}
      {loading && <div className="text-center py-10 text-sm text-slate-400"><div className="erp-spinner mx-auto mb-2"></div>加载中...</div>}
      {!loading && shown.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 py-14 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-slate-500 text-sm">太棒了，没有待办审批</p>
        </div>
      )}
      {shown.map(t => (
        <div key={t.task_no} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-base shrink-0">{TYPE_ICON[t.approval_type] || '🔁'}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{t.approval_type} · {t.task_name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {t.applicant}{t.department ? ` · ${t.department}` : ''} · {String(t.create_date || '').slice(0, 10)}
                  {t.ref_no && <> · <span className="font-mono">{t.ref_no}</span></>}
                </p>
              </div>
            </div>
            {Number(t.amount) > 0 && <span className="text-sm font-bold text-indigo-600 tabular-nums shrink-0">¥{Number(t.amount).toLocaleString()}</span>}
          </div>
          {t.remark && t.remark !== '-' && (
            <button onClick={() => setExpanded(expanded === t.task_no ? '' : t.task_no)} className="w-full text-left">
              <p className={`text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 ${expanded === t.task_no ? '' : 'truncate'}`}>{t.remark}</p>
            </button>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => doReject(t.instance_no)} disabled={busy === t.instance_no}
              className="py-3 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 active:scale-[0.98] transition-all disabled:opacity-50">✕ 驳回</button>
            <button onClick={() => doApprove(t.instance_no)} disabled={busy === t.instance_no}
              className="py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow-md hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50">✓ 通过</button>
          </div>
        </div>
      ))}
    </div>
  );
}
