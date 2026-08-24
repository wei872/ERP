import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMeta, getModuleTree } from '../meta/store';
import { ROLE_LABELS, ROLE_COLORS } from '../types';
import Login from './Login';
import ModulePage from './ModulePage';
// 业务页面全部懒加载：recharts 等大依赖不进首屏包，显著加快登录后首帧
const Dashboard = lazy(() => import('./Dashboard'));
const ReportPage = lazy(() => import('./ReportPage'));
const UserManagement = lazy(() => import('./UserManagement'));
const FinanceTemplate = lazy(() => import('./FinanceTemplate'));
const WorkflowPage = lazy(() => import('./WorkflowPage'));
const VoucherPage = lazy(() => import('./VoucherPage'));
const FinancialStatementsPage = lazy(() => import('./FinancialStatementsPage'));
const ProductionPage = lazy(() => import('./ProductionPage'));
const MrpPage = lazy(() => import('./MrpPage'));
const InventoryClosingPage = lazy(() => import('./InventoryClosingPage'));
const RbacPage = lazy(() => import('./RbacPage'));
const ReconciliationPage = lazy(() => import('./ReconciliationPage'));

function PageFallback() {
  return <div className="flex items-center justify-center h-64 text-sm text-slate-400"><span className="animate-pulse">页面加载中…</span></div>;
}

type Page =
  | { type: 'dashboard' } | { type: 'report' } | { type: 'users' } | { type: 'finance' } | { type: 'rbac' }
  | { type: 'table'; tableKey: string }
  | { type: 'workflow' } | { type: 'voucher' } | { type: 'statements' }
  | { type: 'production' } | { type: 'mrp' } | { type: 'ops' } | { type: 'reconciliation' };

const BIZ_PAGES: Array<{ type: any; label: string; icon: string; roles: string[] }> = [
  { type: 'workflow',       label: '工作流审批',   icon: '🔁', roles: ['admin','sales','warehouse','accounting','production','hr','procurement','aftersale'] },
  { type: 'voucher',        label: '会计凭证',     icon: '📒', roles: ['admin','accounting'] },
  { type: 'statements',     label: '三大财务报表', icon: '📊', roles: ['admin','accounting'] },
  { type: 'reconciliation', label: '应收应付核销', icon: '💸', roles: ['admin','accounting'] },
  { type: 'production',     label: '生产管理',     icon: '🏗️', roles: ['admin','production','warehouse'] },
  { type: 'mrp',            label: 'MRP运算',      icon: '🧮', roles: ['admin','production'] },
  { type: 'ops',            label: '库存直调&期末', icon: '🛠️', roles: ['admin','warehouse','accounting'] },
];

export default function Layout() {
  const { currentUser, users, logout } = useAuth();
  const [page, setPage] = useState<Page>({ type: 'dashboard' });
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [confirmLogout, setConfirmLogout] = useState(false);
  // 移动端：侧边栏变为抽屉式导航
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const h = (e: MediaQueryListEvent) => { setIsMobile(e.matches); if (!e.matches) setMobileNav(false); };
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  /** 导航跳转（移动端同时收起抽屉） */
  const go = (p: Page) => { setPage(p); if (isMobile) setMobileNav(false); };
  const expanded = sidebarOpen || isMobile;

  const { tables } = useMeta();
  const tree = useMemo(() => getModuleTree(), [tables]);

  // ── 全局搜索：162 张数据表 + 业务页面即搜即达 ──
  const [gq, setGq] = useState('');
  const [gOpen, setGOpen] = useState(false);
  const PAGE_ENTRIES: Array<{ label: string; icon: string; page: Page }> = [
    { label: '控制台', icon: '📊', page: { type: 'dashboard' } },
    { label: '报表中心', icon: '📈', page: { type: 'report' } },
    { label: '工作流审批', icon: '🔁', page: { type: 'workflow' } },
    { label: '会计凭证', icon: '📒', page: { type: 'voucher' } },
    { label: '三大财务报表', icon: '📊', page: { type: 'statements' } },
    { label: '应收应付核销', icon: '💸', page: { type: 'reconciliation' } },
    { label: '生产管理', icon: '🏗️', page: { type: 'production' } },
    { label: 'MRP运算', icon: '🧮', page: { type: 'mrp' } },
    { label: '库存直调&期末', icon: '🛠️', page: { type: 'ops' } },
    { label: '财务模版库', icon: '💰', page: { type: 'finance' } },
  ];
  const gResults = useMemo(() => {
    const q = gq.trim().toLowerCase();
    if (!q) return { pages: [] as typeof PAGE_ENTRIES, tables: [] as typeof tables };
    const pages = PAGE_ENTRIES.filter(p => p.label.toLowerCase().includes(q)).slice(0, 4);
    const hitTables = tables.filter(t => t.cnName.toLowerCase().includes(q) || t.table.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q)).slice(0, 8);
    return { pages, tables: hitTables };
  }, [gq, tables]);
  const jump = (p: Page) => { go(p); setGq(''); setGOpen(false); };

  // ── 跨组件导航事件（如仪表盘 KPI 穿透到对应数据表） ──
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d && d.type) setPage(d); };
    window.addEventListener('erp:navigate', h);
    return () => window.removeEventListener('erp:navigate', h);
  }, []);
  const [expandedMods, setExpandedMods] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const pendingCount = users.filter(u => u.status === 'pending').length;

  const visibleModules = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') return Object.keys(tree);
    const perms = currentUser.permissions || [];
    const viewPerms = perms.filter(p => p.canView === true);
    const allowedMods = new Set<string>();
    for (const p of viewPerms) {
      const isSub = tables.some(t => t.sub === p.module);
      if (isSub) { const tbl = tables.find(t => t.sub === p.module); if (tbl) allowedMods.add(tbl.module); }
      else allowedMods.add(p.module);
    }
    if (viewPerms.some(p => p.module === 'all')) return Object.keys(tree);
    return Array.from(allowedMods).filter(m => tree[m]);
  }, [currentUser, tree, tables]);

  const toggleMod = (k: string) => { setExpandedMods(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; }); };
  const toggleSub = (mk: string, sk: string) => { setExpandedSubs(prev => { const n = new Set(prev); const id = `${mk}::${sk}`; n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  if (!currentUser) return <Login />;

  const getPageTitle = () => {
    if (page.type === 'dashboard') return '📊 控制台'; if (page.type === 'report') return '📈 报表中心';
    if (page.type === 'users') return '👤 用户与权限管理';
    if (page.type === 'finance') return '💰 财务模版库';
    if (page.type === 'rbac') return '🛡️ RBAC 角色权限矩阵';
    if (page.type === 'workflow') return '🔁 工作流审批';
    if (page.type === 'voucher') return '📒 会计凭证';
    if (page.type === 'statements') return '📊 三大财务报表';
    if (page.type === 'production') return '🏗️ 生产管理';
    if (page.type === 'mrp') return '🧮 MRP 物料需求';
    if (page.type === 'ops') return '🛠️ 库存直调 & 期末结账';
    if (page.type === 'reconciliation') return '💸 应收应付核销';
    if (page.type === 'table') { const t = tables.find(x => x.table === page.tableKey); return t ? `${t.module} > ${t.sub} > ${t.cnName}` : '数据表'; }
    return '';
  };

  return (<div className="flex h-screen bg-slate-50 overflow-hidden">
    {/* 移动端抽屉遮罩 */}
    {isMobile && mobileNav && <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-40 erp-fade-in" onClick={() => setMobileNav(false)} />}
    <aside className={isMobile
      ? `fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col border-r border-slate-700/50 transition-transform duration-300 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`
      : `${sidebarOpen ? 'w-64' : 'w-16'} bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 transition-all duration-300 flex flex-col shrink-0 overflow-hidden border-r border-slate-700/50`}
      style={isMobile ? undefined : { boxShadow: '4px 0 24px -8px rgba(0,0,0,0.3)' }}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10 shrink-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-base" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>E</div>
        {expanded && <div className="min-w-0"><h1 className="text-white font-bold text-sm leading-tight tracking-tight">ERP 管理系统</h1><p className="text-slate-400 text-[10px] mt-0.5">{tables.length} 张表 · {Object.keys(tree).length} 个模块</p></div>}
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {([['dashboard','控制台','📊'],['report','报表中心','📈'],['finance','财务模版','💰']] as const).map(([type, label, icon]) => (
          <button key={type} onClick={() => go({ type: type as any })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === type ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">{icon}</span>{expanded && <span>{label}</span>}</button>
        ))}
        {currentUser.role === 'admin' && (<button onClick={() => go({ type: 'users' })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === 'users' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">👤</span>{expanded && <span className="flex items-center gap-2">用户管理{pendingCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">{pendingCount}</span>}</span>}</button>)}
        {currentUser.role === 'admin' && (<button onClick={() => go({ type: 'rbac' })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === 'rbac' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">🛡️</span>{expanded && <span>RBAC 权限矩阵</span>}</button>)}
        {expanded && <div className="mt-4 mb-1.5 px-3 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">业务操作</div>}
        {expanded && BIZ_PAGES.filter(b => b.roles.includes(currentUser.role)).map(b => (
          <button key={b.type} onClick={() => go({ type: b.type })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === b.type ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">{b.icon}</span><span>{b.label}</span></button>
        ))}
        {!sidebarOpen && BIZ_PAGES.filter(b => b.roles.includes(currentUser.role)).slice(0, 4).map(b => (
          <button key={b.type} onClick={() => go({ type: b.type })} className={`w-full flex items-center justify-center py-2.5 rounded-lg text-base transition-all mb-0.5 ${page.type === b.type ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5'}`} title={b.label}><span>{b.icon}</span></button>
        ))}
        {expanded && <div className="mt-4 mb-1.5 px-3 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">数据模块</div>}
        {expanded && visibleModules.map(mod => {
          const subs = tree[mod]; if (!subs) return null;
          const isExpanded = expandedMods.has(mod);
          const userPerms = currentUser.permissions || [];
          const visibleSubs = currentUser.role === 'admin' ? Object.keys(subs) : Object.keys(subs).filter(sub => userPerms.some(p => p.canView === true && (p.module === mod || p.module === sub)));
          if (visibleSubs.length === 0) return null;
          return (<div key={mod} className="mb-0.5"><button onClick={() => toggleMod(mod)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${isExpanded ? 'text-slate-200 bg-white/5' : 'text-slate-400 hover:bg-white/5'}`}><svg className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg><span>{mod}</span></button>
          {isExpanded && visibleSubs.map(sub => { const subId = `${mod}::${sub}`; const subExpanded = expandedSubs.has(subId); return (<div key={sub} className="mt-0.5"><button onClick={() => toggleSub(mod, sub)} className="w-full flex items-center gap-2 pl-7 pr-3 py-1.5 rounded-lg text-[11px] transition-all hover:bg-white/5 text-slate-500 hover:text-slate-300"><svg className={`w-2.5 h-2.5 shrink-0 transition-transform duration-200 ${subExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg><span className="truncate flex-1 text-left">{sub}</span><span className="text-[10px] text-slate-600 bg-slate-700/40 px-1.5 py-0.5 rounded">{subs[sub].length}</span></button>
          {subExpanded && subs[sub].map((t) => (<button key={t.table} onClick={() => go({ type: 'table', tableKey: t.table })} className={`w-full text-left pl-11 pr-3 py-1.5 rounded-lg text-[11px] transition-all truncate block ${page.type === 'table' && page.tableKey === t.table ? 'text-indigo-300 bg-indigo-500/10 font-medium' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>{t.cnName}</button>))}</div>);})}</div>);})}
      </nav>
      <button onClick={() => isMobile ? setMobileNav(false) : setSidebarOpen(!sidebarOpen)} className="flex items-center justify-center h-11 border-t border-white/10 text-slate-500 hover:text-slate-200 transition-colors shrink-0"><svg className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></button>
    </aside>
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between shrink-0 gap-2" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2 min-w-0">
          {isMobile && <button onClick={() => setMobileNav(true)} title="打开菜单" className="p-2 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg></button>}
          <h2 className="text-[15px] font-semibold text-slate-800 truncate tracking-tight">{getPageTitle()}</h2>
        </div>
        {/* 全局搜索：功能页 + 162 张数据表即搜即达 */}
        <div className="hidden md:block relative flex-1 max-w-md mx-4">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input value={gq} onChange={e => { setGq(e.target.value); setGOpen(true); }} onFocus={() => setGOpen(true)} onBlur={() => setTimeout(() => setGOpen(false), 180)}
            onKeyDown={e => { if (e.key === 'Escape') { setGq(''); setGOpen(false); (e.target as HTMLInputElement).blur(); } }}
            placeholder="全局搜索：功能页 / 数据表（名称、表名、子模块）" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"/>
          {gOpen && gq.trim() && (
            <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50 max-h-[380px] overflow-y-auto">
              {gResults.pages.length === 0 && gResults.tables.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">未找到匹配项</p>}
              {gResults.pages.map(p => (
                <button key={p.label} onMouseDown={() => jump(p.page)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors">
                  <span>{p.icon}</span><span className="text-slate-700 font-medium">{p.label}</span><span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">功能页</span>
                </button>
              ))}
              {gResults.tables.map(t => (
                <button key={t.table} onMouseDown={() => jump({ type: 'table', tableKey: t.table })} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors">
                  <span className="text-slate-700">{t.cnName}</span>
                  <span className="text-[10px] font-mono text-slate-400">{t.table}</span>
                  <span className="ml-auto text-[10px] text-slate-400 truncate max-w-[120px]">{t.module} / {t.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`erp-badge ${ROLE_COLORS[currentUser.role]}`}>{ROLE_LABELS[currentUser.role]}</span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>{currentUser.realName[0]}</div>
          <span className="text-sm text-slate-600 hidden md:block font-medium">{currentUser.realName}</span>
          {confirmLogout ? (
            <div className="flex items-center gap-1.5 text-xs erp-fade-in">
              <span className="text-slate-500">确认退出登录？</span>
              <button onClick={() => { setConfirmLogout(false); logout(); }} className="px-2.5 py-1 rounded-md bg-red-500 text-white font-medium hover:bg-red-600 transition-colors">退出</button>
              <button onClick={() => setConfirmLogout(false)} className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">取消</button>
            </div>
          ) : (
            <button onClick={() => { setConfirmLogout(true); setTimeout(() => setConfirmLogout(false), 4000); }} title="退出登录" className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-all hover:bg-red-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg></button>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-auto bg-slate-50 erp-fade-in">
        <Suspense fallback={<PageFallback />}>
        {page.type === 'dashboard' && <Dashboard />}{page.type === 'report' && <ReportPage />}
        {page.type === 'finance' && <FinanceTemplate />}
        {page.type === 'users' && currentUser.role === 'admin' && <UserManagement />}
        {page.type === 'users' && currentUser.role !== 'admin' && <div className="p-12 text-center"><div className="text-5xl mb-4">🔒</div><h2 className="text-xl font-bold text-gray-700">权限不足</h2><p className="text-sm text-gray-500 mt-2">仅管理员可访问用户管理</p></div>}
        {page.type === 'rbac' && currentUser.role === 'admin' && <RbacPage />}
        {page.type === 'workflow' && <WorkflowPage />}
        {page.type === 'voucher' && <VoucherPage />}
        {page.type === 'statements' && <FinancialStatementsPage />}
        {page.type === 'production' && <ProductionPage />}
        {page.type === 'mrp' && <MrpPage />}
        {page.type === 'ops' && <InventoryClosingPage />}
        {page.type === 'reconciliation' && <ReconciliationPage />}
        {page.type === 'table' && page.tableKey === 'fin_template' && <FinanceTemplate />}
        {page.type === 'table' && page.tableKey !== 'fin_template' && <ModulePage tableKey={page.tableKey} />}
        </Suspense>
      </main>
    </div>
  </div>);
}
