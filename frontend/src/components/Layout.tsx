import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMeta, getModuleTree } from '../meta/store';
import { ROLE_LABELS, ROLE_COLORS } from '../types';
import { bizApi } from '../api';
import { getCurrentCompany, setCurrentCompany, type CompanyInfo } from '../utils/company';
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
const AuditLogPage = lazy(() => import('./AuditLogPage'));
const ProfitPage = lazy(() => import('./ProfitPage'));
const BigScreen = lazy(() => import('./BigScreen'));
const DailyReportPage = lazy(() => import('./DailyReportPage'));
const DictManagePage = lazy(() => import('./DictManagePage'));
const RecycleBinPage = lazy(() => import('./RecycleBinPage'));
const MobileApprovalPage = lazy(() => import('./MobileApprovalPage'));

function PageFallback() {
  return <div className="flex items-center justify-center h-64 text-sm text-slate-400"><span className="animate-pulse">页面加载中…</span></div>;
}

type Page =
  | { type: 'dashboard' } | { type: 'report' } | { type: 'users' } | { type: 'finance' } | { type: 'rbac' }
  | { type: 'table'; tableKey: string }
  | { type: 'workflow' } | { type: 'voucher' } | { type: 'statements' }
  | { type: 'production' } | { type: 'mrp' } | { type: 'ops' } | { type: 'reconciliation' } | { type: 'audit' } | { type: 'profit' } | { type: 'daily' } | { type: 'dicts' } | { type: 'recycle' } | { type: 'mapproval' };

const BIZ_PAGES: Array<{ type: any; label: string; icon: string; roles: string[] }> = [
  { type: 'daily',          label: '经营日报',     icon: '📰', roles: ['admin','sales','warehouse','accounting','production','hr','procurement','aftersale'] },
  { type: 'workflow',       label: '工作流审批',   icon: '🔁', roles: ['admin','sales','warehouse','accounting','production','hr','procurement','aftersale'] },
  { type: 'mapproval',      label: '移动审批',     icon: '📱', roles: ['admin','sales','warehouse','accounting','production','hr','procurement','aftersale'] },
  { type: 'voucher',        label: '会计凭证',     icon: '📒', roles: ['admin','accounting'] },
  { type: 'statements',     label: '三大财务报表', icon: '📊', roles: ['admin','accounting'] },
  { type: 'reconciliation', label: '应收应付核销', icon: '💸', roles: ['admin','accounting'] },
  { type: 'profit',         label: '毛利分析',     icon: '💹', roles: ['admin','accounting','sales'] },
  { type: 'production',     label: '生产管理',     icon: '🏗️', roles: ['admin','production','warehouse'] },
  { type: 'mrp',            label: 'MRP运算',      icon: '🧮', roles: ['admin','production'] },
  { type: 'ops',            label: '库存直调&期末', icon: '🛠️', roles: ['admin','warehouse','accounting'] },
  { type: 'audit',          label: '审计日志',     icon: '🕵️', roles: ['admin'] },
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
    { label: '经营日报', icon: '📰', page: { type: 'daily' } },
    { label: '移动审批', icon: '📱', page: { type: 'mapproval' } },
    { label: '报表中心', icon: '📈', page: { type: 'report' } },
    { label: '工作流审批', icon: '🔁', page: { type: 'workflow' } },
    { label: '会计凭证', icon: '📒', page: { type: 'voucher' } },
    { label: '三大财务报表', icon: '📊', page: { type: 'statements' } },
    { label: '应收应付核销', icon: '💸', page: { type: 'reconciliation' } },
    { label: '生产管理', icon: '🏗️', page: { type: 'production' } },
    { label: 'MRP运算', icon: '🧮', page: { type: 'mrp' } },
    { label: '库存直调&期末', icon: '🛠️', page: { type: 'ops' } },
    { label: '财务模版库', icon: '💰', page: { type: 'finance' } },
    { label: '审计日志', icon: '🕵️', page: { type: 'audit' } },
    { label: '毛利分析', icon: '💹', page: { type: 'profit' } },
    { label: '数据字典', icon: '📖', page: { type: 'dicts' } },
    { label: '操作回收站', icon: '🗑️', page: { type: 'recycle' } },
  ];
  const gResults = useMemo(() => {
    const q = gq.trim().toLowerCase();
    if (!q) return { pages: [] as typeof PAGE_ENTRIES, tables: [] as typeof tables };
    const pages = PAGE_ENTRIES.filter(p => p.label.toLowerCase().includes(q)).slice(0, 4);
    const hitTables = tables.filter(t => t.cnName.toLowerCase().includes(q) || t.table.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q)).slice(0, 8);
    return { pages, tables: hitTables };
  }, [gq, tables]);
  const jump = (p: Page) => { go(p); setGq(''); setGOpen(false); };
  // 快捷键「/」唤起全局搜索（输入框聚焦时不触发）
  const gInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        gInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // ── 跨组件导航事件（如仪表盘 KPI 穿透到对应数据表） ──
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d && d.type) setPage(d); };
    window.addEventListener('erp:navigate', h);
    return () => window.removeEventListener('erp:navigate', h);
  }, []);

  // ── 待办中心：顶栏铃铛（审批待办/库存预警/逾期应收应付/待审用户），60 秒轮询 ──
  const [todos, setTodos] = useState<any>(null);
  const [todoOpen, setTodoOpen] = useState(false);
  const loadTodos = useCallback(() => { bizApi.todos().then(r => setTodos(r.data)).catch(() => {}); }, []);
  useEffect(() => { loadTodos(); const iv = setInterval(loadTodos, 60000); return () => clearInterval(iv); }, [loadTodos]);
  const n = (v: unknown) => Number(v) || 0;
  const todoTotal = todos ? n(todos.pendingApprovals) + n(todos.lowStock?.count) + n(todos.overdueReceivable?.count) + n(todos.overduePayable?.count) + n(todos.pendingUsers) : 0;
  const todoJump = (p: Page) => { go(p); setTodoOpen(false); };

  // ── 移动端全局搜索（全屏层） ──
  const [mobileSearch, setMobileSearch] = useState(false);
  // ── 多公司（账套）上下文切换 ──
  const [companies, setCompanies] = useState<any[]>([]);
  const [curCompany, setCurCompany] = useState<CompanyInfo>(getCurrentCompany());
  useEffect(() => {
    bizApi.companies().then(r => {
      const list = r.data || [];
      setCompanies(list);
      // 本地记忆的公司若已不存在则回退默认
      const cur = getCurrentCompany();
      if (list.length > 0 && !list.some((c: any) => c.company_code === cur.company_code)) {
        const def = list.find((c: any) => c.is_default) || list[0];
        setCurrentCompany({ company_code: def.company_code, company_name: def.company_name, short_name: def.short_name });
        setCurCompany({ company_code: def.company_code, company_name: def.company_name, short_name: def.short_name });
      }
    }).catch(() => {});
  }, []);
  const switchCompany = (code: string) => {
    const c = companies.find((x: any) => x.company_code === code);
    if (!c) return;
    setCurrentCompany({ company_code: c.company_code, company_name: c.company_name, short_name: c.short_name });
    setCurCompany({ company_code: c.company_code, company_name: c.company_name, short_name: c.short_name });
  };

  // ── 常用表收藏（表格页星标切换，跨事件同步） ──
  const [bigScreen, setBigScreen] = useState(false);
  const readFavs = () => { try { return JSON.parse(localStorage.getItem('erp_fav_tables') || '[]') as string[]; } catch { return []; } };
  const [favTables, setFavTables] = useState<string[]>(readFavs);
  useEffect(() => {
    const h = () => setFavTables(readFavs());
    window.addEventListener('erp:favs', h);
    window.addEventListener('storage', h);
    return () => { window.removeEventListener('erp:favs', h); window.removeEventListener('storage', h); };
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
    if (page.type === 'audit') return '🕵️ 审计日志';
    if (page.type === 'profit') return '💹 销售毛利分析';
    if (page.type === 'daily') return '📰 经营日报';
    if (page.type === 'dicts') return '📖 数据字典维护';
    if (page.type === 'recycle') return '🗑️ 操作回收站';
    if (page.type === 'mapproval') return '📱 移动审批中心';
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
        {currentUser.role === 'admin' && (<button onClick={() => go({ type: 'dicts' })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === 'dicts' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">📖</span>{expanded && <span>数据字典维护</span>}</button>)}
        {currentUser.role === 'admin' && (<button onClick={() => go({ type: 'recycle' })} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-0.5 ${page.type === 'recycle' ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="shrink-0 text-base">🗑️</span>{expanded && <span>操作回收站</span>}</button>)}
        {expanded && favTables.length > 0 && (<div className="mb-1">
          <div className="mt-4 mb-1.5 px-3 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">⭐ 常用收藏</div>
          {favTables.map(tk => { const t = tables.find(x => x.table === tk); if (!t) return null; return (
            <button key={tk} onClick={() => go({ type: 'table', tableKey: tk })} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-all mb-0.5 ${page.type === 'table' && page.tableKey === tk ? 'bg-amber-400/15 text-amber-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
              <span className="shrink-0">⭐</span><span className="truncate">{t.cnName}</span>
            </button>
          ); })}
        </div>)}
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
          {isMobile && <button onClick={() => setMobileSearch(true)} title="全局搜索" className="p-2 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg></button>}
          <h2 className="text-[15px] font-semibold text-slate-800 truncate tracking-tight">{getPageTitle()}</h2>
        </div>
        {/* 全局搜索：功能页 + 162 张数据表即搜即达 */}
        <div className="hidden md:block relative flex-1 max-w-md mx-4">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input ref={gInputRef} value={gq} onChange={e => { setGq(e.target.value); setGOpen(true); }} onFocus={() => setGOpen(true)} onBlur={() => setTimeout(() => setGOpen(false), 180)}
            onKeyDown={e => { if (e.key === 'Escape') { setGq(''); setGOpen(false); (e.target as HTMLInputElement).blur(); } }}
            placeholder="全局搜索（快捷键 /）：功能页 / 数据表" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"/>
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
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* 公司（账套）切换 */}
          {companies.length > 1 && (
            <select value={curCompany.company_code} onChange={e => switchCompany(e.target.value)} title="切换公司账套"
              className="hidden sm:block max-w-[150px] text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 outline-none focus:border-indigo-400 cursor-pointer">
              {companies.map((c: any) => <option key={c.company_code} value={c.company_code}>🏢 {c.short_name || c.company_name}</option>)}
            </select>
          )}
          {/* 数据大屏 */}
          <button onClick={() => setBigScreen(true)} title="经营驾驶舱（数据大屏）" className="no-print p-2 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18v12H3zM8 20h8m-4-4v4"/></svg>
          </button>
          {/* 待办铃铛 */}
          <div className="relative">
            <button onClick={() => { setTodoOpen(o => !o); loadTodos(); }} title="待办中心" className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              {todoTotal > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">{todoTotal > 99 ? '99+' : todoTotal}</span>}
            </button>
            {todoOpen && (<>
              <div className="fixed inset-0 z-40" onClick={() => setTodoOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[92vw] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden erp-fade-in">
                <div className="px-4 py-3 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
                  <span className="text-sm font-semibold">🔔 待办中心</span>
                  <span className="text-[11px] text-indigo-200">{todoTotal} 项待处理</span>
                </div>
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-50">
                  {todoTotal === 0 && <p className="px-4 py-8 text-center text-xs text-slate-400">🎉 太棒了，暂无待办事项</p>}
                  {todos && n(todos.pendingApprovals) > 0 && (
                    <button onClick={() => todoJump({ type: 'workflow' })} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50/60 transition-colors">
                      <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">🔁</span>
                      <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-slate-700">审批待办</span><span className="block text-[11px] text-slate-400">点击进入工作流处理</span></span>
                      <span className="text-sm font-bold text-violet-600 tabular-nums">{n(todos.pendingApprovals)}</span>
                    </button>
                  )}
                  {todos && n(todos.lowStock?.count) > 0 && (
                    <button onClick={() => todoJump({ type: 'table', tableKey: 'trade_inventory_balance' })} className="w-full px-4 py-3 text-left hover:bg-amber-50/60 transition-colors">
                      <span className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">📦</span>
                        <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-slate-700">库存预警</span><span className="block text-[11px] text-slate-400">低于安全库存，点击补货</span></span>
                        <span className="text-sm font-bold text-amber-600 tabular-nums">{n(todos.lowStock?.count)}</span>
                      </span>
                      <span className="mt-2 space-y-1 block">
                        {(todos.lowStock.items || []).slice(0, 3).map((it: any) => (
                          <span key={it.product_code} className="flex justify-between text-[11px] text-slate-500 bg-slate-50 rounded-md px-2 py-1">
                            <span className="truncate">{it.product_name}</span>
                            <span className="tabular-nums shrink-0 ml-2">现 {Number(it.qty || 0)} / 安全 {Number(it.min_stock || 0)}</span>
                          </span>
                        ))}
                      </span>
                    </button>
                  )}
                  {todos && n(todos.overdueReceivable?.count) > 0 && (
                    <button onClick={() => todoJump({ type: 'reconciliation' })} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50/60 transition-colors">
                      <span className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">💰</span>
                      <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-slate-700">应收逾期</span><span className="block text-[11px] text-slate-400">¥{n(todos.overdueReceivable?.amount).toLocaleString()} 待催收</span></span>
                      <span className="text-sm font-bold text-red-500 tabular-nums">{n(todos.overdueReceivable?.count)}</span>
                    </button>
                  )}
                  {todos && n(todos.overduePayable?.count) > 0 && (
                    <button onClick={() => todoJump({ type: 'reconciliation' })} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-50/60 transition-colors">
                      <span className="w-9 h-9 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">🧾</span>
                      <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-slate-700">应付逾期</span><span className="block text-[11px] text-slate-400">¥{n(todos.overduePayable?.amount).toLocaleString()} 待安排付款</span></span>
                      <span className="text-sm font-bold text-orange-500 tabular-nums">{n(todos.overduePayable?.count)}</span>
                    </button>
                  )}
                  {todos && n(todos.pendingUsers) > 0 && (
                    <button onClick={() => todoJump({ type: 'users' })} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-blue-50/60 transition-colors">
                      <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">👤</span>
                      <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-slate-700">用户待审核</span><span className="block text-[11px] text-slate-400">新注册账号等待开通</span></span>
                      <span className="text-sm font-bold text-blue-500 tabular-nums">{n(todos.pendingUsers)}</span>
                    </button>
                  )}
                </div>
              </div>
            </>)}
          </div>
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
        {page.type === 'audit' && <AuditLogPage />}
        {page.type === 'profit' && <ProfitPage />}
        {page.type === 'daily' && <DailyReportPage />}
        {page.type === 'dicts' && <DictManagePage />}
        {page.type === 'recycle' && <RecycleBinPage />}
        {page.type === 'mapproval' && <MobileApprovalPage />}
        {page.type === 'table' && page.tableKey === 'fin_template' && <FinanceTemplate />}
        {page.type === 'table' && page.tableKey !== 'fin_template' && <ModulePage tableKey={page.tableKey} />}
        </Suspense>
      </main>
      {bigScreen && <Suspense fallback={null}><BigScreen onExit={() => setBigScreen(false)} /></Suspense>}

      {/* 移动端全局搜索全屏层 */}
      {mobileSearch && (
        <div className="fixed inset-0 z-[140] bg-slate-900/60 backdrop-blur-sm md:hidden" onClick={() => setMobileSearch(false)}>
          <div className="bg-white w-full h-full flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex gap-2 items-center shrink-0">
              <input autoFocus value={gq} onChange={e => setGq(e.target.value)} placeholder="搜索功能页 / 数据表…"
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-indigo-400 focus:bg-white"/>
              <button onClick={() => { setMobileSearch(false); setGq(''); }} className="text-sm text-slate-500 px-2 shrink-0">取消</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {gq.trim() === '' ? (
                <p className="text-center text-xs text-slate-400 py-12">输入表名 / 功能名试试，例如：销售单 / 凭证 / 盘点</p>
              ) : (<>
                {gResults.pages.length === 0 && gResults.tables.length === 0 && <p className="text-center text-xs text-slate-400 py-12">未找到匹配项</p>}
                {gResults.pages.map(p => (
                  <button key={p.label} onClick={() => { jump(p.page); setMobileSearch(false); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm text-slate-700 hover:bg-indigo-50 active:bg-indigo-100">
                    <span>{p.icon}</span><span className="font-medium">{p.label}</span><span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">功能页</span>
                  </button>
                ))}
                {gResults.tables.map(t => (
                  <button key={t.table} onClick={() => { jump({ type: 'table', tableKey: t.table }); setMobileSearch(false); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm text-slate-700 hover:bg-indigo-50 active:bg-indigo-100">
                    <span className="min-w-0 truncate">{t.cnName}</span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">{t.table}</span>
                    <span className="ml-auto text-[10px] text-slate-400 truncate max-w-[90px] shrink-0">{t.sub}</span>
                  </button>
                ))}
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  </div>);
}
