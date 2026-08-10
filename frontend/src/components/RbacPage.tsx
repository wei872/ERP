import { useCallback, useEffect, useState } from 'react';
import { rbacApi } from '../api';
import { useAuth } from '../context/AuthContext';

type Role = { id: number; role_code: string; role_name: string; description: string; status: string };
type Menu = { id: number; menu_code: string; menu_name: string; parent_code: string; module: string; sort: number; status: string };
type RoleMenu = { menu_id: number; menu_code: string; menu_name: string; module: string; can_view: number; can_add: number; can_edit: number; can_delete: number };

const ACTIONS: Array<['can_view'|'can_add'|'can_edit'|'can_delete', string]> = [
  ['can_view', '查看'], ['can_add', '新增'], ['can_edit', '编辑'], ['can_delete', '删除'],
];

export default function RbacPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [roles, setRoles] = useState<Role[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [perms, setPerms] = useState<RoleMenu[]>([]);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toastFn = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); }, []);

  useEffect(() => {
    if (!isAdmin) return;
    rbacApi.listRoles().then(r => { setRoles(r.data || []); if (r.data?.length && selectedRole === null) setSelectedRole(r.data[0].id); }).catch(e => toastFn(e.message));
    rbacApi.listMenus().then(r => setMenus(r.data || [])).catch(e => toastFn(e.message));
  }, [isAdmin]);

  useEffect(() => {
    if (selectedRole == null) return;
    setSaved(false);
    rbacApi.getRoleMenus(selectedRole).then(r => {
      const list = r.data || [];
      const map = new Map<number, RoleMenu>();
      list.forEach((p: any) => map.set(p.menu_id, p));
      const all = menus.map(m => {
        const existing = map.get(m.id);
        return existing || { menu_id: m.id, menu_code: m.menu_code, menu_name: m.menu_name, module: m.module, can_view: 0, can_add: 0, can_edit: 0, can_delete: 0 };
      });
      setPerms(all);
    }).catch(e => toastFn(e.message));
  }, [selectedRole, menus]);

  const toggle = (menuId: number, field: 'can_view'|'can_add'|'can_edit'|'can_delete', val: boolean) => {
    setPerms(prev => prev.map(p => p.menu_id === menuId ? { ...p, [field]: val ? 1 : 0 } : p));
    setSaved(false);
  };

  const save = async () => {
    if (selectedRole == null) return;
    setSaving(true);
    try {
      await rbacApi.saveRoleMenus(selectedRole, perms.map(p => ({ menu_id: p.menu_id, can_view: p.can_view, can_add: p.can_add, can_edit: p.can_edit, can_delete: p.can_delete })));
      setSaved(true); setTimeout(() => setSaved(false), 3000);
      toastFn('RBAC 权限已保存');
    } catch (e: any) { toastFn('保存失败: ' + e.message); }
    setSaving(false);
  };

  const applyTemplate = (mode: 'all' | 'view' | 'clear') => {
    setPerms(prev => prev.map(p => ({
      ...p,
      can_view: mode === 'clear' ? 0 : 1,
      can_add: mode === 'all' ? 1 : 0,
      can_edit: mode === 'all' ? 1 : 0,
      can_delete: mode === 'all' ? 1 : 0,
    })));
    setSaved(false);
  };

  if (!isAdmin) return <div className="p-12 text-center"><div className="text-5xl mb-3">🔒</div><p className="text-gray-500">仅管理员可访问</p></div>;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto erp-fade-in">
      {toast && <div className="erp-toast">{toast}</div>}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🛡️ RBAC 角色权限矩阵</h2>
          <p className="text-sm text-gray-500 mt-1">角色 × 菜单（4 张表：sys_role / sys_menu / sys_role_menu / sys_user_role）— 保存后下次登录生效</p>
        </div>
        <div className="flex gap-3">
          {saved && <span className="px-3 py-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-full">✅ 已保存</span>}
          <button onClick={()=>applyTemplate('all')} className="px-3 py-1.5 text-xs bg-emerald-100 text-emerald-700 rounded-lg">全部开放</button>
          <button onClick={()=>applyTemplate('view')} className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg">仅查看</button>
          <button onClick={()=>applyTemplate('clear')} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg">清空</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {roles.map(r => (
          <button key={r.id} onClick={()=>setSelectedRole(r.id)} className={`px-4 py-2 rounded-lg text-sm border ${selectedRole===r.id?'bg-blue-600 text-white border-blue-600':'bg-white'}`}>
            {r.role_name} <span className="text-xs opacity-60">({r.role_code})</span>
          </button>
        ))}
      </div>

      {selectedRole != null && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">{roles.find(r=>r.id===selectedRole)?.role_name} 的菜单权限（共 {perms.length} 项）</h3>
            <button onClick={save} disabled={saving} className="px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">{saving?'保存中...':'💾 保存权限'}</button>
          </div>
          <div className="overflow-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-xs text-gray-500">模块</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">菜单编码</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500">菜单名称</th>
                  {ACTIONS.map(([k, l]) => <th key={k} className="px-4 py-3 text-center text-xs text-gray-500">{l}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {perms.map(p => (
                  <tr key={p.menu_id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-xs text-gray-500">{p.module}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{p.menu_code}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-700">{p.menu_name}</td>
                    {ACTIONS.map(([k]) => (
                      <td key={k} className="px-4 py-2.5 text-center">
                        <input type="checkbox" checked={p[k] === 1} onChange={e=>toggle(p.menu_id, k, e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"/>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}