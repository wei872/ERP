import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';

function fmtSize(n: unknown): string {
  const b = Number(n) || 0;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

const FILE_ICON = (t: string) => t.startsWith('image/') ? '🖼️' : t.includes('pdf') ? '📕' : t.includes('sheet') || t.includes('excel') ? '📗' : t.startsWith('text/') ? '📄' : '📎';

/** 单据附件弹窗：上传 / 列表 / 下载 / 删除（按 业务表 + 单据号 关联） */
export default function AttachmentModal({ tableKey, refNo, onClose }: { tableKey: string; refNo: string; onClose: () => void }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await bizApi.attachmentList(tableKey, refNo);
      setList(r.data || []);
    } catch (e: any) { toastNotify('附件列表加载失败：' + (e.message || '')); }
    setLoading(false);
  }, [tableKey, refNo]);

  useEffect(() => { load(); }, [load]);

  const doUpload = async (file: File) => {
    setUploading(true);
    try {
      await bizApi.attachmentUpload(tableKey, refNo, file);
      toastNotify(`附件「${file.name}」上传成功`);
      load();
    } catch (e: any) { toastNotify('上传失败：' + (e.message || '')); }
    setUploading(false);
  };

  const doDelete = async (id: number, name: string) => {
    if (!confirm(`删除附件「${name}」？`)) return;
    try { await bizApi.attachmentDelete(id); toastNotify('附件已删除'); load(); }
    catch (e: any) { toastNotify('删除失败：' + (e.message || '')); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[95] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-sm">📎 单据附件 <span className="font-mono text-xs text-indigo-600 ml-1">{refNo}</span></h3>
          <div className="flex items-center gap-2">
            <label className={`px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer hover:bg-indigo-700 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? '上传中...' : '⬆ 上传附件'}
              <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = ''; }} />
            </label>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-10 text-center"><div className="erp-spinner mx-auto mb-2"></div><p className="text-xs text-slate-400">加载中...</p></div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-4xl mb-3">📎</div>
              <p className="text-sm text-slate-400">该单据暂无附件</p>
              <p className="text-[11px] text-slate-300 mt-1">支持图片 / 文档等，单个不超过 5MB</p>
            </div>
          ) : (
            <div className="space-y-2">
              {list.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                  <span className="text-xl shrink-0">{FILE_ICON(String(a.file_type || ''))}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 font-medium truncate" title={a.file_name}>{a.file_name}</p>
                    <p className="text-[11px] text-slate-400">{fmtSize(a.file_size)} · {a.uploaded_by || '—'} · {String(a.created_at || '').replace('T', ' ').slice(0, 16)}</p>
                  </div>
                  <button onClick={() => bizApi.attachmentDownload(Number(a.id), String(a.file_name)).catch(() => toastNotify('下载失败'))} className="px-2.5 py-1 text-[11px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md font-medium shrink-0">下载</button>
                  <button onClick={() => doDelete(Number(a.id), String(a.file_name))} className="px-2.5 py-1 text-[11px] text-red-500 bg-red-50 hover:bg-red-100 rounded-md font-medium shrink-0">删除</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t bg-slate-50/60 text-[11px] text-slate-400 shrink-0">附件存储于数据库（sys_attachment），随业务数据一并备份；单文件 ≤ 5MB。</div>
      </div>
    </div>
  );
}
