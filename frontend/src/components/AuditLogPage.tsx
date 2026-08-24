import { useCallback, useEffect, useState, lazy, Suspense } from 'react';
import { dataApi } from '../api';
import { useAuth } from '../context/AuthContext';

const SummaryPanel = lazy(() => import('./SummaryPanel'));

function fmtDate(v: unknown): string {
  const s = String(v ?? '');
  return s ? s.replace('T', ' ').slice(0, 19) : '—';
}

function StatusBadge({ s }: { s: string }) {
  const ok = s === '成功';
  const warn = s.startsWith('失败');
  const cls = ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : warn ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>{s || '—'}</span>;
}

const ACTION_COLOR: Record<string, string> = {
  '新增': 'bg-emerald-50 text-emerald-700', '修改': 'bg-amber-50 text-amber-700',
  '删除': 'bg-red-50 text-red-600', '导出': 'bg-indigo-50 text-indigo-600',
};

/** 审计日志：操作日志 + 登录日志（商用合规必备的安全审计追踪） */
export default function AuditLogPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [tab, setTab] = useState<'op' | 'login'>('op');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pageSize = 20;

  const load = useCallback(async (pg: number, kw: string) => {
    setLoading(true); setError('');
    try {
      const r = await dataApi.list(tab === 'op' ? 'sys_log_operation' : 'sys_login_log', pg, pageSize, kw);
      setRows(r.data?.rows || []);
      setTotal(r.data?.total || 0);
    } catch (e: any) { setError(e.message || '加载失败'); setRows([]); setTotal(0); }
    setLoading(false);
  }, [tab]);

  useEffect(() => { setPage(1); setSearch(''); load(1, ''); }, [load]);

  const doSearch = (v: string) => {
    setSearch(v); setPage(1);
    setTimeout(() => load(1, v), 350);
  };

  if (!isAdmin) return <div className="p-16 text-center"><div className="text-5xl mb-3">🔒</div><p className="text-slate-500">审计日志仅管理员可查看</p></div>;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1500px] mx-auto">
      <Suspense fallback={null}><SummaryPanel tableKey={tab === 'op' ? 'sys_log_operation' : 'sys_login_log'} /></Suspense>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">🕵️ 审计日志</h2>
          <p className="text-sm text-slate-400 mt-1">全部增删改/导出操作与登录行为留痕，安全合规可追溯（共 {total} 条）</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden text-sm">
            <button onClick={() => setTab('op')} className={`px-4 py-2 font-medium transition-colors ${tab === 'op' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>操作日志</button>
            <button onClick={() => setTab('login')} className={`px-4 py-2 font-medium transition-colors ${tab === 'login' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>登录日志</button>
          </div>
          <input value={search} onChange={e => doSearch(e.target.value)} placeholder={tab === 'op' ? '搜索用户/模块/明细...' : '搜索用户名/状态...'} className="erp-input w-52"/>
          <button onClick={() => load(page, search)} className="erp-btn erp-btn-ghost">↻</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            {tab === 'op' ? (
              <>
                <thead><tr><th>时间</th><th>操作员</th><th>模块</th><th>操作</th><th>明细</th><th>IP</th><th>状态</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-500">{fmtDate(r.created_at)}</td>
                      <td className="whitespace-nowrap font-medium text-slate-700">{r.username || '—'}</td>
                      <td className="whitespace-nowrap text-slate-600">{r.module || '—'}</td>
                      <td className="whitespace-nowrap"><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${ACTION_COLOR[String(r.action)] || 'bg-slate-100 text-slate-600'}`}>{r.action || '—'}</span></td>
                      <td className="max-w-[320px] truncate text-slate-500 text-xs" title={String(r.detail ?? '')}>{r.detail || '—'}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-400">{r.ip || '—'}</td>
                      <td className="whitespace-nowrap"><StatusBadge s={String(r.status || '')}/></td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead><tr><th>时间</th><th>用户名</th><th>IP 地址</th><th>状态</th><th>备注</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-500">{fmtDate(r.login_time)}</td>
                      <td className="whitespace-nowrap font-medium text-slate-700">{r.user_name || '—'}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-400">{r.login_ip || '—'}</td>
                      <td className="whitespace-nowrap"><StatusBadge s={String(r.login_status || '')}/></td>
                      <td className="max-w-[320px] truncate text-slate-500 text-xs" title={String(r.remark ?? '')}>{r.remark || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
            {rows.length === 0 && !loading && (
              <tbody><tr><td colSpan={7} className="px-4 py-14 text-center">
                <div className="text-slate-300 text-4xl mb-3">🗂️</div>
                <p className="text-slate-400 text-sm">{search ? `未找到匹配 "${search}" 的记录` : '暂无日志'}</p>
              </td></tr></tbody>
            )}
          </table>
        </div>
        {/* 分页 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
          <span>第 {page} / {totalPages} 页 · 共 {total} 条</span>
          <div className="flex gap-1.5">
            <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p, search); }} disabled={page === 1} className="erp-btn erp-btn-ghost disabled:opacity-40">‹ 上一页</button>
            <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); load(p, search); }} disabled={page >= totalPages} className="erp-btn erp-btn-ghost disabled:opacity-40">下一页 ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
