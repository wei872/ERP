// API 基址：默认走同源 /api（nginx 反代）；前后端分离部署时可用构建期环境变量
// VITE_API_BASE 覆盖，例如：VITE_API_BASE=https://api.example.com/api npm run build
const BASE = ((import.meta as any).env?.VITE_API_BASE as string | undefined) || '/api';
async function request<T = any>(url: string, options: RequestInit = {}): Promise<{ success: boolean; data: T; message?: string }> {
  const token = localStorage.getItem('erp_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, { ...options, headers });
  const json = await res.json();
  if (!json.success) {
    if (res.status === 401) {
      localStorage.removeItem('erp_token'); localStorage.removeItem('erp_current_user');
      // 广播会话失效：AuthContext 监听后退出登录并提示，避免用户停留在假登录态
      window.dispatchEvent(new CustomEvent('erp:unauthorized', { detail: json.message || '未登录或Token已过期' }));
    }
    throw new Error(json.message || '请求失败');
  }
  return json;
}
export const authApi = {
  login: (u: string, p: string) => request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }),
  register: (d: Record<string, string>) => request('/auth/register', { method: 'POST', body: JSON.stringify(d) }),
  getUsers: () => request<any[]>('/auth/users'),
  approveUser: (id: string) => request(`/auth/approve/${id}`, { method: 'POST' }),
  disableUser: (id: string) => request(`/auth/disable/${id}`, { method: 'POST' }),
  enableUser: (id: string) => request(`/auth/enable/${id}`, { method: 'POST' }),
  deleteUser: (id: string) => request(`/auth/delete/${id}`, { method: 'DELETE' }),
  updatePermissions: (id: string, p: any[]) => request(`/auth/permissions/${id}`, { method: 'POST', body: JSON.stringify(p) }),
  getMe: () => request('/auth/me'),
};
export const dataApi = {
  list: (t: string, page = 1, size = 100, s = '', sort = '', dir = '') => request<{ total: number; rows: any[] }>(`/data/${t}?page=${page}&size=${size}&search=${encodeURIComponent(s)}&sort=${encodeURIComponent(sort)}&dir=${dir}`),
  create: (t: string, d: Record<string, unknown>) => request(`/data/${t}`, { method: 'POST', body: JSON.stringify(d) }),
  update: (t: string, id: number, d: Record<string, unknown>) => request(`/data/${t}/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  delete: (t: string, id: number) => request(`/data/${t}/${id}`, { method: 'DELETE' }),
  initDb: () => request('/data/init-db'),
  summary: (t: string) => request<{ cards: any[]; trend?: { title: string; points: any[] }; groups?: { title: string; points: any[] } }>(`/data/${t}/summary`),
};

export const bizApi = {
  dashboard: () => request<any>('/biz/dashboard'),
  report: () => request<any>('/biz/report'),
  balanceSheet: (period: string) => request<any>(`/biz/report/balance-sheet?period=${encodeURIComponent(period)}`),
  incomeStatement: (period: string) => request<any>(`/biz/report/income-statement?period=${encodeURIComponent(period)}`),
  cashFlow: (period: string) => request<any>(`/biz/report/cash-flow?period=${encodeURIComponent(period)}`),
  reconcile: (type: string, no: string, amount: number) => request('/biz/reconciliation', { method: 'POST', body: JSON.stringify({ type, no, amount }) }),
  approve: (approvalNo: string, comment: string) => request(`/biz/approve/${approvalNo}`, { method: 'POST', body: JSON.stringify({ comment }) }),
  reject: (approvalNo: string, comment: string) => request(`/biz/reject/${approvalNo}`, { method: 'POST', body: JSON.stringify({ comment }) }),
  submitApproval: (body: Record<string, unknown>) => request('/biz/submit-approval', { method: 'POST', body: JSON.stringify(body) }),
  myTasks: () => request<any[]>('/biz/my-tasks'),
  approvalDetail: (approvalNo: string) => request<any>(`/biz/approval/${approvalNo}`),
  monthClose: (period: string) => request('/biz/month-close', { method: 'POST', body: JSON.stringify({ period }) }),
  yearClose: (year: string) => request('/biz/year-close', { method: 'POST', body: JSON.stringify({ year }) }),
  mrpCalc: (productCode: string, qty: number) => request('/biz/mrp-calc', { method: 'POST', body: JSON.stringify({ product_code: productCode, qty }) }),
  mrpRollupCost: (productCode: string) => request<{ cost: number }>(`/biz/mrp-rollup-cost?product_code=${encodeURIComponent(productCode)}`),
  mrpToPurchase: (calcCode: string) => request('/biz/mrp-to-purchase', { method: 'POST', body: JSON.stringify({ calc_code: calcCode }) }),
  mrpToWorkOrder: (calcCode: string) => request('/biz/mrp-to-work-order', { method: 'POST', body: JSON.stringify({ calc_code: calcCode }) }),
  stockIn: (body: Record<string, unknown>) => request('/biz/stock-in', { method: 'POST', body: JSON.stringify(body) }),
  stockOut: (body: Record<string, unknown>) => request('/biz/stock-out', { method: 'POST', body: JSON.stringify(body) }),
  stockInFromPurchase: (id: number) => request(`/biz/stock-in-from-purchase/${id}`, { method: 'POST' }),
  stockOutFromSale: (id: number) => request(`/biz/stock-out-from-sale/${id}`, { method: 'POST' }),
  batchTrace: (batchNo: string) => request<any>(`/biz/batch-trace/${encodeURIComponent(batchNo)}`),
  batchTraceSale: (salesNo: string) => request<any>(`/biz/batch-trace-sale/${encodeURIComponent(salesNo)}`),
  codeRules: () => request<any[]>('/biz/code-rules'),
  nextCode: (ruleCode: string) => request<{ code: string; rule_name: string; description: string }>(`/biz/next-code/${encodeURIComponent(ruleCode)}`),
  docLinks: (no: string) => request<any>(`/biz/doc-links/${encodeURIComponent(no)}`),
  activityFeed: () => request<any[]>('/biz/activity-feed'),
  todos: () => request<any>('/biz/todos'),
  createVoucher: (lines: any[], voucherWord = '记', period?: string) => request('/biz/voucher', { method: 'POST', body: JSON.stringify({ lines, voucher_word: voucherWord, period }) }),
  voucherFromSale: (id: number) => request(`/biz/finance/voucher-from-sale/${id}`, { method: 'POST' }),
  voucherFromPurchase: (id: number) => request(`/biz/finance/voucher-from-purchase/${id}`, { method: 'POST' }),
  createWorkOrder: (body: Record<string, unknown>) => request('/biz/production/work-order', { method: 'POST', body: JSON.stringify(body) }),
  productionWarehousing: (body: Record<string, unknown>) => request('/biz/production/warehousing', { method: 'POST', body: JSON.stringify(body) }),
  productionScrap: (body: Record<string, unknown>) => request('/biz/production/scrap', { method: 'POST', body: JSON.stringify(body) }),
  confirmRequisition: (body: Record<string, unknown>) => request('/biz/production/requisition-confirm', { method: 'POST', body: JSON.stringify(body) }),
  productionSettle: (workOrderNo: string) => request(`/biz/production/settle/${encodeURIComponent(workOrderNo)}`),
  exportTableCsv: (table: string) => downloadBlob(`/biz/export/${encodeURIComponent(table)}`, `${table}.csv`),
  reportExcel: (type: string, period: string, name: string) => downloadBlob(`/biz/report/excel?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}`, `${name}_${period}.xlsx`),
};

export const metaApi = {
  tables: () => request<any[]>('/meta/tables'),
  table: (t: string) => request<any>(`/meta/tables/${encodeURIComponent(t)}`),
  dicts: () => request<Record<string, any[]>>('/meta/dicts'),
};

export const rbacApi = {
  listRoles: () => request<any[]>('/auth/rbac/roles'),
  listMenus: () => request<any[]>('/auth/rbac/menus'),
  getMatrix: () => request<any[]>('/auth/rbac/matrix'),
  getRoleMenus: (roleId: number) => request<any[]>(`/auth/rbac/role-menus/${roleId}`),
  saveRoleMenus: (roleId: number, perms: any[]) => request(`/auth/rbac/role-menus/${roleId}`, { method: 'POST', body: JSON.stringify(perms) }),
  getUserRoles: (userId: number) => request<any[]>(`/auth/rbac/user-roles/${userId}`),
  saveUserRoles: (userId: number, roleIds: number[]) => request(`/auth/rbac/user-roles/${userId}`, { method: 'POST', body: JSON.stringify(roleIds) }),
};

async function downloadBlob(url: string, filename: string) {
  const token = localStorage.getItem('erp_token');
  const res = await fetch(`${BASE}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('下载失败');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const finApi = {
  listTemplates: () => request<any[]>('/biz/fin/templates'),
  getTemplate: (id: number) => request<any>(`/biz/fin/templates/${id}`),
  uploadTemplate: async (file: File, meta: { name: string; company?: string; category?: string; instanceMode?: string }) => {
    const token = localStorage.getItem('erp_token');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', meta.name);
    if (meta.company) fd.append('company', meta.company);
    if (meta.category) fd.append('category', meta.category);
    fd.append('instanceMode', meta.instanceMode || 'multi');
    const res = await fetch(`${BASE}/biz/fin/templates`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || '上传失败');
    return json;
  },
  listInstances: (templateId: number) => request<any[]>(`/biz/fin/instances?template_id=${templateId}`),
  getInstance: (id: number) => request<any>(`/biz/fin/instances/${id}`),
  createInstance: (body: Record<string, unknown>) => request('/biz/fin/instances', { method: 'POST', body: JSON.stringify(body) }),
  updateInstance: (id: number, body: Record<string, unknown>) => request(`/biz/fin/instances/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteInstance: (id: number) => request(`/biz/fin/instances/${id}`, { method: 'DELETE' }),
  exportInstance: (id: number, filename: string) => downloadBlob(`/biz/fin/instances/${id}/export`, filename),
  downloadBlank: (id: number, filename: string) => downloadBlob(`/biz/fin/templates/${id}/blank`, filename),
  getPerms: (userId: string | number) => request<any[]>(`/biz/fin/perms?user_id=${userId}`),
  savePerms: (userId: string | number, perms: any[]) => request('/biz/fin/perms', { method: 'PUT', body: JSON.stringify({ user_id: userId, perms }) }),
};
