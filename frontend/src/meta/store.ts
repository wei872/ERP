import { useEffect, useState } from 'react';
import { metaApi } from '../api';

/** 元数据前端仓库 —— 真源是后端 /meta（数据库 sys_table_registry + INFORMATION_SCHEMA）。
 *  模块级缓存，多组件共享一次请求；后端 DDL 变更后调用 refreshMeta() 或刷新页面。 */

export interface MetaTable { table: string; cnName: string; module: string; sub: string; sortNo: number }
export interface MetaColumn { name: string; cnName: string; type: string; nullable: boolean }
export interface DictItem { value: string; label: string; color: string }

export interface TableMeta {
  table: string; cnName: string; module: string; sub: string;
  cols: MetaColumn[];
  dicts: Record<string, DictItem[]>;
}

let tablesCache: MetaTable[] | null = null;
let dictsCache: Record<string, DictItem[]> | null = null;
const tableMetaCache = new Map<string, TableMeta>();
let metaPromise: Promise<void> | null = null;

export function loadMeta(): Promise<void> {
  if (metaPromise) return metaPromise;
  metaPromise = Promise.all([metaApi.tables(), metaApi.dicts()])
    .then(([t, d]) => {
      tablesCache = (t.data || []) as MetaTable[];
      dictsCache = (d.data || {}) as Record<string, DictItem[]>;
    })
    .catch(e => { metaPromise = null; throw e; });
  return metaPromise;
}

export function refreshMeta() {
  metaPromise = null; tablesCache = null; dictsCache = null; tableMetaCache.clear();
}

export function getCachedTables(): MetaTable[] { return tablesCache || []; }
export function getCachedDicts(): Record<string, DictItem[]> { return dictsCache || {}; }

export function getModuleTree(): Record<string, Record<string, MetaTable[]>> {
  const tree: Record<string, Record<string, MetaTable[]>> = {};
  for (const t of getCachedTables()) {
    (tree[t.module] = tree[t.module] || {})[t.sub] = tree[t.module][t.sub] || [];
    tree[t.module][t.sub].push(t);
  }
  return tree;
}

/** 表清单 + 字典（菜单/权限用），登录后任意组件可用 */
export function useMeta() {
  const [state, setState] = useState<{ tables: MetaTable[]; dicts: Record<string, DictItem[]>; loading: boolean; error: string }>({
    tables: tablesCache || [], dicts: dictsCache || {}, loading: !tablesCache, error: '',
  });
  useEffect(() => {
    if (tablesCache && dictsCache) return;
    let alive = true;
    loadMeta().then(() => { if (alive) setState({ tables: tablesCache || [], dicts: dictsCache || {}, loading: false, error: '' }); })
      .catch((e: Error) => { if (alive) setState(s => ({ ...s, loading: false, error: e.message })); });
    return () => { alive = false; };
  }, []);
  return state;
}

/** 单表元数据（表格列/字典绑定），按表缓存 */
export function useTableMeta(tableKey: string) {
  const cached = tableMetaCache.get(tableKey);
  const [meta, setMeta] = useState<TableMeta | null>(cached || null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState('');
  useEffect(() => {
    const hit = tableMetaCache.get(tableKey);
    if (hit) { setMeta(hit); setLoading(false); setError(''); return; }
    let alive = true;
    setLoading(true); setError('');
    metaApi.table(tableKey).then(r => {
      if (!alive) return;
      tableMetaCache.set(tableKey, r.data as TableMeta);
      setMeta(r.data as TableMeta); setLoading(false);
    }).catch((e: Error) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [tableKey]);
  return { meta, loading, error };
}

/** 字典颜色 → badge 样式（与后端 sys_dict_item.color 对应） */
export const DICT_COLORS: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-600',
  blue: 'bg-blue-100 text-blue-700',
  gray: 'bg-slate-100 text-slate-600',
};

/** 状态列渲染：字典优先，未绑定字典的回退关键字猜测（存量表兼容） */
export function statusBadgeClass(colName: string, value: unknown, dicts: Record<string, DictItem[]>): string {
  const dict = dicts[colName];
  const v = String(value ?? '');
  if (dict) {
    const item = dict.find(d => d.value === v || d.label === v);
    if (item) return DICT_COLORS[item.color] || DICT_COLORS.blue;
  }
  if (/正常|完成|合格|启用|通过|在线/.test(v)) return DICT_COLORS.green;
  if (/待|草稿/.test(v)) return DICT_COLORS.amber;
  if (/取消|停用|报废|驳回/.test(v)) return DICT_COLORS.red;
  return DICT_COLORS.blue;
}
