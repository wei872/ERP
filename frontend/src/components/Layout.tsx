import { useState, useMemo, lazy, Suspense } from 'react';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMods, setExpandedMods] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const pendingCount = users.filter(u => u.status === 'pending').length;
  const { tables } = useMeta();
  const tree = useMemo(() => getModuleTree(), [tables]);

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
    <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 transition-all duration-300 flex flex-col shrink-0 overflow-hidden border-r border-slate-700/50`} style={{ boxShadow: '4px 0 24px -8px rgba(0,0,0,0.3)' }}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10 shrink-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-base" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>E</div>
        {sidebarOpen && <div className="min-w-0"><h1 className="text-white font-bold text-sm leading-tight tracking-tight">ERP 管理系统</h1><p className="text-slate-400 text-[10px] mt-0.5">{tables.length} 张表 · {Object.keys(tree).length} 个模块</p></div>}
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {([['dashboard','控制台','📊'],['report','报表中心','📈'],['finance','财务模版','💰']] as const).map(([type, label, icon]) => (
          <button key={type} onClick={() => setPage({ type: type as any })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === type ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">{icon}</span>{sidebarOpen && <span>{label}</span>}</button>
        ))}
        {currentUser.role === 'admin' && (<button onClick={() => setPage({ type: 'users' })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === 'users' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">👤</span>{sidebarOpen && <span className="flex items-center gap-2">用户管理{pendingCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">{pendingCount}</span>}</span>}</button>)}
        {currentUser.role === 'admin' && (<button onClick={() => setPage({ type: 'rbac' })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === 'rbac' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">🛡️</span>{sidebarOpen && <span>RBAC 权限矩阵</span>}</button>)}
        {sidebarOpen && <div className="mt-4 mb-1.5 px-3 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">业务操作</div>}
        {sidebarOpen && BIZ_PAGES.filter(b => b.roles.includes(currentUser.role)).map(b => (
          <button key={b.type} onClick={() => setPage({ type: b.type })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === b.type ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">{b.icon}</span><span>{b.label}</span></button>
        ))}
        {!sidebarOpen && BIZ_PAGES.filter(b => b.roles.includes(currentUser.role)).slice(0, 4).map(b => (
          <button key={b.type} onClick={() => setPage({ type: b.type })} className={`w-full flex items-center justify-center py-2.5 rounded-lg text-base transition-all mb-0.5 ${page.type === b.type ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5'}`} title={b.label}><span>{b.icon}</span></button>
        ))}
        {sidebarOpen && <div className="mt-4 mb-1.5 px-3 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">数据模块</div>}
        {sidebarOpen && visibleModules.map(mod => {
          const subs = tree[mod]; if (!subs) return null;
          const isExpanded = expandedMods.has(mod);
          const userPerms = currentUser.permissions || [];
          const visibleSubs = currentUser.role === 'admin' ? Object.keys(subs) : Object.keys(subs).filter(sub => userPerms.some(p => p.canView === true && (p.module === mod || p.module === sub)));
          if (visibleSubs.length === 0) return null;
          return (<div key={mod} className="mb-0.5"><button onClick={() => toggleMod(mod)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${isExpanded ? 'text-slate-200 bg-white/5' : 'text-slate-400 hover:bg-white/5'}`}><svg className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg><span>{mod}</span></button>
          {isExpanded && visibleSubs.map(sub => { const subId = `${mod}::${sub}`; const subExpanded = expandedSubs.has(subId); return (<div key={sub} className="mt-0.5"><button onClick={() => toggleSub(mod, sub)} className="w-full flex items-center gap-2 pl-7 pr-3 py-1.5 rounded-lg text-[11px] transition-all hover:bg-white/5 text-slate-500 hover:text-slate-300"><svg className={`w-2.5 h-2.5 shrink-0 transition-transform duration-200 ${subExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg><span className="truncate flex-1 text-left">{sub}</span><span className="text-[10px] text-slate-600 bg-slate-700/40 px-1.5 py-0.5 rounded">{subs[sub].length}</span></button>
          {subExpanded && subs[sub].map((t) => (<button key={t.table} onClick={() => setPage({ type: 'table', tableKey: t.table })} className={`w-full text-left pl-11 pr-3 py-1.5 rounded-lg text-[11px] transition-all truncate block ${page.type === 'table' && page.tableKey === t.table ? 'text-indigo-300 bg-indigo-500/10 font-medium' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>{t.cnName}</button>))}</div>);})}</div>);})}
      </nav>
      <button onClick={() => setSidebarOpen(!sidebarOpen)} className="flex items-center justify-center h-11 border-t border-white/10 text-slate-500 hover:text-slate-200 transition-colors shrink-0"><svg className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></button>
    </aside>
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 h-16 flex items-center justify-between shrink-0" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h2 className="text-[15px] font-semibold text-slate-800 truncate tracking-tight">{getPageTitle()}</h2>
        <div className="flex items-center gap-3">
          <span className={`erp-badge ${ROLE_COLORS[currentUser.role]}`}>{ROLE_LABELS[currentUser.role]}</span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>{currentUser.realName[0]}</div>
          <span className="text-sm text-slate-600 hidden md:block font-medium">{currentUser.realName}</span>
          <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-all hover:bg-red-50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg></button>
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
