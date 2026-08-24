import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { dataApi } from '../api';
import { bizApi } from '../api';
import { useTableMeta, statusBadgeClass } from '../meta/store';

const SummaryPanel = lazy(() => import('./SummaryPanel'));

/** 数字列：千分位 + 最多2位小数；空值显示占位符 */
function formatCellNum(v: unknown): string {
  if (v === null || v === undefined || String(v).trim() === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const rounded = Math.round(n * 100) / 100;
  return Math.abs(rounded) >= 1000 ? rounded.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(rounded);
}
/** 日期列：只显示 YYYY-MM-DD（兼容 ISO/空格分隔格式） */
function formatCellDate(v: unknown): string {
  if (!v) return '—';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

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
  // 行业物料编码规则（商品表新增时一键生成编码）
  const [codeRules, setCodeRules] = useState<any[]>([]);
  const [codeRule, setCodeRule] = useState('');
  // 业财一体化联动面板
  const [linkData, setLinkData] = useState<any | null>(null);
  const [linkNo, setLinkNo] = useState('');
  // 列排序（服务端排序，白名单校验）
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // 操作指南默认收起，降低视觉噪音
  const [showGuide, setShowGuide] = useState(false);
  const pageSize = 15;



  const { meta: table, loading: metaLoading } = useTableMeta(tableKey);
  const isAdmin = currentUser?.role === 'admin';
  const moduleName = table?.sub || table?.module || tableKey;
  const perms = (currentUser?.permissions || []) as any[];
  const canAdd = isAdmin || perms.some((p: any) => (p.module === moduleName || p.module === 'all') && p.canAdd === true);
  const canEdit = isAdmin || perms.some((p: any) => (p.module === moduleName || p.module === 'all') && p.canEdit === true);
  const canDelete = isAdmin || perms.some((p: any) => (p.module === moduleName || p.module === 'all') && p.canDelete === true);

  // 🔧 把 search / sort 参数传给后端，触发后端 LIKE 搜索与列排序
  const fetchData = useCallback(async (pg: number, kw: string, sc: string = '', sd: string = '') => {
    if (!table) return;
    setLoading(true); setError('');
    try {
      const r = await dataApi.list(tableKey, pg, pageSize, kw, sc, sd);
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

  // 首次加载 + tableKey 变化（列元数据就绪后才拉数据）
  useEffect(() => { setLoaded(false); setSearch(''); setCurrentPage(1); setSortCol(''); setSortDir('desc'); if (table) fetchData(1, ''); }, [tableKey, table]);

  // 点击表头排序：同列切换方向，新列默认降序
  const toggleSort = useCallback((colName: string) => {
    const nextDir = sortCol === colName ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc';
    setSortCol(colName); setSortDir(nextDir); setCurrentPage(1);
    fetchData(1, search, colName, nextDir);
  }, [sortCol, sortDir, search, fetchData]);

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

  // 行业物料编码规则：商品表打开时加载规则列表
  useEffect(() => {
    if (tableKey === 'trade_goods_main') {
      bizApi.codeRules().then(r => { setCodeRules(r.data || []); if (r.data?.length) setCodeRule(r.data[0].rule_code); }).catch(() => {});
    }
  }, [tableKey]);

  const genGoodsCode = useCallback(async () => {
    if (!codeRule) { toastFn('请先选择编码规则'); return; }
    try {
      const r = await bizApi.nextCode(codeRule);
      setFormData(p => ({ ...p, product_code: r.data.code }));
      toastFn(`已按「${r.data.rule_name}」生成编码 ${r.data.code}`);
    } catch (e: any) { toastFn('生成编码失败：' + (e.message || '')); }
  }, [codeRule, toastFn]);

  const openDocLinks = useCallback(async (no: string) => {
    try { setLinkNo(no); setLinkData(await (await bizApi.docLinks(no)).data); }
    catch (e: any) { toastFn('联动查询失败：' + (e.message || '')); }
  }, [toastFn]);

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
    if (mode === 'add') { const init: Record<string, unknown> = {}; table?.cols.forEach(c => { init[c.name] = c.type === 'number' ? 0 : c.type === 'date' ? new Date().toISOString().split('T')[0] : ''; }); setFormData(init); }
    else if (row) setFormData({ ...row });
    setShowModal(true);
  }, [table]);
  const closeModal = useCallback(() => { setShowModal(false); setFormData({}); setActiveRow(null); }, []);

  const handleSave = useCallback(async () => {
    if (!table) return; setLoading(true);
    const clean: Record<string, unknown> = {}; for (const k of Object.keys(formData)) { if (k !== '_rowId') clean[k] = formData[k]; }
    try {
      if (modalMode === 'edit' && activeRow) {
        const ri = (activeRow as any).id; const r = await dataApi.update(tableKey, Number(ri), clean);
        setData(p => p.map(row => String((row as any).id) === String(ri) ? { ...clean, id: ri } : row)); toastFn('修改成功');
        if (r.data && r.data.warning) toastFn('⚠️ ' + r.data.warning);
      } else if (modalMode === 'add') {
        const r = await dataApi.create(tableKey, clean);
        fetchData(currentPage, search); toastFn(r.data && r.data.warning ? '⚠️ ' + r.data.warning : '新增成功');
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
  if (metaLoading || (!table && !loaded)) return <div className="p-16 text-center"><div className="erp-spinner mb-3"></div><p className="text-sm text-slate-400">加载中...</p></div>;
  if (!table) return <div className="p-6 text-slate-500">未找到</div>;
  if (!loaded && !error) return <div className="p-16 text-center"><div className="erp-spinner mb-3"></div><p className="text-sm text-slate-400">加载中...</p></div>;
  if (error) return <div className="p-16 text-center erp-fade-in"><div className="text-5xl mb-4">⚠️</div><p className="text-red-500 font-medium">{error}</p></div>;

  const dicts = table.dicts || {};

  return (<div className="p-6 space-y-5 erp-fade-in">
    {toast && <div className="erp-toast">{toast}</div>}

    {/* UI 引导与数据联动说明（默认收起，点击展开） */}
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl px-5 py-3 text-white shadow-lg">
      <button onClick={() => setShowGuide(s => !s)} className="w-full flex items-center justify-between text-left">
        <h3 className="font-bold text-sm flex items-center gap-2 text-indigo-300">
          <span>💡</span> 【{table.cnName} ({tableKey})】数据表说明与智能操作
        </h3>
        <span className="flex items-center gap-2">
          <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">ERP 底层实体基座</span>
          <span className="text-indigo-300/70 text-xs">{showGuide ? '▲ 收起' : '▼ 展开'}</span>
        </span>
      </button>
      {showGuide && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed mt-3">
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
      </div>}
    </div>

    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
          <span>{table.module}</span><span className="text-slate-300">/</span><span>{table.sub}</span><span className="text-slate-300">/</span><span className="text-slate-700 font-medium">{table.cnName}</span>
        </div>
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">{table.cnName}</h3>
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

    {/* 汇总卡片 + 分析图（每个业务列表页自带） */}
    <Suspense fallback={null}><SummaryPanel tableKey={tableKey} /></Suspense>

    {!canAdd && !canEdit && !canDelete && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 flex items-center gap-2">⚠️ 当前为仅查看模式</div>}

    <div className="erp-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="erp-table">
          <thead><tr>
            <th className="w-12">#</th>
            {table.cols.map(col => <th key={col.name} onClick={() => toggleSort(col.name)} title="点击排序" className={`whitespace-nowrap cursor-pointer select-none hover:text-indigo-600 transition-colors ${col.type === 'number' ? 'text-right' : ''}`}>{col.cnName}{sortCol === col.name && <span className="text-indigo-500 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}</th>)}
            <th className="text-center w-40 sticky right-0 bg-slate-50">操作</th>
          </tr></thead>
          <tbody>
            {data.map((row, idx) => <tr key={(row as any).id || idx}>
              <td className="text-[11px] text-slate-400 font-mono">{(currentPage - 1) * pageSize + idx + 1}</td>
              {table.cols.map(col => { const k = col.name, t = col.type; const v = row[k]; return <td key={k} className="whitespace-nowrap" >
                {String(v ?? '').startsWith('data:image/') || (t === 'image' && false) ? (
                  v ? <img src={String(v)} alt="发票图片" onClick={() => setPreviewImg(String(v))} className="h-9 w-14 object-cover rounded border border-slate-200 cursor-pointer shadow-sm hover:scale-105 transition-transform" title="点击放大查看图片" /> : <span className="text-slate-300 text-xs italic">无图片</span>
                ) : t === 'number' ? <span className="font-mono tabular-nums text-slate-700 block text-right">{formatCellNum(v)}</span>
                : t === 'date' ? <span className="text-slate-500 tabular-nums">{formatCellDate(v)}</span>
                : (k.includes('status') || k.includes('_status') || dicts[k]) ? <span className={`erp-badge ${statusBadgeClass(k, v, dicts)}`}>{String(v ?? '')}</span>
                : <span className="text-slate-600 block max-w-[280px] truncate" title={String(v ?? '')}>{String(v ?? '') || '—'}</span>}
              </td>; })}
              <td className="text-center sticky right-0 bg-white" style={{ boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-center gap-1.5">
                  {(tableKey === 'trade_sales_main' || tableKey === 'trade_purchase_main') && <button onClick={() => openDocLinks(String((row as any)[tableKey === 'trade_sales_main' ? 'sales_no' : 'purchase_no']))} className="px-2.5 py-1 text-[11px] text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors font-medium">🔗 业财</button>}
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
            {modalMode === 'delete' ? <div className="text-center py-4"><div className="text-4xl mb-3">⚠️</div><p className="text-slate-600 text-sm mb-4">确定要删除这条记录吗？此操作不可撤销（关联明细将按外键级联删除）。</p><div className="bg-slate-50 rounded-xl p-4 text-left max-w-md mx-auto border border-slate-100">{table.cols.slice(0, 4).map(c => <div key={c.name} className="flex justify-between py-1.5 text-xs"><span className="text-slate-500">{c.cnName}</span><span className="text-slate-800 font-medium">{String(formData[c.name] ?? '-')}</span></div>)}</div></div>
            : <div className="space-y-3">{table.cols.map(c => { const k = c.name, l = c.cnName, t = c.type; const dict = dicts[k]; return <div key={k} className="grid grid-cols-[140px_1fr] items-start gap-3"><label className="text-xs font-semibold text-slate-500 pt-2.5 text-right">{l}</label>{modalMode === 'view' ? <div className="px-4 py-2.5 bg-slate-50 rounded-lg text-sm border border-slate-100">{String(formData[k] ?? '').startsWith('data:image/') ? (formData[k] ? <div className="space-y-2"><img src={String(formData[k])} alt={l} className="max-h-48 rounded-xl border shadow-sm object-contain bg-white cursor-pointer" onClick={() => setPreviewImg(String(formData[k]))} /><button onClick={() => setPreviewImg(String(formData[k]))} className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium">🔍 点击放大查看高清大图</button></div> : <span className="text-slate-400 text-xs italic">无图片</span>) : t === 'number' && typeof formData[k] === 'number' ? <span className="font-mono font-semibold tabular-nums">{((formData[k] as number) || 0).toLocaleString()}</span> : <span className="text-slate-700">{String(formData[k] ?? '-')}</span>}</div> : k.includes('image') ? <div className="space-y-2"><input type="file" accept="image/*" onChange={e => handleFileUpload(k, e.target.files?.[0] || null)} className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />{formData[k] ? <div className="relative inline-block border rounded-xl overflow-hidden shadow-sm bg-slate-50 p-1"><img src={String(formData[k])} alt="预览" className="h-24 object-contain rounded-lg"/><button type="button" onClick={() => setFormData(p => ({ ...p, [k]: '' }))} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-red-600 shadow-md">✕</button></div> : null}<input type="text" value={String(formData[k] || '')} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} placeholder="或粘贴发票图片 Base64 / URL" className="erp-input text-xs font-mono"/></div> : dict ? <select value={String(formData[k] || '')} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} className="erp-input"><option value="">-- 请选择{l} --</option>{dict.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</select> : t === 'number' ? <input type="number" value={Number(formData[k]) || 0} onChange={e => setFormData(p => ({ ...p, [k]: Number(e.target.value) || 0 }))} className="erp-input font-mono tabular-nums"/> : t === 'date' ? <input type="date" value={String(formData[k] || '')} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} className="erp-input"/> : (tableKey === 'trade_goods_main' && k === 'product_code' && modalMode === 'add') ? <div className="flex gap-2 items-center"><input type="text" value={String(formData[k] || '')} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} className="erp-input flex-1" placeholder="点右侧 ⚡ 按行业编码规则自动生成"/><select value={codeRule} onChange={e => setCodeRule(e.target.value)} className="erp-input w-40">{codeRules.map(r => <option key={r.rule_code} value={r.rule_code}>{r.prefix}* {r.rule_name}</option>)}</select><button type="button" onClick={genGoodsCode} className="erp-btn erp-btn-primary whitespace-nowrap">⚡ 生成编码</button></div> : <input type="text" value={String(formData[k] || '')} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} className="erp-input"/>}</div>; })}</div>}
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

    {/* 业财一体化联动全景弹窗 */}
    {linkData && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[90] p-4 erp-modal-bg" onClick={() => setLinkData(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col erp-modal-panel" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-teal-50 to-cyan-50 shrink-0">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">🔗 业财一体化联动全景 <span className="text-xs font-mono bg-white border border-teal-200 text-teal-700 px-2 py-0.5 rounded-md">{linkNo}</span></h3>
            <button onClick={() => setLinkData(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
          <div className="p-6 overflow-y-auto flex-1 space-y-5 text-sm">
            {(() => {
              const Sec = ({ title, icon, empty, children }: any) => (
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">{icon} {title} {empty && <span className="text-slate-300 font-normal">（暂无联动记录）</span>}</p>
                  {children}
                </div>
              );
              const vch = linkData.vouchers || [], det = linkData.voucherDetails || [];
              const rcv = linkData.receivables || [], pay = linkData.payables || [];
              const sin = linkData.stockIn || [], sout = linkData.stockOut || [], bat = linkData.batches || [];
              const money = (v: any) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const badge = (s: string) => <span className={`erp-badge ${statusBadgeClass('status', s, dicts)}`}>{s}</span>;
              return (<>
                <Sec title={`会计凭证（${vch.length} 张，业务发生自动联动记账）`} icon="📒" empty={vch.length === 0}>
                  {vch.map((v: any) => (
                    <div key={v.id} className="border border-slate-200 rounded-xl p-3 mb-2 bg-slate-50/60">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-700">{v.voucher_no}</span>
                        <span className="flex items-center gap-2 text-xs text-slate-500">{String(v.voucher_date || '').slice(0, 10)} {badge(v.voucher_status)} <b className="text-slate-700 tabular-nums">¥{money(v.debit_total)}</b></span>
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {det.filter((d: any) => d.voucher_no === v.voucher_no).map((d: any) => (
                            <tr key={d.id} className="border-t border-slate-100">
                              <td className="py-1 text-slate-500 w-16 font-mono">{d.subject_code}</td>
                              <td className="py-1 text-slate-700">{d.subject_name}</td>
                              <td className="py-1 text-right tabular-nums text-slate-600 w-24">{Number(d.debit_amount) > 0 ? money(d.debit_amount) : ''}</td>
                              <td className="py-1 text-right tabular-nums text-slate-600 w-24">{Number(d.credit_amount) > 0 ? money(d.credit_amount) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </Sec>
                <Sec title={`应收单（${rcv.length}）`} icon="💰" empty={rcv.length === 0}>
                  {rcv.map((r: any) => <div key={r.id} className="flex items-center justify-between border border-amber-100 bg-amber-50/50 rounded-xl px-3 py-2 mb-1.5 text-xs"><span className="font-mono">{r.receivable_no}</span>{badge(r.status)}<span className="tabular-nums">总额 ¥{money(r.total_amount)} · 已收 ¥{money(r.received_amount)} · <b className="text-amber-700">余额 ¥{money(r.remain_amount)}</b></span></div>)}
                </Sec>
                <Sec title={`应付单（${pay.length}）`} icon="🧾" empty={pay.length === 0}>
                  {pay.map((r: any) => <div key={r.id} className="flex items-center justify-between border border-violet-100 bg-violet-50/50 rounded-xl px-3 py-2 mb-1.5 text-xs"><span className="font-mono">{r.payable_no}</span>{badge(r.status)}<span className="tabular-nums">总额 ¥{money(r.total_amount)} · 已付 ¥{money(r.paid_amount)} · <b className="text-violet-700">余额 ¥{money(r.remain_amount)}</b></span></div>)}
                </Sec>
                <Sec title={`入库单（${sin.length}）/ 出库单（${sout.length}）`} icon="📦" empty={sin.length === 0 && sout.length === 0}>
                  {[...sin.map((x: any) => ({ ...x, _t: '入库' })), ...sout.map((x: any) => ({ ...x, _t: '出库' }))].map((x: any) => (
                    <div key={x._t + x.id} className="flex items-center justify-between border border-slate-200 rounded-xl px-3 py-2 mb-1.5 text-xs"><span className="font-mono">{x._t === '入库' ? x.in_no : x.out_no}</span>{badge(x.status)}<span className="tabular-nums text-slate-600">¥{money(x.total_amount)} · {String(x._t === '入库' ? x.in_date : x.out_date || '').slice(0, 10)}</span></div>
                  ))}
                </Sec>
                <Sec title={`关联批次（${bat.length}）`} icon="🧬" empty={bat.length === 0}>
                  {bat.map((b: any) => <div key={b.id} className="flex items-center justify-between border border-teal-100 bg-teal-50/40 rounded-xl px-3 py-2 mb-1.5 text-xs"><span className="font-mono">{b.batch_no}</span><span className="text-slate-500">{b.product_name}</span>{badge(b.status)}<span className="tabular-nums">入库 {Number(b.qty || 0)} / 剩余 {Number(b.remain_qty || 0)}</span></div>)}
                </Sec>
              </>);
            })()}
          </div>
          <div className="px-6 py-3 border-t bg-slate-50/60 text-[11px] text-slate-400">业务单据发生后，凭证 / 应收应付 / 出入库 / 批次由后端事务自动联动生成，无需手工重复录入。</div>
        </div>
      </div>
    )}
  </div>);
}
