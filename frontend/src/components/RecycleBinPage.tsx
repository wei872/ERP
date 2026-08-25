import { useCallback, useEffect, useState } from 'react';
import { bizApi, dataApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { toastNotify } from '../utils/toast';

/** 操作回收站：删除前自动归档，可预览与一键恢复 */
export default function RecycleBinPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleSel = (id: number) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => Number(r.id))));

  const load = useCallback(async (kw: string) => {
    setLoading(true);
    try {
      const r = await dataApi.list('sys_deleted_backup', 1, 100, kw);
      let list = r.data?.rows || [];
      if (!isAdmin) list = list.filter((x: any) => x.deleted_by === currentUser?.username);
      setRows(list);
    } catch (e: any) { toastNotify('回收站加载失败：' + (e.message || '')); setRows([]); }
    setLoading(false);
  }, [isAdmin, currentUser?.username]);

  useEffect(() => { load(''); }, [load]);

  const doRestore = async (id: number, table: string) => {
    if (!confirm(`恢复 ${table} 的这条记录？（将以新 ID 写入原表）`)) return;
    try {
      await bizApi.restoreBackup(id);
      toastNotify('已恢复到 ' + table);
      load(search);
    } catch (e: any) { toastNotify('恢复失败：' + (e.message || '')); }
  };

  const parseData = (row: any) => {
    try { return JSON.parse(row.row_data); } catch { return {}; }
  };

  const doRestoreBatch = async () => {
    if (selected.size === 0) { toastNotify('请先勾选要恢复的记录', 'warn'); return; }
    if (!confirm(`批量恢复选中的 ${selected.size} 条记录？（各以新 ID 写入原表）`)) return;
    try {
      const r = await bizApi.restoreBatch(Array.from(selected));
      toastNotify(`批量恢复完成：成功 ${r.data.ok} 条${r.data.fail ? `，失败 ${r.data.fail} 条` : ''}`);
      setSelected(new Set());
      load(search);
    } catch (e: any) { toastNotify('批量恢复失败：' + (e.message || '')); }
  };

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1300px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">🗑️ 操作回收站</h2>
          <p className="text-sm text-slate-400 mt-1">通用数据表的每次删除都会先归档完整行数据；恢复时以新 ID 写回原表{!isAdmin && '（仅显示本人删除的记录）'}</p>
        </div>
        <div className="flex gap-2">
          <input value={search} onChange={e => { setSearch(e.target.value); setTimeout(() => load(e.target.value), 350); }} placeholder="搜索表名/操作人..." className="erp-input w-52"/>
          <button onClick={() => load(search)} disabled={loading} className="erp-btn erp-btn-ghost">↻</button>
        </div>
      </div>

      {/* 批量操作条 */}
      <div className="erp-card p-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} className="accent-indigo-600 w-4 h-4"/>
          全选
        </label>
        <span className="text-xs text-slate-400">已选 <b className="text-indigo-600 tabular-nums">{selected.size}</b> 条</span>
        <button onClick={doRestoreBatch} disabled={selected.size === 0} className="ml-auto px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg text-xs font-semibold shadow-md disabled:opacity-40 disabled:cursor-not-allowed">♻️ 批量恢复选中</button>
      </div>

      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead><tr><th className="w-10"></th><th>原表</th><th>原 ID</th><th>数据摘要</th><th>删除人</th><th>删除时间</th><th className="text-center">操作</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const d = parseData(r);
                const summary = Object.entries(d).filter(([k]) => k !== 'id').slice(0, 3).map(([k, v]) => `${k}=${v}`).join('，');
                return (
                  <tr key={r.id}>
                    <td className="w-10"><input type="checkbox" checked={selected.has(Number(r.id))} onChange={() => toggleSel(Number(r.id))} className="accent-indigo-600 w-4 h-4"/></td>
                    <td className="font-mono text-xs whitespace-nowrap text-indigo-600">{r.table_name}</td>
                    <td className="tabular-nums text-slate-500">#{r.row_id}</td>
                    <td className="max-w-[360px] truncate text-xs text-slate-600" title={summary}>{summary || '—'}</td>
                    <td className="whitespace-nowrap text-slate-600">{r.deleted_by}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{String(r.deleted_at || '').replace('T', ' ').slice(0, 19)}</td>
                    <td className="text-center whitespace-nowrap">
                      <button onClick={() => setPreview(r)} className="px-2.5 py-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md font-medium mr-1.5">查看</button>
                      <button onClick={() => doRestore(Number(r.id), String(r.table_name))} className="px-2.5 py-1 text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md font-medium">♻️ 恢复</button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={7} className="py-14 text-center">
                  <div className="text-4xl mb-3">🗑️</div>
                  <p className="text-sm text-slate-400">{search ? `未找到匹配 "${search}" 的记录` : '回收站为空 —— 删除的数据都会安全地出现在这里'}</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 归档数据预览 */}
      {preview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[90] p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 text-sm">🗑️ 归档数据预览 <span className="font-mono text-xs text-indigo-600 ml-1">{preview.table_name} #{preview.row_id}</span></h3>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(parseData(preview)).map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-50">
                      <td className="py-2 pr-4 font-mono text-slate-400 whitespace-nowrap align-top">{k}</td>
                      <td className="py-2 text-slate-700 break-all">{String(v ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t flex justify-end gap-2 shrink-0">
              <button onClick={() => setPreview(null)} className="erp-btn erp-btn-ghost">关闭</button>
              <button onClick={() => { const id = Number(preview.id); const t = String(preview.table_name); setPreview(null); doRestore(id, t); }} className="erp-btn erp-btn-primary">♻️ 恢复此记录</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
