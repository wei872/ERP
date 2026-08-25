/** 全局公司（账套）上下文：顶栏切换后持久化，单据抬头/报表打印读取当前公司 */
const KEY = 'erp_company';

export interface CompanyInfo {
  company_code: string;
  company_name: string;
  short_name?: string;
}

export function getCurrentCompany(): CompanyInfo {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { company_code: 'HQ', company_name: '三包智联科技有限公司' };
}

export function setCurrentCompany(c: CompanyInfo) {
  localStorage.setItem(KEY, JSON.stringify(c));
  window.dispatchEvent(new CustomEvent('erp:company-changed'));
}

export function getCurrentCompanyName(): string {
  return getCurrentCompany().company_name;
}
