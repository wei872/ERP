import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';

/** 操作日志高级检索：用户 / 模块 / 时间范围 + 分页（仅管理员） */
export default function AuditLogSearchPage() {
  const [user, setUser] = useState('');
  const [module, setModule] = useState('全部');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const size = 20;

  const search = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await bizApi.auditSearch({
        user: user.trim() || undefined,
        module: module !== '全部' ? module : undefined,
        from: from || undefined,
        to: to || undefined,
        page: p,
        size,
      });
      setRows(r.data?.rows || []);
      setTotal(r.data?.total || 0);
      setModules((r.data?.modules || []).map((m: any) => String(m.module)));
    } catch { /* ignore */ }
    setLoading(false);
  }, [user, module, from, to]);

  useEffect(() => { search(1); setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1300px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">🔎 操作日志高级检索</h2>
        <p className="text-sm text-slate-400 mt-1">按操作人 / 模块 / 时间范围检索全部操作留痕（安全审计与问题追溯）</p>
      </div>

      {/* 筛选条 */}
      <div className="erp-card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] text-slate-400 block mb-1">操作人</label>
          <input value={user} onChange={e => setUser(e.target.value)} placeholder="用户名模糊搜索" className="erp-input w-40" />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 block mb-1">模块</label>
          <select value={module} onChange={e => setModule(e.target.value)} className="erp-input w-36">
            <option>全部</option>
            {modules.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-400 block mb-1">开始日期</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="erp-input w-40" />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 block mb-1">结束日期</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="erp-input w-40" />
        </div>
        <button onClick={() => { setUser(''); setModule('全部'); setFrom(''); setTo(''); }} className="erp-btn erp-btn-ghost mb-0.5">↺ 重置</button>
        <span className="ml-auto text-xs text-slate-400 mb-2">共 <b className="text-slate-700 tabular-nums">{total.toLocaleString()}</b> 条记录</span>
      </div>

      {/* 结果表 */}
      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead><tr><th>时间</th><th>操作人</th><th>模块</th><th>操作</th><th>明细</th><th>IP</th><th>状态</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-mono text-xs text-slate-500">{String(r.created_at || '').replace('T', ' ').slice(0, 19)}</td>
                  <td className="whitespace-nowrap font-medium text-slate-700">{r.username || '—'}</td>
                  <td className="whitespace-nowrap"><span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[11px]">{r.module || '—'}</span></td>
                  <td className="whitespace-nowrap text-slate-600">{r.action || '—'}</td>
                  <td className="max-w-[320px] truncate text-xs text-slate-500" title={String(r.detail ?? '')}>{r.detail || '—'}</td>
                  <td className="whitespace-nowrap font-mono text-xs text-slate-400">{r.ip || '—'}</td>
                  <td className="whitespace-nowrap"><span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px]">{r.status || '成功'}</span></td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={7} className="py-14 text-center">
                  <div className="text-4xl mb-3">🔎</div>
                  <p className="text-sm text-slate-400">未找到匹配的操作记录</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* 分页 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
          <span>第 {page} / {totalPages} 页</span>
          <div className="flex gap-1.5">
            <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); search(p); }} disabled={page === 1} className="erp-btn erp-btn-ghost disabled:opacity-40">‹ 上一页</button>
            <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); search(p); }} disabled={page >= totalPages} className="erp-btn erp-btn-ghost disabled:opacity-40">下一页 ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
