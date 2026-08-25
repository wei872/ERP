import { useCallback, useEffect, useState } from 'react';
import { dataApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { refreshMeta } from '../meta/store';
import { toastNotify } from '../utils/toast';

const COLORS = ['green', 'amber', 'red', 'blue', 'gray'] as const;
const COLOR_CLS: Record<string, string> = {
  green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-red-500', blue: 'bg-blue-500', gray: 'bg-slate-400',
};

/** 数据字典可视化维护：字典类型 → 字典项（增删改+颜色） → 列级绑定（仅管理员） */
export default function DictManagePage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [types, setTypes] = useState<any[]>([]);
  const [selType, setSelType] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [binds, setBinds] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null); // {id?, dict_code, item_value, item_label, color, sort_no}
  const [bindEditing, setBindEditing] = useState<any>(null); // {id?, table_name, column_name, dict_code}

  const loadTypes = useCallback(async () => {
    try {
      const r = await dataApi.list('sys_dict_type', 1, 100, '');
      setTypes(r.data?.rows || []);
    } catch (e: any) { toastNotify('字典类型加载失败：' + (e.message || '')); }
  }, []);

  const loadItems = useCallback(async (code: string) => {
    if (!code) { setItems([]); return; }
    try {
      const r = await dataApi.list('sys_dict_item', 1, 200, code);
      setItems((r.data?.rows || []).filter((x: any) => x.dict_code === code).sort((a: any, b: any) => (Number(a.sort_no) || 0) - (Number(b.sort_no) || 0)));
    } catch { setItems([]); }
  }, []);

  const loadBinds = useCallback(async () => {
    try {
      const r = await dataApi.list('sys_dict_column', 1, 200, '');
      setBinds(r.data?.rows || []);
    } catch { setBinds([]); }
  }, []);

  useEffect(() => { loadTypes(); loadBinds(); }, [loadTypes, loadBinds]);
  useEffect(() => { loadItems(selType); }, [selType, loadItems]);

  if (!isAdmin) return <div className="p-16 text-center"><div className="text-5xl mb-3">🔒</div><p className="text-slate-500">数据字典维护仅管理员可操作</p></div>;

  const saveItem = async () => {
    if (!editing) return;
    if (!editing.item_value?.trim() || !editing.item_label?.trim()) { toastNotify('存库值与显示名不能为空', 'warn'); return; }
    try {
      if (editing.id) {
        await dataApi.update('sys_dict_item', Number(editing.id), { item_value: editing.item_value, item_label: editing.item_label, color: editing.color, sort_no: Number(editing.sort_no) || 0 });
        toastNotify('字典项已更新');
      } else {
        await dataApi.create('sys_dict_item', { dict_code: selType, item_value: editing.item_value, item_label: editing.item_label, color: editing.color, sort_no: Number(editing.sort_no) || 0 });
        toastNotify('字典项已新增');
      }
      setEditing(null);
      loadItems(selType);
      refreshMeta();
    } catch (e: any) { toastNotify('保存失败：' + (e.message || '') + '（同一字典内存库值不可重复）'); }
  };

  const delItem = async (id: number) => {
    if (!confirm('删除该字典项？已使用该状态值的数据显示将失去彩色标签。')) return;
    try { await dataApi.delete('sys_dict_item', id); toastNotify('已删除'); loadItems(selType); refreshMeta(); }
    catch (e: any) { toastNotify('删除失败：' + (e.message || '')); }
  };

  const saveBind = async () => {
    if (!bindEditing) return;
    if (!bindEditing.table_name?.trim() || !bindEditing.column_name?.trim() || !bindEditing.dict_code?.trim()) { toastNotify('表名/列名/字典编码均必填', 'warn'); return; }
    try {
      if (bindEditing.id) {
        await dataApi.update('sys_dict_column', Number(bindEditing.id), { table_name: bindEditing.table_name, column_name: bindEditing.column_name, dict_code: bindEditing.dict_code });
        toastNotify('绑定已更新');
      } else {
        await dataApi.create('sys_dict_column', { table_name: bindEditing.table_name, column_name: bindEditing.column_name, dict_code: bindEditing.dict_code });
        toastNotify('绑定已新增');
      }
      setBindEditing(null);
      loadBinds();
      refreshMeta();
    } catch (e: any) { toastNotify('保存失败：' + (e.message || '') + '（同表同列仅可绑定一个字典）'); }
  };

  const delBind = async (id: number) => {
    if (!confirm('解除该列的字典绑定？')) return;
    try { await dataApi.delete('sys_dict_column', id); toastNotify('已解除绑定'); loadBinds(); refreshMeta(); }
    catch (e: any) { toastNotify('删除失败：' + (e.message || '')); }
  };

  const inputCls = 'px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10';

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">📖 数据字典维护</h2>
        <p className="text-sm text-slate-400 mt-1">状态值的彩色标签由字典驱动：字典项定义可选值与颜色，列级绑定决定哪些表列应用；修改后全站即时生效</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* 左：字典类型 */}
        <div className="erp-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">字典类型</h3>
            <span className="text-[11px] text-slate-400">{types.length} 个</span>
          </div>
          <div className="space-y-1.5">
            {types.map(t => (
              <button key={t.id} onClick={() => setSelType(String(t.dict_code))}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${selType === t.dict_code ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 font-medium' : 'border border-transparent text-slate-600 hover:bg-slate-50'}`}>
                <span className="block">{t.dict_name}</span>
                <span className="block font-mono text-[10px] text-slate-400 mt-0.5">{t.dict_code}</span>
              </button>
            ))}
            {types.length === 0 && <p className="text-xs text-slate-400 text-center py-6">暂无字典类型</p>}
          </div>
        </div>

        {/* 右：字典项 */}
        <div className="space-y-4">
          <div className="erp-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">字典项 {!selType && <span className="text-slate-400 font-normal">（左侧选择字典类型）</span>}</h3>
              {selType && <button onClick={() => setEditing({ dict_code: selType, item_value: '', item_label: '', color: 'blue', sort_no: (items.length + 1) * 5 })} className="erp-btn erp-btn-primary">+ 新增字典项</button>}
            </div>
            {editing && (
              <div className="mb-4 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className="text-[11px] text-slate-500 block mb-1">存库值 *</label><input className={inputCls + ' w-full'} value={editing.item_value} onChange={e => setEditing({ ...editing, item_value: e.target.value })} disabled={!!editing.id} placeholder="如：已签收"/></div>
                  <div><label className="text-[11px] text-slate-500 block mb-1">显示名 *</label><input className={inputCls + ' w-full'} value={editing.item_label} onChange={e => setEditing({ ...editing, item_label: e.target.value })} placeholder="如：已签收"/></div>
                  <div><label className="text-[11px] text-slate-500 block mb-1">排序号</label><input type="number" className={inputCls + ' w-full'} value={editing.sort_no} onChange={e => setEditing({ ...editing, sort_no: e.target.value })} /></div>
                  <div><label className="text-[11px] text-slate-500 block mb-1">颜色</label>
                    <div className="flex gap-2 pt-1.5">
                      {COLORS.map(c => <button key={c} onClick={() => setEditing({ ...editing, color: c })} title={c} className={`w-7 h-7 rounded-full ${COLOR_CLS[c]} ${editing.color === c ? 'ring-2 ring-offset-2 ring-indigo-400' : 'opacity-60 hover:opacity-100'} transition-all`} />)}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditing(null)} className="erp-btn erp-btn-ghost">取消</button>
                  <button onClick={saveItem} className="erp-btn erp-btn-primary">保存</button>
                </div>
              </div>
            )}
            {selType ? (
              <div className="space-y-2">
                {items.map(it => (
                  <div key={it.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${COLOR_CLS[it.color] || 'bg-slate-300'}`}></span>
                    <span className="text-sm text-slate-700 font-medium w-28 truncate">{it.item_label}</span>
                    <span className="font-mono text-xs text-slate-400 w-28 truncate">{it.item_value}</span>
                    <span className={`erp-badge ml-auto bg-slate-50 text-slate-500`}>{it.item_label}</span>
                    <span className="text-[10px] text-slate-300 w-10 text-right">#{it.sort_no}</span>
                    <button onClick={() => setEditing({ ...it })} className="px-2 py-1 text-[11px] text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-md">编辑</button>
                    <button onClick={() => delItem(Number(it.id))} className="px-2 py-1 text-[11px] text-red-500 bg-red-50 hover:bg-red-100 rounded-md">删除</button>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-slate-400 text-center py-6">该字典暂无字典项</p>}
              </div>
            ) : <p className="text-xs text-slate-400 text-center py-8">请先在左侧选择一个字典类型</p>}
          </div>

          {/* 列级绑定 */}
          <div className="erp-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">列级绑定（哪张表的哪列应用哪个字典）</h3>
              <button onClick={() => setBindEditing({ table_name: '', column_name: '', dict_code: selType || '' })} className="erp-btn erp-btn-primary">+ 新增绑定</button>
            </div>
            {bindEditing && (
              <div className="mb-4 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label className="text-[11px] text-slate-500 block mb-1">表名 *</label><input className={inputCls + ' w-full font-mono'} value={bindEditing.table_name} onChange={e => setBindEditing({ ...bindEditing, table_name: e.target.value })} placeholder="如：trade_sales_main"/></div>
                  <div><label className="text-[11px] text-slate-500 block mb-1">列名 *</label><input className={inputCls + ' w-full font-mono'} value={bindEditing.column_name} onChange={e => setBindEditing({ ...bindEditing, column_name: e.target.value })} placeholder="如：sales_status"/></div>
                  <div><label className="text-[11px] text-slate-500 block mb-1">字典编码 *</label><input className={inputCls + ' w-full font-mono'} value={bindEditing.dict_code} onChange={e => setBindEditing({ ...bindEditing, dict_code: e.target.value })} placeholder="如：doc.status"/></div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setBindEditing(null)} className="erp-btn erp-btn-ghost">取消</button>
                  <button onClick={saveBind} className="erp-btn erp-btn-primary">保存</button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead><tr><th>表名</th><th>列名</th><th>字典编码</th><th className="text-center">操作</th></tr></thead>
                <tbody>
                  {binds.map(b => (
                    <tr key={b.id}>
                      <td className="font-mono text-xs whitespace-nowrap">{b.table_name}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{b.column_name}</td>
                      <td className="font-mono text-xs whitespace-nowrap text-indigo-600">{b.dict_code}</td>
                      <td className="text-center whitespace-nowrap">
                        <button onClick={() => setBindEditing({ ...b })} className="px-2 py-1 text-[11px] text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-md mr-1.5">编辑</button>
                        <button onClick={() => delBind(Number(b.id))} className="px-2 py-1 text-[11px] text-red-500 bg-red-50 hover:bg-red-100 rounded-md">删除</button>
                      </td>
                    </tr>
                  ))}
                  {binds.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-xs text-slate-400">暂无列级绑定</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
