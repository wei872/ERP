import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, ROLE_COLORS, type Permission } from '../types';
import { erpTables } from '../data/mockData';
import { finApi } from '../api';

const ALL_GRANTABLE_MODULES = [...new Set(erpTables.map(t => t.sub))].sort();

export default function UserManagement() {
  const { users, currentUser, approveUser, disableUser, enableUser, deleteUser, updateUserPermissions } = useAuth();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'permissions' | 'pending' | 'finperms'>('list');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localPerms, setLocalPerms] = useState<Permission[]>([]);
  const [finPerms, setFinPerms] = useState<any[]>([]);
  const [finSaved, setFinSaved] = useState(false);

  const subUsers = users.filter(u => u.role !== 'admin');
  const pendingUsers = users.filter(u => u.status === 'pending');
  const selected = users.find(u => u.id === selectedUser) || null;

  const initPerms = (user: typeof selected) => {
    if (!user) return;
    const perms = ALL_GRANTABLE_MODULES.map(sub => {
      const ex = (user.permissions || []).find(p => p.module === sub);
      return ex ? { ...ex } : { module: sub, canView: false, canAdd: false, canEdit: false, canDelete: false };
    });
    setLocalPerms(perms); setSaved(false);
  };

  const getStatusBadge = (st: string) => {
    const m: Record<string, string> = { active: 'bg-emerald-50 text-emerald-700 border-emerald-200', pending: 'bg-amber-50 text-amber-700 border-amber-200', disabled: 'bg-red-50 text-red-700 border-red-200' };
    const l: Record<string, string> = { active: '已激活', pending: '待审核', disabled: '已禁用' };
    return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${m[st] || ''}`}>{l[st] || st}</span>;
  };

  const togglePerm = (mk: string, act: 'canView' | 'canAdd' | 'canEdit' | 'canDelete', val: boolean) => { setLocalPerms(prev => prev.map(p => p.module === mk ? { ...p, [act]: val } : p)); setSaved(false); };

  const savePerms = async () => { if (!selectedUser) return; setSaving(true); try { await updateUserPermissions(selectedUser, localPerms); setSaved(true); setTimeout(() => setSaved(false), 3000); } catch (err: any) { alert('权限保存失败: ' + (err?.message || '未知错误')); }; setSaving(false); };

  const applyTemplate = (mode: 'all' | 'view' | 'add' | 'edit') => { setLocalPerms(ALL_GRANTABLE_MODULES.map(m => ({ module: m, canView: true, canAdd: mode === 'all' || mode === 'add' || mode === 'edit', canEdit: mode === 'all' || mode === 'edit', canDelete: mode === 'all' }))); setSaved(false); };

  const loadFinPerms = async (userId: string) => {
    try {
      const r = await finApi.getPerms(userId);
      setFinPerms(r.data || []);
      setFinSaved(false);
    } catch { setFinPerms([]); }
  };

  const toggleFinPerm = (templateId: number, field: 'can_view' | 'can_download', val: boolean) => {
    setFinPerms(prev => prev.map(p => p.template_id === templateId ? { ...p, [field]: val } : p));
    setFinSaved(false);
  };

  const applyFinTemplate = (mode: 'all_view' | 'all_download' | 'clear') => {
    setFinPerms(prev => prev.map(p => ({
      ...p,
      can_view: mode === 'clear' ? false : true,
      can_download: mode === 'all_download' ? true : mode === 'clear' ? false : p.can_download,
    })));
    setFinSaved(false);
  };

  const saveFinPerms = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await finApi.savePerms(selectedUser, finPerms.map(p => ({
        template_id: p.template_id,
        can_view: !!p.can_view,
        can_download: !!p.can_download,
      })));
      setFinSaved(true);
      setTimeout(() => setFinSaved(false), 3000);
    } catch (err: any) { alert('财务权限保存失败: ' + (err?.message || '未知错误')); }
    setSaving(false);
  };

  if (currentUser?.role !== 'admin') return <div className="p-6"><div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center"><div className="text-4xl mb-3">🔒</div><h3 className="text-lg font-semibold text-red-700">权限不足</h3><p className="text-sm text-red-500 mt-1">用户管理功能仅主账号可使用</p></div></div>;

  return (<div className="p-6 space-y-6 max-w-[1600px] mx-auto erp-fade-in">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold text-gray-800">👤 用户与权限管理</h2><p className="text-sm text-gray-500 mt-1">管理所有副账号，审核注册申请，配置操作权限</p></div><div className="flex gap-3"><div className="bg-white rounded-xl p-3 shadow-sm border text-center min-w-[80px]"><div className="text-lg font-bold text-blue-600">{subUsers.length}</div><div className="text-[10px] text-gray-400">总用户</div></div><div className="bg-white rounded-xl p-3 shadow-sm border text-center min-w-[80px]"><div className="text-lg font-bold text-emerald-600">{users.filter(u => u.status === 'active' && u.role !== 'admin').length}</div><div className="text-[10px] text-gray-400">已激活</div></div><div className="bg-white rounded-xl p-3 shadow-sm border text-center min-w-[80px]"><div className="text-lg font-bold text-amber-600">{pendingUsers.length}</div><div className="text-[10px] text-gray-400">待审核</div></div></div></div>
    <div className="flex gap-2 flex-wrap"><button onClick={() => setActiveTab('list')} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'list' ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}>全部用户 ({subUsers.length})</button><button onClick={() => setActiveTab('pending')} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'pending' ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}>待审核 {pendingUsers.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingUsers.length}</span>}</button>{selected && <button onClick={() => { setActiveTab('permissions'); initPerms(selected); }} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'permissions' ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}>模块权限 - {selected.realName}</button>}{selected && <button onClick={() => { setActiveTab('finperms'); loadFinPerms(selected.id); }} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'finperms' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}>财务模版权限 - {selected.realName}</button>}</div>

    {activeTab === 'pending' && (<div className="space-y-4">{pendingUsers.length === 0 ? <div className="bg-white rounded-xl p-12 shadow-sm border text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-500">暂无待审核用户</p></div> : pendingUsers.map(user => (<div key={user.id} className="bg-white rounded-xl p-5 shadow-sm border border-amber-200 hover:shadow-md transition-all"><div className="flex items-center justify-between"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center text-white text-lg font-bold">{user.realName[0]}</div><div><div className="font-semibold text-gray-800">{user.realName}</div><div className="text-sm text-gray-500">@{user.username} · {user.phone}</div></div><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}>{ROLE_LABELS[user.role]}</span></div><div className="flex items-center gap-2"><button onClick={() => approveUser(user.id)} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-medium rounded-lg shadow-sm">✓ 通过审核</button><button onClick={() => deleteUser(user.id)} className="px-4 py-2 bg-white border text-gray-600 text-sm rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200">拒绝</button></div></div><div className="mt-3 text-xs text-gray-400">注册时间: {user.createdAt}</div></div>))}</div>)}

    {activeTab === 'list' && (<div className="bg-white rounded-xl shadow-sm border overflow-hidden"><table className="w-full"><thead><tr className="bg-gray-50 border-b"><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">用户</th><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">账号</th><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">角色</th><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">部门</th><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">状态</th><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">操作</th></tr></thead><tbody className="divide-y divide-gray-50">{subUsers.map(user => (<tr key={user.id} className="hover:bg-blue-50/30 transition-colors"><td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">{user.realName[0]}</div><span className="font-medium text-gray-800 text-sm">{user.realName}</span></div></td><td className="px-5 py-3 text-sm text-gray-600">{user.username}</td><td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}>{ROLE_LABELS[user.role]}</span></td><td className="px-5 py-3 text-sm text-gray-600">{user.department}</td><td className="px-5 py-3">{getStatusBadge(user.status)}</td><td className="px-5 py-3"><div className="flex gap-2"><button onClick={() => { setSelectedUser(user.id); setActiveTab('permissions'); initPerms(user); }} className="text-xs text-blue-500 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50">权限</button>{user.status === 'active' && <button onClick={() => disableUser(user.id)} className="text-xs text-amber-500 hover:text-amber-700 font-medium px-2 py-1 rounded hover:bg-amber-50">禁用</button>}{user.status === 'disabled' && <button onClick={() => enableUser(user.id)} className="text-xs text-emerald-500 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50">启用</button>}<button onClick={() => setDeleteConfirm(user.id)} className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">删除</button></div></td></tr>))}</tbody></table></div>)}

    {activeTab === 'permissions' && selected && (<div className="space-y-4">
      <div className="bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl p-5 text-white"><div className="flex items-center gap-4"><div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-2xl font-bold">{selected.realName[0]}</div><div><h3 className="text-xl font-bold">{selected.realName}</h3><p className="text-purple-100 text-sm">@{selected.username} · <span className="px-2 py-0.5 rounded-full text-xs bg-white/20">{ROLE_LABELS[selected.role]}</span> · {selected.department}</p></div></div></div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden"><div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between"><h4 className="font-semibold text-gray-800">模块权限配置（所有二级分类）</h4>{saved && <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1 rounded-full">✅ 权限已保存</span>}</div><div className="overflow-x-auto max-h-[50vh] overflow-y-auto"><table className="w-full"><thead className="sticky top-0 bg-white z-10"><tr className="border-b"><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">二级分类</th><th className="px-5 py-3 text-center text-xs font-semibold text-gray-500">查看</th><th className="px-5 py-3 text-center text-xs font-semibold text-gray-500">新增</th><th className="px-5 py-3 text-center text-xs font-semibold text-gray-500">编辑</th><th className="px-5 py-3 text-center text-xs font-semibold text-gray-500">删除</th></tr></thead><tbody className="divide-y divide-gray-50">{localPerms.map(p => (<tr key={p.module} className="hover:bg-gray-50/50"><td className="px-5 py-3 text-sm font-medium text-gray-700">{p.module}</td>{(['canView','canAdd','canEdit','canDelete'] as const).map(action => (<td key={action} className="px-5 py-3 text-center"><label className="inline-flex items-center cursor-pointer"><input type="checkbox" checked={p[action]} onChange={e => togglePerm(p.module, action, e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"/></label></td>))}</tr>))}</tbody></table></div></div>
      <div className="bg-white rounded-xl p-5 shadow-sm border"><h4 className="font-semibold text-gray-800 mb-3">快捷权限模板</h4><div className="flex gap-3 flex-wrap"><button onClick={() => applyTemplate('all')} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-medium rounded-lg shadow-sm">全部开放</button><button onClick={() => applyTemplate('view')} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white text-sm font-medium rounded-lg shadow-sm">仅查看</button><button onClick={() => applyTemplate('add')} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm font-medium rounded-lg shadow-sm">查看+新增</button><button onClick={() => applyTemplate('edit')} className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-medium rounded-lg shadow-sm">查看+新增+编辑</button></div></div>
      <div className="flex justify-end"><button onClick={savePerms} disabled={saving} className="px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-bold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50">{saving ? '⏳ 保存中...' : '💾 保存权限'}</button></div>
    </div>)}

    {activeTab === 'finperms' && selected && (<div className="space-y-4">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-5 text-white"><div className="flex items-center gap-4"><div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-2xl font-bold">{selected.realName[0]}</div><div><h3 className="text-xl font-bold">{selected.realName}</h3><p className="text-emerald-100 text-sm">财务模版权限 · 查看 / 下载 相互独立</p></div></div></div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
          <h4 className="font-semibold text-gray-800">财务模版权限（独立于模块权限）</h4>
          {finSaved && <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1 rounded-full">✅ 已保存</span>}
        </div>
        <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">公司</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">模版名称</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500">查看</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500">下载</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {finPerms.map(p => (
                <tr key={p.template_id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-sm text-gray-500">{p.company}</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-700">{p.name}</td>
                  <td className="px-5 py-3 text-center"><input type="checkbox" checked={!!p.can_view} onChange={e => toggleFinPerm(p.template_id, 'can_view', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"/></td>
                  <td className="px-5 py-3 text-center"><input type="checkbox" checked={!!p.can_download} onChange={e => toggleFinPerm(p.template_id, 'can_download', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"/></td>
                </tr>
              ))}
              {finPerms.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">暂无模版数据，请先执行 database/upgrade.sql</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white rounded-xl p-5 shadow-sm border">
        <h4 className="font-semibold text-gray-800 mb-3">快捷操作</h4>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => applyFinTemplate('all_view')} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white text-sm font-medium rounded-lg shadow-sm">全部可见</button>
          <button onClick={() => applyFinTemplate('all_download')} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-medium rounded-lg shadow-sm">全部可下载</button>
          <button onClick={() => applyFinTemplate('clear')} className="px-4 py-2 bg-white border text-gray-600 text-sm font-medium rounded-lg">清空</button>
        </div>
      </div>
      <div className="flex justify-end"><button onClick={saveFinPerms} disabled={saving} className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold rounded-xl shadow-lg disabled:opacity-50">{saving ? '⏳ 保存中...' : '💾 保存财务模版权限'}</button></div>
    </div>)}

    {deleteConfirm && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}><div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}><div className="text-center"><div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3"><svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></div><h3 className="text-lg font-semibold text-gray-800 mb-2">确认删除用户</h3><p className="text-sm text-gray-500 mb-4">此操作不可撤销</p><div className="flex gap-3 justify-center"><button onClick={() => setDeleteConfirm(null)} className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button><button onClick={() => { deleteUser(deleteConfirm); setDeleteConfirm(null); }} className="px-5 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-sm">确认删除</button></div></div></div></div>)}
  </div>);
}
