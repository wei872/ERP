import { createContext, useContext, useState, useEffect, useCallback, type ReactNode, useRef } from 'react';
import { type User, type UserRole, type Permission } from '../types';
import { authApi } from '../api';

interface AuthContextType {
  currentUser: User | null; users: User[]; permissionTick: number; sessionNotice: string;
  login: (username: string, password: string) => Promise<boolean>; logout: () => void; clearSessionNotice: () => void;
  register: (user: Omit<User, 'id' | 'permissions' | 'createdAt' | 'status'>) => Promise<{ success: boolean; message: string }>;
  approveUser: (userId: string) => Promise<void>; disableUser: (userId: string) => Promise<void>;
  enableUser: (userId: string) => Promise<void>; deleteUser: (userId: string) => Promise<void>;
  updateUserPermissions: (userId: string, permissions: Permission[]) => Promise<void>;
  hasPermission: (moduleKey: string, action: 'view' | 'add' | 'edit' | 'delete') => boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
function defaultPerm(module: string): Permission { return { module, canView: true, canAdd: false, canEdit: false, canDelete: false }; }
const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [{ module: 'all', canView: true, canAdd: true, canEdit: true, canDelete: true }],
  sales: [defaultPerm('客户供应商'), defaultPerm('进销存管理'), defaultPerm('报表中心')],
  aftersale: [defaultPerm('售后管理'), defaultPerm('报表中心')],
  warehouse: [defaultPerm('进销存管理'), defaultPerm('报表中心')],
  accounting: [defaultPerm('财务管理'), defaultPerm('会计凭证'), defaultPerm('报表中心')],
  production: [defaultPerm('生产模块'), defaultPerm('质量管理'), defaultPerm('设备管理'), defaultPerm('报表中心')],
  hr: [defaultPerm('人力资源'), defaultPerm('协同办公'), defaultPerm('报表中心')],
  procurement: [defaultPerm('客户供应商'), defaultPerm('进销存管理'), defaultPerm('报表中心')],
};
export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [permissionTick, setPermissionTick] = useState(0);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');
  const clearSessionNotice = useCallback(() => setSessionNotice(''), []);
  // 会话失效（401）全局处理：退出登录并在登录页提示原因
  useEffect(() => {
    const h = (e: Event) => {
      setCurrentUser(null);
      setSessionNotice((e as CustomEvent).detail || '会话已过期，请重新登录');
    };
    window.addEventListener('erp:unauthorized', h);
    return () => window.removeEventListener('erp:unauthorized', h);
  }, []);
  useEffect(() => { const token = localStorage.getItem('erp_token'); if (!token) return; authApi.getMe().then(res => { setBackendAvailable(true); setCurrentUser(mapBackendUser(res.data)); }).catch(() => setBackendAvailable(false)); }, []);
  const isAdminRef = useRef(false); useEffect(() => { isAdminRef.current = currentUser?.role === 'admin'; }, [currentUser]);
  useEffect(() => { if (!backendAvailable || !currentUser) return; const interval = setInterval(async () => {
    // 标签页隐藏时跳过轮询，避免后台标签持续产生请求
    if (document.hidden) return;
    try { const me = await authApi.getMe(); const fresh = mapBackendUser(me.data); setCurrentUser(prev => { if (!prev) return fresh; if (JSON.stringify(prev.permissions) !== JSON.stringify(fresh.permissions)) return fresh; return prev; }); if (isAdminRef.current) { const ul = await authApi.getUsers(); setUsers(ul.data.map(mapBackendUser)); } } catch {} }, 8000); return () => clearInterval(interval); }, [backendAvailable, currentUser]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try { const res = await authApi.login(username, password); localStorage.setItem('erp_token', res.data.token); const u = mapBackendUser(res.data.user); setCurrentUser(u); setBackendAvailable(true); if (u.role === 'admin') authApi.getUsers().then(ul => setUsers(ul.data.map(mapBackendUser))).catch(() => {}); return true; }
    catch { return false; }
  }, []);
  const logout = useCallback(() => { setCurrentUser(null); setUsers([]); localStorage.removeItem('erp_token'); }, []);
  const registerFn = useCallback(async (ud: Omit<User, 'id' | 'permissions' | 'createdAt' | 'status'>) => { try { await authApi.register({ username: ud.username, password: ud.password, role: ud.role, realName: ud.realName, phone: ud.phone || '', email: ud.email || '', department: ud.department || '' }); return { success: true, message: '注册成功' }; } catch (err: any) { return { success: false, message: err.message || '注册失败' }; } }, []);
  const approveUser = useCallback(async (id: string) => { await authApi.approveUser(id); setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'active' } : u)); }, []);
  const disableUser = useCallback(async (id: string) => { await authApi.disableUser(id); setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'disabled' } : u)); }, []);
  const enableUser = useCallback(async (id: string) => { await authApi.enableUser(id); setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'active' } : u)); }, []);
  const deleteUser = useCallback(async (id: string) => { await authApi.deleteUser(id); setUsers(prev => prev.filter(u => u.id !== id)); }, []);
  const updateUserPermissions = useCallback(async (id: string, perms: Permission[]) => { await authApi.updatePermissions(id, perms); setUsers(prev => prev.map(u => u.id === id ? { ...u, permissions: perms } : u)); setPermissionTick(t => t + 1); }, []);
  const hasPermission = useCallback((mk: string, act: 'view' | 'add' | 'edit' | 'delete'): boolean => { if (!currentUser) return false; if (currentUser.role === 'admin') return true; const pm = currentUser.permissions.find(x => x.module === mk || x.module === 'all'); if (!pm) return false; switch (act) { case 'view': return pm.canView === true; case 'add': return pm.canAdd === true; case 'edit': return pm.canEdit === true; case 'delete': return pm.canDelete === true; } }, [currentUser]);
  return <AuthContext.Provider value={{ currentUser, users, permissionTick, sessionNotice, login, logout, clearSessionNotice, register: registerFn, approveUser, disableUser, enableUser, deleteUser, updateUserPermissions, hasPermission }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth inside AuthProvider'); return ctx; }
function mapBackendUser(bu: any): User { return { id: String(bu.id || ''), username: bu.username || '', password: '', role: (bu.role || 'sales') as UserRole, realName: bu.realName || bu.username || '', phone: bu.phone || '', email: bu.email || '', department: bu.department || '', status: bu.status || 'active', permissions: Array.isArray(bu.permissions) ? bu.permissions : (DEFAULT_ROLE_PERMISSIONS as any)[bu.role] || [], createdAt: bu.createdAt || '', approvedBy: bu.approvedBy }; }
