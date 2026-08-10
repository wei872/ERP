import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { useAuth } from '../context/AuthContext';

type Task = {
  task_no: string; instance_no: string; task_name: string; assignee: string;
  create_date: string; task_status: string; approval_type: string; applicant: string;
  department: string; amount: number; ref_no: string; remark: string;
};

const APPROVAL_TYPES = ['采购审批', '费用审批', '请假审批'] as const;

function fmt(v: unknown): string { return v == null || v === '' ? '-' : String(v); }
function money(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? `¥${n.toLocaleString()}` : '-'; }

export default function WorkflowPage() {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<'tasks' | 'submit'>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [comment, setComment] = useState('');

  // 提交审批表单
  const [submitType, setSubmitType] = useState<typeof APPROVAL_TYPES[number]>('采购审批');
  const [refNo, setRefNo] = useState('');
  const [amount, setAmount] = useState(0);
  const [remark, setRemark] = useState('');

  const toastFn = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); }, []);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const r = await bizApi.myTasks(); setTasks(r.data || []); }
    catch (e: any) { setError(e.message || '加载失败'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (no: string) => {
    try { const r = await bizApi.approvalDetail(no); setDetail(r.data); setComment(''); }
    catch (e: any) { toastFn(e.message || '加载详情失败'); }
  };

  const doApprove = async () => {
    if (!detail?.main) return;
    try { await bizApi.approve(detail.main.approval_no, comment); toastFn('已通过'); setDetail(null); load(); }
    catch (e: any) { toastFn('通过失败: ' + e.message); }
  };
  const doReject = async () => {
    if (!detail?.main) return;
    if (!confirm('确认驳回该审批？')) return;
    try { await bizApi.reject(detail.main.approval_no, comment); toastFn('已驳回'); setDetail(null); load(); }
    catch (e: any) { toastFn('驳回失败: ' + e.message); }
  };

  const doSubmit = async () => {
    if (!currentUser) return;
    if (!submitType) { toastFn('请选择审批类型'); return; }
    if (submitType !== '请假审批' && !refNo && amount <= 0) { toastFn('请填写关联单号或金额'); return; }
    try {
      await bizApi.submitApproval({
        type: submitType,
        dept: currentUser.department || '',
        refNo,
        amount,
        remark,
      });
      toastFn('已提交审批');
      setRefNo(''); setAmount(0); setRemark('');
      setTab('tasks'); load();
    } catch (e: any) { toastFn('提交失败: ' + e.message); }
  };

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1400px] mx-auto">
      {toast && <div className="erp-toast">{toast}</div>}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🔁 工作流审批</h2>
          <p className="text-sm text-gray-500 mt-1">多级审批引擎 · 节点序列：采购审批3级 / 费用审批2级 / 请假审批2级</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('tasks')} className={`px-4 py-2 rounded-lg text-sm ${tab==='tasks'?'bg-blue-600 text-white':'bg-white border'}`}>我的待办 ({tasks.length})</button>
          <button onClick={() => setTab('submit')} className={`px-4 py-2 rounded-lg text-sm ${tab==='submit'?'bg-blue-600 text-white':'bg-white border'}`}>提交新审批</button>
          <button onClick={load} className="px-4 py-2 rounded-lg text-sm bg-white border">↻ 刷新</button>
        </div>
      </div>

      {tab === 'tasks' && (
        <div className="space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
          {loading && <div className="text-center py-8 text-gray-400">加载中...</div>}
          {!loading && tasks.length === 0 && (
            <div className="bg-white rounded-xl p-12 shadow-sm border text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-gray-500">暂无待办任务</p>
              <p className="text-xs text-gray-400 mt-1">admin 可见全部待处理节点；其他角色按 assignee 匹配</p>
            </div>
          )}
          {tasks.map(t => (
            <div key={t.task_no} className="bg-white rounded-xl p-5 shadow-sm border hover:shadow-md transition-all">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center text-white text-lg font-bold">{(t.applicant||'?')[0]}</div>
                  <div>
                    <div className="font-semibold text-gray-800">{t.approval_type} · {t.task_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      申请人 {fmt(t.applicant)} · 部门 {fmt(t.department)} · 提交日 {fmt(t.create_date)}
                      {t.ref_no && <span className="ml-2">关联单 <span className="text-blue-600">{t.ref_no}</span></span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {Number(t.amount) > 0 && <span className="text-sm font-bold text-emerald-600">{money(t.amount)}</span>}
                  <span className="px-2.5 py-1 rounded-full text-xs bg-amber-100 text-amber-700">{t.task_status}</span>
                  <button onClick={() => openDetail(t.instance_no)} className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg">详情</button>
                </div>
              </div>
              {t.remark && t.remark !== '-' && <div className="mt-3 text-xs text-gray-400 border-l-2 border-gray-200 pl-3">{t.remark}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'submit' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border max-w-2xl mx-auto space-y-4">
          <div>
            <label className="text-xs text-gray-500">审批类型 *</label>
            <div className="flex gap-2 mt-1">
              {APPROVAL_TYPES.map(t => (
                <button key={t} onClick={() => setSubmitType(t)} className={`px-4 py-2 rounded-lg text-sm border ${submitType===t?'bg-blue-600 text-white border-blue-600':'bg-white'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">关联单号 {submitType==='请假审批'?'(可空)':'(采购必填)'}</label>
              <input value={refNo} onChange={e=>setRefNo(e.target.value)} placeholder={submitType==='采购审批'?'如 PO-xxx 采购单号':'如 EXP-xxx'} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/>
            </div>
            <div>
              <label className="text-xs text-gray-500">金额</label>
              <input type="number" value={amount} onChange={e=>setAmount(Number(e.target.value)||0)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">备注/事由</label>
            <textarea value={remark} onChange={e=>setRemark(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" placeholder="费用事由 / 请假原因等"/>
          </div>
          <div className="flex justify-end">
            <button onClick={doSubmit} className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm">提交审批</button>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-blue-50 flex items-center justify-between">
              <h3 className="font-bold">审批详情 - {detail.main?.approval_no}</h3>
              <button onClick={()=>setDetail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-xs text-gray-400">类型</div><div className="font-medium">{fmt(detail.main?.approval_type)}</div></div>
                <div><div className="text-xs text-gray-400">申请人</div><div className="font-medium">{fmt(detail.main?.applicant)}</div></div>
                <div><div className="text-xs text-gray-400">部门</div><div className="font-medium">{fmt(detail.main?.department)}</div></div>
                <div><div className="text-xs text-gray-400">金额</div><div className="font-medium text-emerald-600">{money(detail.main?.amount)}</div></div>
              </div>
              {detail.main?.ref_no && <div className="text-sm">关联单号：<span className="text-blue-600 font-medium">{detail.main.ref_no}</span></div>}
              {detail.main?.remark && <div className="text-sm bg-gray-50 p-3 rounded-lg">{detail.main.remark}</div>}

              <div>
                <div className="text-xs font-semibold text-gray-500 mb-2">审批节点</div>
                <div className="space-y-2">
                  {(detail.tasks||[]).map((t:any, i:number) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${t.task_status==='已通过'?'bg-emerald-50 border-emerald-200':t.task_status==='待处理'?'bg-amber-50 border-amber-200':t.task_status==='已取消'?'bg-red-50 border-red-200':'bg-gray-50 border-gray-200'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${t.task_status==='已通过'?'bg-emerald-500 text-white':t.task_status==='待处理'?'bg-amber-500 text-white':'bg-gray-300 text-gray-600'}`}>{i+1}</div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{t.task_name}</div>
                        <div className="text-xs text-gray-400">处理人 {fmt(t.assignee)} · 完成日 {fmt(t.complete_date)}</div>
                      </div>
                      <span className="text-xs">{t.task_status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {detail.logs?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-2">流转日志</div>
                  <div className="space-y-1 text-xs">
                    {detail.logs.map((l:any, i:number) => (
                      <div key={i} className="flex gap-3 py-1 border-b border-gray-100">
                        <span className="text-gray-400 w-28 shrink-0">{fmt(l.action_date)}</span>
                        <span className="font-medium w-24 shrink-0">{l.operator}</span>
                        <span className="text-gray-600">{l.action}</span>
                        {l.comment && <span className="text-gray-400">/ {l.comment}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500">审批意见</label>
                <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" placeholder="审批意见（可选）"/>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-gray-50">
              <button onClick={()=>setDetail(null)} className="px-4 py-2 text-sm text-gray-600">关闭</button>
              <button onClick={doReject} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg">驳回</button>
              <button onClick={doApprove} className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg">通过</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
