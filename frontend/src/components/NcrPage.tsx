import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';
import { useAuth } from '../context/AuthContext';

const SEV_STYLE: Record<string, string> = {
  '轻微': 'bg-slate-100 text-slate-500', '一般': 'bg-blue-50 text-blue-600',
  '严重': 'bg-amber-50 text-amber-600', '致命': 'bg-red-50 text-red-600',
};
const ST_STYLE: Record<string, string> = {
  '待处置': 'bg-amber-50 text-amber-600 border-amber-200', '处置中': 'bg-blue-50 text-blue-600 border-blue-200',
  '待复检': 'bg-violet-50 text-violet-600 border-violet-200', '已关闭': 'bg-emerald-50 text-emerald-600 border-emerald-200',
};
const FLOW = ['待处置', '处置中', '待复检', '已关闭'];

function Stepper({ status, handling }: { status: string; handling?: string }) {
  // 让步接收：待处置 → 已关闭（跳过复检）
  const steps = handling === '让步接收' ? ['待处置', '已关闭'] : FLOW;
  const idx = steps.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${i < idx ? 'bg-emerald-100 text-emerald-600' : i === idx ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-400'}`}>{s}</span>
          {i < steps.length - 1 && <span className={`text-[8px] ${i < idx ? 'text-emerald-400' : 'text-slate-300'}`}>→</span>}
        </div>
      ))}
    </div>
  );
}

/** 质量异常闭环 NCR（v5.27）：发起 → 处置 → 复检 → 关闭，联动批次冻结/报废出库 */
export default function NcrPage() {
  const { currentUser } = useAuth();
  const canManage = ['admin', 'production', 'warehouse'].includes(currentUser?.role || '');
  const canRecheck = ['admin', 'production'].includes(currentUser?.role || '');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('全部');
  // 发起表单
  const [showCreate, setShowCreate] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fSource, setFSource] = useState('过程检验');
  const [fCode, setFCode] = useState('');
  const [fBatch, setFBatch] = useState('');
  const [fQty, setFQty] = useState<number>(1);
  const [fSev, setFSev] = useState('一般');
  const [fFreeze, setFFreeze] = useState(false);
  const [fRemark, setFRemark] = useState('');
  // 处置/复检弹窗
  const [handleRow, setHandleRow] = useState<any>(null);
  const [hMethod, setHMethod] = useState('返工');
  const [hNote, setHNote] = useState('');
  const [hWh, setHWh] = useState('默认仓');
  const [recheckRow, setRecheckRow] = useState<any>(null);
  const [rNote, setRNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError('');
    bizApi.ncrList().then(r => setRows(r.data?.rows || [])).catch(e => setError(e.message || '加载失败')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const doCreate = async () => {
    if (!fTitle.trim() || !fCode.trim()) { toastNotify('异常标题与商品编码必填', 'warn'); return; }
    setBusy(true);
    try {
      const r = await bizApi.ncrCreate({ title: fTitle.trim(), source: fSource, product_code: fCode.trim(), batch_no: fBatch.trim(), qty: fQty, severity: fSev, freeze: fFreeze, remark: fRemark });
      toastNotify(`质量异常单 ${r.data.ncr_no} 已发起${r.data.frozen ? '，关联批次已冻结（阻断领料/出库）' : ''}`);
      setShowCreate(false); setFTitle(''); setFCode(''); setFBatch(''); setFQty(1); setFRemark(''); setFFreeze(false);
      load();
    } catch (e: any) { toastNotify('发起失败：' + (e.message || ''), 'error'); }
    setBusy(false);
  };
  const doHandle = async () => {
    setBusy(true);
    try {
      const r = await bizApi.ncrHandle(handleRow.id, { handling: hMethod, handle_note: hNote, warehouse: hWh });
      toastNotify(String(r.data));
      setHandleRow(null); setHNote('');
      load();
    } catch (e: any) { toastNotify('处置失败：' + (e.message || ''), 'error'); }
    setBusy(false);
  };
  const doRecheck = async (result: string) => {
    setBusy(true);
    try {
      const r = await bizApi.ncrRecheck(recheckRow.id, { result, recheck_note: rNote });
      toastNotify(String(r.data));
      setRecheckRow(null); setRNote('');
      load();
    } catch (e: any) { toastNotify('复检失败：' + (e.message || ''), 'error'); }
    setBusy(false);
  };

  const counts = { '待处置': 0, '处置中': 0, '待复检': 0, '已关闭': 0 } as Record<string, number>;
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const shown = rows.filter(r => filter === '全部' || r.status === filter);

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7f1d1d, #991b1b 55%, #dc2626)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-red-400/20 blur-2xl"></div>
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">🚨 质量异常闭环（NCR）</h2>
            <p className="text-[11px] md:text-xs text-red-100 mt-1.5">发起 → 处置 → 复检 → 关闭全流程 · 批次冻结 / 报废出库自动联动 · 单据号全程可追溯</p>
          </div>
          {canManage && <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl bg-white text-red-700 text-sm font-semibold hover:bg-red-50 transition-colors shrink-0">＋ 发起质量异常</button>}
        </div>
      </div>

      {/* 状态卡 + 筛选 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['待处置', '处置中', '待复检', '已关闭'] as const).map(s => (
          <button key={s} onClick={() => setFilter(filter === s ? '全部' : s)} className={`erp-card p-3.5 text-left transition-all ${filter === s ? 'ring-2 ring-indigo-400' : 'hover:shadow-md'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${ST_STYLE[s]}`}>{s}</span>
              <span className="text-[10px] text-slate-400">{filter === s ? '点击取消筛选' : '点击筛选'}</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-slate-800">{counts[s] || 0} <span className="text-[11px] font-normal text-slate-400">单</span></p>
          </button>
        ))}
      </div>

      {error && <div className="erp-card p-8 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-sm text-red-500">{error}</p></div>}
      {loading && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">加载中…</p></div>}

      {!loading && shown.length > 0 && (
        <div className="erp-card p-3 md:p-4 overflow-x-auto">
          <table className="erp-table text-xs w-full min-w-[980px]">
            <thead><tr><th className="text-left">异常单</th><th className="text-left">商品 / 批次</th><th>数量</th><th>严重度</th><th>来源</th><th>流程状态</th><th>处置方式</th><th>复检结论</th><th>操作</th></tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id}>
                  <td className="text-left"><p className="font-mono text-red-600 whitespace-nowrap">{r.ncr_no}</p><p className="text-slate-600 font-medium truncate max-w-[200px]" title={r.title}>{r.title}</p><p className="text-[10px] text-slate-400">{String(r.report_date || '').slice(0, 10)} · {r.reporter}</p></td>
                  <td className="text-left"><p className="font-medium text-slate-700 whitespace-nowrap">{r.product_name || r.product_code}</p><p className="font-mono text-[10px] text-slate-400">{r.product_code}{r.batch_no ? ` · 批次 ${r.batch_no}` : ''}</p>{r.frozen === '是' && <span className="text-[9px] text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">❄️ 批次冻结中</span>}</td>
                  <td className="tabular-nums">{Number(r.qty || 0)}</td>
                  <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SEV_STYLE[r.severity] || 'bg-slate-100 text-slate-500'}`}>{r.severity}</span></td>
                  <td className="text-slate-500 whitespace-nowrap">{r.source}</td>
                  <td><Stepper status={r.status} handling={r.handling} /></td>
                  <td className="whitespace-nowrap text-slate-600">{r.handling ? <>{r.handling}<p className="text-[10px] text-slate-400 max-w-[140px] truncate" title={r.handle_note}>{r.handle_note}</p></> : '—'}</td>
                  <td className="whitespace-nowrap">{r.recheck_result ? <span className={r.recheck_result === '合格' || r.recheck_result === '让步放行' ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>{r.recheck_result}</span> : '—'}</td>
                  <td className="whitespace-nowrap">
                    {canManage && (r.status === '待处置' || r.status === '处置中') && <button onClick={() => { setHandleRow(r); setHMethod('返工'); }} className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-500">处置</button>}
                    {canRecheck && r.status === '待复检' && <button onClick={() => setRecheckRow(r)} className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-[11px] font-medium hover:bg-violet-500">复检</button>}
                    {r.status === '已关闭' && <span className="text-[10px] text-slate-400">{String(r.closed_at || '').slice(0, 10)} 关闭</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && shown.length === 0 && (
        <div className="erp-card p-12 text-center">
          <div className="text-5xl mb-3">✅</div>
          <p className="text-sm text-slate-500 font-medium mb-1">{filter === '全部' ? '暂无质量异常单' : `暂无「${filter}」状态的异常单`}</p>
          <p className="text-xs text-slate-400">检验发现不合格品、客诉或过程异常时，点击「发起质量异常」建立 NCR 闭环</p>
        </div>
      )}

      {/* 发起弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 erp-modal-bg" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-red-50 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 text-base">🚨 发起质量异常（NCR）</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3 text-sm">
              <div><label className="text-xs font-medium text-slate-500">异常标题 *</label><input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="如：SMT 焊点虚焊批量异常" className="erp-input"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-slate-500">发现来源</label><select value={fSource} onChange={e => setFSource(e.target.value)} className="erp-input">{['来料检验', '过程检验', '出货检验', '客户投诉'].map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label className="text-xs font-medium text-slate-500">严重度</label><select value={fSev} onChange={e => setFSev(e.target.value)} className="erp-input">{['轻微', '一般', '严重', '致命'].map(s => <option key={s}>{s}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-slate-500">商品编码 *</label><input value={fCode} onChange={e => setFCode(e.target.value)} placeholder="如 IC-0001" className="erp-input font-mono"/></div>
                <div><label className="text-xs font-medium text-slate-500">异常数量</label><input type="number" min={1} value={fQty} onChange={e => setFQty(Number(e.target.value) || 1)} className="erp-input font-mono tabular-nums"/></div>
              </div>
              <div><label className="text-xs font-medium text-slate-500">关联批次（选填，联动批次追溯）</label><input value={fBatch} onChange={e => setFBatch(e.target.value)} placeholder="如 B00003，填写后可冻结批次" className="erp-input font-mono"/></div>
              <label className={`flex items-center gap-2 text-xs rounded-xl border p-3 cursor-pointer ${fBatch.trim() ? 'bg-red-50/60 border-red-200 text-red-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                <input type="checkbox" checked={fFreeze} disabled={!fBatch.trim()} onChange={e => setFFreeze(e.target.checked)} className="accent-red-500"/>
                ❄️ 冻结该批次库存（批次状态置「已冻结」，阻断领料/出库，复检合格后自动解冻）
              </label>
              <div><label className="text-xs font-medium text-slate-500">备注</label><textarea value={fRemark} onChange={e => setFRemark(e.target.value)} rows={2} placeholder="异常现象、发现工位、初步原因…" className="erp-input"/></div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50 shrink-0">
              <button onClick={() => setShowCreate(false)} className="erp-btn erp-btn-ghost">取消</button>
              <button onClick={doCreate} disabled={busy} className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-500 disabled:opacity-50">{busy ? '提交中…' : '发起异常单'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 处置弹窗 */}
      {handleRow && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 erp-modal-bg" onClick={() => setHandleRow(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-indigo-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">🛠️ 处置 {handleRow.ncr_no}</h3>
              <button onClick={() => setHandleRow(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">{handleRow.product_name} × {Number(handleRow.qty || 0)}{handleRow.batch_no ? `，批次 ${handleRow.batch_no}` : ''}，严重度 <b className={handleRow.severity === '致命' || handleRow.severity === '严重' ? 'text-red-500' : 'text-slate-700'}>{handleRow.severity}</b></p>
              <div><label className="text-xs font-medium text-slate-500">处置方式</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {['返工', '报废', '退货', '让步接收'].map(m => (
                    <button key={m} onClick={() => setHMethod(m)} className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${hMethod === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{m}{m === '报废' ? '（联动出库）' : m === '让步接收' ? '（免复检）' : ''}</button>
                  ))}
                </div>
              </div>
              {hMethod === '报废' && <div><label className="text-xs font-medium text-slate-500">出库仓库</label><input value={hWh} onChange={e => setHWh(e.target.value)} className="erp-input"/></div>}
              <div><label className="text-xs font-medium text-slate-500">处置说明</label><textarea value={hNote} onChange={e => setHNote(e.target.value)} rows={2} placeholder="处置过程、责任判定、纠正措施…" className="erp-input"/></div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50">
              <button onClick={() => setHandleRow(null)} className="erp-btn erp-btn-ghost">取消</button>
              <button onClick={doHandle} disabled={busy} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">{busy ? '提交中…' : '确认处置'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 复检弹窗 */}
      {recheckRow && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 erp-modal-bg" onClick={() => setRecheckRow(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-violet-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">🔬 复检 {recheckRow.ncr_no}</h3>
              <button onClick={() => setRecheckRow(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">处置方式 <b className="text-slate-700">{recheckRow.handling}</b> · {recheckRow.handle_note || '无说明'}</p>
              <div><label className="text-xs font-medium text-slate-500">复检说明</label><textarea value={rNote} onChange={e => setRNote(e.target.value)} rows={2} placeholder="复检项目、抽样结果…" className="erp-input"/></div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50">
              <button onClick={() => doRecheck('不合格')} disabled={busy} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 disabled:opacity-50">✗ 不合格（回到处置）</button>
              <button onClick={() => doRecheck('合格')} disabled={busy} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">✓ 合格（关闭{recheckRow.batch_no ? '并解冻' : ''}）</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
