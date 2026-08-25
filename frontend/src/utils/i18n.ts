/**
 * 轻量多语言框架（i18n）：
 *   t('nav.dashboard') 按当前语言取文案，缺失时回退 key 本身；
 *   setLanguage('en-US') 切换并持久化，触发全局刷新事件。
 * 覆盖策略：导航/登录/通用操作等核心界面先行接入，业务页面逐步推进。
 */
export type Lang = 'zh-CN' | 'en-US';

const DICT: Record<Lang, Record<string, string>> = {
  'zh-CN': {
    'app.title': 'ERP 管理系统',
    'app.subtitle': '智能化企业管理平台 · 高效协同',
    'nav.dashboard': '控制台',
    'nav.report': '报表中心',
    'nav.finance': '财务模版',
    'nav.users': '用户管理',
    'nav.rbac': 'RBAC 权限矩阵',
    'nav.dicts': '数据字典维护',
    'nav.recycle': '操作回收站',
    'nav.monitor': '系统运行监控',
    'nav.workflow': '工作流审批',
    'nav.mapproval': '移动审批',
    'nav.tracking': '销售执行跟踪',
    'nav.ptracking': '采购执行跟踪',
    'nav.invanalysis': '库存周转分析',
    'nav.import': '数据导入中心',
    'nav.voucher': '会计凭证',
    'nav.statements': '三大财务报表',
    'nav.reconciliation': '应收应付核销',
    'nav.production': '生产管理',
    'nav.mrp': 'MRP运算',
    'nav.ops': '库存直调&期末',
    'nav.audit': '审计日志',
    'nav.profit': '毛利分析',
    'nav.daily': '经营日报',
    'nav.prodtracking': '生产执行跟踪',
    'nav.auditsearch': '日志高级检索',
    'section.biz': '业务操作',
    'section.data': '数据模块',
    'section.fav': '常用收藏',
    'common.search': '搜索',
    'common.confirm': '确认',
    'common.cancel': '取消',
    'common.save': '保存',
    'common.delete': '删除',
    'common.export': '导出',
    'common.print': '打印',
    'common.logout': '退出登录',
    'common.logoutConfirm': '确认退出登录？',
    'login.username': '用户名',
    'login.password': '密码',
    'login.submit': '登 录',
    'login.register': '注册',
    'login.demoHint': '演示账号一键填充',
  },
  'en-US': {
    'app.title': 'ERP System',
    'app.subtitle': 'Smart Enterprise Management Platform',
    'nav.dashboard': 'Dashboard',
    'nav.report': 'Reports',
    'nav.finance': 'Finance Templates',
    'nav.users': 'User Management',
    'nav.rbac': 'RBAC Matrix',
    'nav.dicts': 'Dictionary',
    'nav.recycle': 'Recycle Bin',
    'nav.monitor': 'System Monitor',
    'nav.workflow': 'Workflow',
    'nav.mapproval': 'Mobile Approval',
    'nav.tracking': 'Sales Tracking',
    'nav.ptracking': 'Purchase Tracking',
    'nav.invanalysis': 'Inventory Turnover',
    'nav.import': 'Import Center',
    'nav.voucher': 'Vouchers',
    'nav.statements': 'Financial Statements',
    'nav.reconciliation': 'Reconciliation',
    'nav.production': 'Production',
    'nav.mrp': 'MRP',
    'nav.ops': 'Inventory Ops',
    'nav.audit': 'Audit Log',
    'nav.profit': 'Profit Analysis',
    'nav.daily': 'Daily Report',
    'nav.prodtracking': 'Production Tracking',
    'nav.auditsearch': 'Log Search',
    'section.biz': 'Business',
    'section.data': 'Data Modules',
    'section.fav': 'Favorites',
    'common.search': 'Search',
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.export': 'Export',
    'common.print': 'Print',
    'common.logout': 'Logout',
    'common.logoutConfirm': 'Confirm logout?',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign In',
    'login.register': 'Register',
    'login.demoHint': 'Demo accounts',
  },
};

const KEY = 'erp_lang';
let current: Lang = ((): Lang => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en-US' || v === 'zh-CN') return v;
  } catch { /* ignore */ }
  return 'zh-CN';
})();

const listeners: Array<() => void> = [];

export function getLanguage(): Lang { return current; }

export function setLanguage(lang: Lang) {
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  listeners.forEach(fn => fn());
  window.dispatchEvent(new CustomEvent('erp:lang-changed'));
}

export function onLanguageChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

/** 取文案：当前语言 → 中文回退 → key */
export function t(key: string): string {
  return DICT[current][key] ?? DICT['zh-CN'][key] ?? key;
}

export const LANG_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
];
