import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { erpTables } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { dataApi } from '../api';
import { bizApi } from '../api';

function getModuleName(tk: string) { const t = erpTables.find(x => x.key === tk); return t?.sub || t?.module || tk; }

export default function ModulePage({ tableKey }: { tableKey: string }) {
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'add' | 'edit' | 'delete'>('view');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [activeRow, setActiveRow] = useState<Record<string, unknown> | null>(null);
  const [toast, setToast] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const pageSize = 15;

  const table = useMemo(() => erpTables.find(t => t.key === tableKey), [tableKey]);
  const isAdmin = currentUser?.role === 'admin';
  const moduleName = getModuleName(tableKey);
  const perms = (currentUser?.permissions || []) as any[];
  const canAdd = isAdmin || perms.some((p: any) => (p.module === moduleName || p.module === 'all') && p.canAdd === true);
  const canEdit = isAdmin || perms.some((p: any) => (p.module === moduleName || p.module === 'all') && p.canEdit === true);
  const canDelete = isAdmin || perms.some((p: any) => (p.module === moduleName || p.module === 'all') && p.canDelete === true);

  // 🔧 把 search 参数传给后端，触发后端 LIKE 搜索
  const fetchData = useCallback(async (pg: number, kw: string) => {
    if (!table) return;
    setLoading(true); setError('');
    try {
      const r = await dataApi.list(tableKey, pg, pageSize, kw);
      if (r.data && Array.isArray(r.data.rows)) {
        setData(r.data.rows);
        setTotalRows(r.data.total || 0);
      } else { setData([]); setTotalRows(0); }
    } catch (err: any) {
      setError(err.message || '加载失败，请检查后端是否启动');
      setData([]); setTotalRows(0);
    }
    setLoaded(true); setLoading(false);
  }, [table, tableKey, pageSize]);

  // 首次加载 + tableKey 变化
  useEffect(() => { setLoaded(false); setSearch(''); setCurrentPage(1); fetchData(1, ''); }, [tableKey]);

  // 翻页触发
  useEffect(() => { if (loaded) fetchData(currentPage, search); }, [currentPage]);

  // 🔧 搜索触发（去抖）
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSearch = (val: string) => {
    setSearch(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setCurrentPage(1); fetchData(1, val); }, 400);
  };

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const toastFn = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); }, []);

  const handleFileUpload = useCallback((k: string, file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toastFn('❌ 图片文件不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setFormData(prev => ({ ...prev, [k]: result }));
      toastFn('✅ 图片已选定并转 Base64，可直接保存落库！');
    };
    reader.readAsDataURL(file);
  }, [toastFn]);

  const openModal = useCallback((mode: 'view' | 'add' | 'edit' | 'delete', row?: Record<string, unknown>) => {
    setModalMode(mode); setActiveRow(row || null);
    if (mode === 'add') { const init: Record<string, unknown> = {}; table?.cols.forEach(c => { init[c[0]] = c[2] === 'number' ? 0 : c[2] === 'date' ? new Date().toISOString().split('T')[0] : ''; }); setFormData(init); }
    else if (row) setFormData({ ...row });
    setShowModal(true);
  }, [table]);
  const closeModal = useCallback(() => { setShowModal(false); setFormData({}); setActiveRow(null); }, []);

  const handleSave = useCallback(async () => {
    if (!table) return; setLoading(true);
    const clean: Record<string, unknown> = {}; for (const k of Object.keys(formData)) { if (k !== '_rowId') clean[k] = formData[k]; }
    try {
      if (modalMode === 'edit' && activeRow) {
        const ri = (activeRow as any).id; await dataApi.update(tableKey, Number(ri), clean);
        setData(p => p.map(r => String((r as any).id) === String(ri) ? { ...clean, id: ri } : r)); toastFn('修改成功');
      } else if (modalMode === 'add') {
        await dataApi.create(tableKey, clean);
        fetchData(currentPage, search); toastFn('新增成功');
      }
    } catch (e: any) { toastFn('操作失败：' + e.message); }
    setLoading(false); closeModal();
  }, [table, modalMode, activeRow, formData, tableKey, currentPage, search, fetchData, toastFn, closeModal]);

  const handleStockInLink = useCallback(async (row: Record<string, unknown>) => {
    const id = Number((row as any).id);
    if (!id) return;
    setLoading(true);
    try {
      await bizApi.stockInFromPurchase(id);
      toastFn('✅ 采购单入库成功，库存与到货状态已联动更新！');
      fetchData(currentPage, search);
    } catch (e: any) {
      toastFn('❌ 入库失败: ' + (e.message || '系统错误'));
    }
    setLoading(false);
  }, [currentPage, search, fetchData, toastFn]);

  const handleStockOutLink = useCallback(async (row: Record<string, unknown>) => {
    const id = Number((row as any).id);
    if (!id) return;
    setLoading(true);
    try {
      await bizApi.stockOutFromSale(id);
      toastFn('✅ 销售单出库成功，库存已扣减并自动结转成本凭证！');
      fetchData(currentPage, search);
    } catch (e: any) {
      toastFn('❌ 出库失败: ' + (e.message || '系统错误'));
    }
    setLoading(false);
  }, [currentPage, search, fetchData, toastFn]);

  const handleApprovalLink = useCallback(async (row: Record<string, unknown>) => {
    const refNo = String((row as any).purchase_no || (row as any).sales_no || '');
    const amount = Number((row as any).total_amount || 0);
    if (!refNo) return;
    setLoading(true);
    try {
      await bizApi.submitApproval({
        type: '采购审批',
        dept: currentUser?.department || '采购部',
        refNo,
        amount,
        remark: '单据一键提报审批: ' + refNo
      });
      toastFn('✅ 已成功发起工作流审批！单号: ' + refNo);
      fetchData(currentPage, search);
    } catch (e: any) {
      toastFn('❌ 发起审批失败: ' + (e.message || '系统错误'));
    }
    setLoading(false);
  }, [currentUser, currentPage, search, fetchData, toastFn]);

  const handleDelete = useCallback(async () => {
    if (!activeRow) return; setLoading(true);
    try { const ri = (activeRow as any).id; await dataApi.delete(tableKey, Number(ri)); fetchData(currentPage, search); toastFn('删除成功'); }
    catch (e: any) { toastFn('删除失败：' + e.message); }
    setLoading(false); closeModal();
  }, [activeRow, tableKey, currentPage, search, fetchData, toastFn, closeModal]);

  if (!isAdmin && !perms.some((p: any) => (p.module === moduleName || p.module === 'all') && p.canView === true))
    return <div className="p-16 text-center erp-fade-in"><div className="text-6xl mb-4">🔒</div><h2 className="text-xl font-bold text-slate-700">权限不足</h2></div>;
  if (!table) return <div className="p-6 text-slate-500">未找到</div>;
  if (!loaded && !error) return <div className="p-16 text-center"><div className="erp-spinner mb-3"></div><p className="text-sm text-slate-400">加载中...</p></div>;
  if (error) return <div className="p-16 text-center erp-fade-in"><div className="text-5xl mb-4">⚠️</div><p className="text-red-500 font-medium">{error}</p></div>;

  return (<div className="p-6 space-y-5 erp-fade-in">
    {toast && <div className="erp-toast">{toast}</div>}

    {/* UI 引导与数据联动说明 */}
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 text-white shadow-lg space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base flex items-center gap-2 text-indigo-300">
          <span>💡</span> 【{table.name} ({tableKey})】数据表说明与智能操作
        </h3>
        <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">ERP 底层实体基座</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
        <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
            <span>📝</span> 界面使用指南：
          </div>
          <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
            <li>在右上方搜索框中可输入任何关键词，进行后端高效率模糊检索。</li>
            <li>点击【+ 新增】按钮录入记录，对图片列（如发票图片）支持直接选择本地文件并自动转 Base64 存入数据库。</li>
            <li>点击【⬇ CSV】按钮可导出纯中文列名 CSV，带 UTF-8 BOM 绝无乱码。</li>
          </ol>
        </div>
        <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
          <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
            <span>🔄</span> 单据智能 1-Click 联动快捷键：
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
            {tableKey === 'trade_purchase_main' && <li>行操作【🔁 提审批】➔ 一键推送采购单至工作流；【📦 入库】➔ 一键采购入库重算加权成本！</li>}
            {tableKey === 'trade_sales_main' && <li>行操作【🚚 出库】➔ 一键销售扣减库存，并全自动生成销售成本记账凭证 (6401/1405)！</li>}
            {tableKey !== 'trade_purchase_main' && tableKey !== 'trade_sales_main' && <li>上层业务面板（生产管理/出入库/核销/审批）操作时，会自动驱动本表落库与事务更新。</li>}
          </ul>
        </div>
      </div>
    </div>

    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
          <span>{table.module}</span><span className="text-slate-300">/</span><span>{table.sub}</span><span className="text-slate-300">/</span><span className="text-slate-700 font-medium">{table.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">{table.name}</h3>
          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md font-mono">{tableKey}</span>
          <span className="text-[11px] text-slate-400">{totalRows} 条 · {table.cols.length} 列</span>
          {isAdmin && <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-md font-medium">管理员</span>}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="relative">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input type="text" value={search} onChange={e => doSearch(e.target.value)} placeholder="搜索..." className="erp-input pl-9 w-56"/>
        </div>
        <button onClick={() => bizApi.exportTableCsv(tableKey).catch(e => toastFn('导出失败: ' + e.message))} className="erp-btn erp-btn-ghost" title="导出 CSV">⬇ CSV</button>
        {canAdd && <button onClick={() => openModal('add')} disabled={loading} className="erp-btn erp-btn-primary">+ 新增</button>}
      </div>
    </div>

    {!canAdd && !canEdit && !canDelete && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 flex items-center gap-2">⚠️ 当前为仅查看模式</div>}

    <div className="erp-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="erp-table">
          <thead><tr>
            <th className="w-12">#</th>
            {table.cols.map(col => <th key={col[0]} className="whitespace-nowrap">{col[1]}</th>)}
            <th className="text-center w-40 sticky right-0 bg-slate-50">操作</th>
          </tr></thead>
          <tbody>
            {data.map((row, idx) => <tr key={(row as any).id || idx}>
              <td className="text-[11px] text-slate-400 font-mono">{(currentPage - 1) * pageSize + idx + 1}</td>
              {table.cols.map(col => { const v = row[col[0]]; const t = col[2]; const k = col[0]; return <td key={col[0]} className="whitespace-nowrap" >
                {t === 'image' || k.includes('image') || String(v ?? '').startsWith('data:image/') ? (
                  v ? <img src={String(v)} alt="发票图片" onClick={() => setPreviewImg(String(v))} className="h-9 w-14 object-cover rounded border border-slate-200 cursor-pointer shadow-sm hover:scale-105 transition-transform" title="点击放大查看图片" /> : <span className="text-slate-300 text-xs italic">无图片</span>
                ) : t === 'number' ? <span className="font-mono tabular-nums text-slate-700">{typeof v === 'number' ? (v as number).toLocaleString() : String(v ?? '')}</span>
                : (col[0].includes('status') || col[0].includes('_status')) ? <span className={`erp-badge ${String(v).match(/正常|完成|合格|启用|通过|在线/) ? 'bg-emerald-100 text-emerald-700' : String(v).match(/待|草稿/) ? 'bg-amber-100 text-amber-700' : String(v).match(/取消|停用|报废/) ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>{String(v ?? '')}</span>
                : <span className="text-slate-600">{String(v ?? '')}</span>}
              </td>; })}
              <td className="text-center sticky right-0 bg-white" style={{ boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-center gap-1.5">
                  {tableKey === 'trade_purchase_main' && <button onClick={() => handleApprovalLink(row)} disabled={loading} className="px-2.5 py-1 text-[11px] text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors font-medium">🔁 提审批</button>}
                  {tableKey === 'trade_purchase_main' && <button onClick={() => handleStockInLink(row)} disabled={loading} className="px-2.5 py-1 text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors font-medium">📦 入库</button>}
                  {tableKey === 'trade_sales_main' && <button onClick={() => handleStockOutLink(row)} disabled={loading} className="px-2.5 py-1 text-[11px] text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors font-medium">🚚 出库</button>}
                  <button onClick={() => openModal('view', row)} className="px-2.5 py-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors font-medium">查看</button>
                  {canEdit && <button onClick={() => openModal('edit', row)} className="px-2.5 py-1 text-[11px] text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors font-medium">编辑</button>}
                  {canDelete && <button onClick={() => openModal('delete', row)} className="px-2.5 py-1 text-[11px] text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors font-medium">删除</button>}
                </div>
              </td>
            </tr>)}
            {data.length === 0 && <tr><td colSpan={table.cols.length + 2} className="px-4 py-16 text-center">
              <div className="text-slate-300 text-4xl mb-3">📭</div>
              <p className="text-slate-400 text-sm">{search ? `未找到匹配 "${search}" 的记录` : '暂无数据'}</p>
            </td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
        <div className="text-[11px] text-slate-500">共 {totalRows} 条 · 第 {currentPage}/{totalPages} 页</div>
        <div className="flex gap-1">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">«</button>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-[11px] border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">‹</button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { const p = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i; if (p > totalPages) return null; return <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-1.5 text-[11px] rounded-lg font-medium transition-all ${currentPage === p ? 'bg-indigo-500 text-white' : 'border border-slate-200 hover:bg-white'}`}>{p}</button>; })}
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-3 py-1.5 text-[11px] border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">›</button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages} className="px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-white transition-colors">»</button>
        </div>
      </div>
    </div>

    {showModal && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 erp-modal-bg" onClick={closeModal}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col erp-modal-panel" onClick={e => e.stopPropagation()}>
          <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${modalMode === 'delete' ? 'bg-red-50' : modalMode === 'view' ? 'bg-slate-50' : 'bg-indigo-50'}`}>
            <h3 className="font-bold text-slate-800 text-base">{modalMode === 'view' ? '📋 查看详情' : modalMode === 'add' ? '➕ 新增记录' : modalMode === 'edit' ? '✏️ 编辑记录' : '⚠️ 确认删除'}</h3>
            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
          <div className="p-6 overflow-y-auto flex-1">
            {modalMode === 'delete' ? <div className="text-center py-4"><div className="text-4xl mb-3">⚠️</div><p className="text-slate-600 text-sm mb-4">确定要删除这条记录吗？此操作不可撤销。</p><div className="bg-slate-50 rounded-xl p-4 text-left max-w-md mx-auto border border-slate-100">{table.cols.slice(0, 4).map(c => <div key={c[0]} className="flex justify-between py-1.5 text-xs"><span className="text-slate-500">{c[1]}</span><span className="text-slate-800 font-medium">{String(formData[c[0]] ?? '-')}</span></div>)}</div></div>
            : <div className="space-y-3">{table.cols.map(c => { const k = c[0], l = c[1], t = c[2]; return <div key={k} className="grid grid-cols-[140px_1fr] items-start gap-3"><label className="text-xs font-semibold text-slate-500 pt-2.5 text-right">{l}</label>{modalMode === 'view' ? <div className="px-4 py-2.5 bg-slate-50 rounded-lg text-sm border border-slate-100">{t === 'image' || k.includes('image') || String(formData[k] ?? '').startsWith('data:image/') ? (formData[k] ? <div className="space-y-2"><img src={String(formData[k])} alt={l} className="max-h-48 rounded-xl border shadow-sm object-contain bg-white cursor-pointer" onClick={() => setPreviewImg(String(formData[k]))} /><button onClick={() => setPreviewImg(String(formData[k]))} className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium">🔍 点击放大查看高清大图</button></div> : <span className="text-slate-400 text-xs italic">无图片</span>) : t === 'number' && typeof formData[k] === 'number' ? <span className="font-mono font-semibold tabular-nums">{((formData[k] as number) || 0).toLocaleString()}</span> : <span className="text-slate-700">{String(formData[k] ?? '-')}</span>}</div> : t === 'image' || k.includes('image') ? <div className="space-y-2"><input type="file" accept="image/*" onChange={e => handleFileUpload(k, e.target.files?.[0] || null)} className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />{formData[k] ? <div className="relative inline-block border rounded-xl overflow-hidden shadow-sm bg-slate-50 p-1"><img src={String(formData[k])} alt="预监" className="h-24 object-contain rounded-lg"/><button type="button" onClick={() => setFormData(p => ({ ...p, [k]: '' }))} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-red-600 shadow-md">✕</button></div> : null}<input type="text" value={String(formData[k] || '')} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} placeholder="或粘贴发票图片 Base64 / URL" className="erp-input text-xs font-mono"/></div> : t === 'number' ? <input type="number" value={Number(formData[k]) || 0} onChange={e => setFormData(p => ({ ...p, [k]: Number(e.target.value) || 0 }))} className="erp-input font-mono tabular-nums"/> : t === 'date' ? <input type="date" value={String(formData[k] || '')} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} className="erp-input"/> : <input type="text" value={String(formData[k] || '')} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} className="erp-input"/>}</div>; })}</div>}
          </div>
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
            <button onClick={closeModal} className="erp-btn erp-btn-ghost">取消</button>
            {modalMode === 'delete' && <button onClick={handleDelete} disabled={loading} className="erp-btn bg-red-500 text-white hover:bg-red-600">{loading?'删除中...':'确认删除'}</button>}
            {modalMode === 'edit' && <button onClick={handleSave} disabled={loading} className="erp-btn erp-btn-primary">{loading?'保存中...':'保存修改'}</button>}
            {modalMode === 'add' && <button onClick={handleSave} disabled={loading} className="erp-btn erp-btn-primary">{loading?'保存中...':'确认新增'}</button>}
          </div>
        </div>
      </div>
    )}
    {previewImg && (
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 erp-fade-in" onClick={() => setPreviewImg(null)}>
        <div className="relative max-w-4xl max-h-[92vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center w-full mb-3 text-white">
            <span className="text-sm font-semibold flex items-center gap-2">🖼️ 高清发票/图片全屏预览</span>
            <button onClick={() => setPreviewImg(null)} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold text-white transition-colors">关闭 ✕</button>
          </div>
          <img src={previewImg} alt="全屏预览" className="max-w-full max-h-[82vh] rounded-2xl shadow-2xl object-contain border border-white/20 bg-white" />
        </div>
      </div>
    )}
</div>);
}


