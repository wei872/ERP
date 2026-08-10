export type UserRole = 'admin' | 'sales' | 'aftersale' | 'warehouse' | 'accounting' | 'production' | 'hr' | 'procurement';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '主账号(管理员)', sales: '销售', aftersale: '售后', warehouse: '仓管',
  accounting: '会计', production: '生产', hr: '人事', procurement: '采购',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800', sales: 'bg-blue-100 text-blue-800',
  aftersale: 'bg-orange-100 text-orange-800', warehouse: 'bg-green-100 text-green-800',
  accounting: 'bg-purple-100 text-purple-800', production: 'bg-yellow-100 text-yellow-800',
  hr: 'bg-pink-100 text-pink-800', procurement: 'bg-cyan-100 text-cyan-800',
};

export interface Permission { module: string; canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean; }
export interface User {
  id: string; username: string; password: string; role: UserRole;
  realName: string; phone: string; email: string; department: string;
  status: 'active' | 'pending' | 'disabled'; permissions: Permission[];
  createdAt: string; approvedBy?: string;
}
