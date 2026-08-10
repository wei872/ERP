import { useCallback, useEffect, useMemo, useState } from 'react';
import { finApi } from '../api';
import { useAuth } from '../context/AuthContext';

type Tpl = {
  id: number; code: string; name: string; company: string; category: string;
  instance_mode: string; field_schema: string;
};
type Inst = {
  id: number; template_id: number; title: string; data: string; period?: string;
  created_by?: string; created_at?: string;
};

function parseJson<T>(s: unknown, fallback: T): T {
  if (s == null) return fallback;
  if (typeof s === 'object') return s as T;
  try { return JSON.parse(String(s)) as T; } catch { return fallback; }
}

export default function FinanceTemplate() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<Tpl | null>(null);
  const [instances, setInstances] = useState<Inst[]>([]);
  const [activeInst, setActiveInst] = useState<Inst | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMeta, setUploadMeta] = useState({ name: '', company: '通用', category: 'inventory', instanceMode: 'multi' });

  const toastFn = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await finApi.listTemplates();
      setTemplates(r.data || []);
    } catch (e: any) {
      setError(e.message || '加载模版失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const schema = useMemo(() => parseJson<any>(selectedTpl?.field_schema, { type: 'form' }), [selectedTpl]);

  const selectTemplate = async (tpl: Tpl) => {
    setSelectedTpl(tpl);
    setActiveInst(null);
    setFormData({});
    setTitle('');
    setPeriod('');
    setLoading(true);
    try {
      const r = await finApi.listInstances(tpl.id);
      const list = r.data || [];
      setInstances(list);
      if (tpl.instance_mode === 'single') {
        if (list.length > 0) openInstance(list[0], tpl);
        else {
          setTitle(tpl.name);
          setFormData(emptyData(parseJson(tpl.field_schema, { type: 'form' })));
        }
      }
    } catch (e: any) {
      toastFn(e.message || '加载实例失败');
    }
    setLoading(false);
  };

  const openInstance = (inst: Inst, tpl?: Tpl) => {
    setActiveInst(inst);
    setTitle(inst.title || '');
    setPeriod(inst.period || '');
    setFormData(parseJson(inst.data, emptyData(parseJson((tpl || selectedTpl)?.field_schema, { type: 'form' }))));
  };

  const emptyData = (sc: any) => {
    if (sc?.type === 'grid') return { rows: [] };
    const scalars: Record<string, any> = {};
    (sc?.scalars || []).forEach((s: any) => { scalars[s.key] = ''; });
    const data: any = { scalars };
    if (sc?.detail) data.detail = [];
    if (sc?.fixedRows) {
      const fr: Record<string, number> = {};
      (sc.fixedRows.rows || []).forEach((r: any) => { fr[r.key] = 0; });
      data.fixedRows = fr;
    }
    return data;
  };

  const newInstance = () => {
    if (!selectedTpl) return;
    setActiveInst(null);
    setTitle(selectedTpl.name + ' - 新建');
    setPeriod('');
    setFormData(emptyData(schema));
  };

  const save = async () => {
    if (!selectedTpl) return;
    setLoading(true);
    try {
      const body = { template_id: selectedTpl.id, title: title || selectedTpl.name, period, data: formData };
      let r;
      if (activeInst) r = await finApi.updateInstance(activeInst.id, body);
      else r = await finApi.createInstance(body);
      toastFn('保存成功');
      const list = await finApi.listInstances(selectedTpl.id);
      setInstances(list.data || []);
      if (r.data) openInstance(r.data, selectedTpl);
    } catch (e: any) {
      toastFn(e.message || '保存失败');
    }
    setLoading(false);
  };

  const remove = async (id: number) => {
    if (!selectedTpl) return;
    if (!confirm('确认删除该实例？')) return;
    setLoading(true);
    try {
      await finApi.deleteInstance(id);
      toastFn('已删除');
      const list = await finApi.listInstances(selectedTpl.id);
      setInstances(list.data || []);
      if (activeInst?.id === id) { setActiveInst(null); setFormData(emptyData(schema)); }
    } catch (e: any) {
      toastFn(e.message || '删除失败');
    }
    setLoading(false);
  };

  const doExport = async () => {
    if (!activeInst) { toastFn('请先保存实例'); return; }
    try {
      await finApi.exportInstance(activeInst.id, `${title || '财务表单'}.xlsx`);
      toastFn('开始下载');
    } catch (e: any) {
      toastFn(e.message || '下载失败');
    }
  };

  const doUpload = async () => {
    if (!uploadFile || !uploadMeta.name) { toastFn('请填写名称并选择文件'); return; }
    setLoading(true);
    try {
      await finApi.uploadTemplate(uploadFile, uploadMeta);
      toastFn('上传成功');
      setUploadOpen(false);
      setUploadFile(null);
      await loadTemplates();
    } catch (e: any) {
      toastFn(e.message || '上传失败');
    }
    setLoading(false);
  };

  const grouped = useMemo(() => {
    const g: Record<string, Tpl[]> = {};
    for (const t of templates) {
      const k = t.company || '通用';
      if (!g[k]) g[k] = [];
      g[k].push(t);
    }
    return g;
  }, [templates]);

  const setScalar = (key: string, val: any) => setFormData((p: any) => ({ ...p, scalars: { ...(p.scalars || {}), [key]: val } }));
  const setFixed = (key: string, val: any) => setFormData((p: any) => ({ ...p, fixedRows: { ...(p.fixedRows || {}), [key]: val } }));
  const setDetailCell = (idx: number, key: string, val: any) => setFormData((p: any) => {
    const detail = [...(p.detail || [])];
    detail[idx] = { ...(detail[idx] || {}), [key]: val };
    return { ...p, detail };
  });
  const addDetail = () => setFormData((p: any) => {
    const fields = schema?.detail?.fields || [];
    const row: Record<string, any> = {};
    fields.forEach((f: any) => { row[f.key] = f.kind === 'number' ? 0 : ''; });
    return { ...p, detail: [...(p.detail || []), row] };
  });
  const removeDetail = (idx: number) => setFormData((p: any) => ({ ...p, detail: (p.detail || []).filter((_: any, i: number) => i !== idx) }));

  const setGridCell = (idx: number, key: string, val: any) => setFormData((p: any) => {
    const rows = [...(p.rows || [])];
    rows[idx] = { ...(rows[idx] || {}), [key]: val };
    return { ...p, rows };
  });
  const addGridRow = () => setFormData((p: any) => {
    const row: Record<string, any> = {};
    (schema.columns || []).forEach((c: any) => { row[c.key] = c.kind === 'number' ? 0 : ''; });
    return { ...p, rows: [...(p.rows || []), row] };
  });
  const removeGridRow = (idx: number) => setFormData((p: any) => ({ ...p, rows: (p.rows || []).filter((_: any, i: number) => i !== idx) }));

  if (error) return <div className="p-12 text-center text-red-500">{error}</div>;

  return (
    <div className="flex h-full min-h-[calc(100vh-64px)] erp-fade-in">
      {toast && <div className="erp-toast">{toast}</div>}
      <aside className="w-72 border-r bg-white overflow-y-auto shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">财务模版</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">{templates.length} 个模版</p>
          </div>
          {isAdmin && (
            <button onClick={() => setUploadOpen(true)} className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">+ 上传</button>
          )}
        </div>
        {Object.entries(grouped).map(([company, list]) => (
          <div key={company} className="py-2">
            <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{company}</div>
            {list.map(t => (
              <button key={t.id} onClick={() => selectTemplate(t)}
                className={`w-full text-left px-4 py-2 text-xs transition-all ${selectedTpl?.id === t.id ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-500' : 'text-gray-600 hover:bg-gray-50'}`}>
                <div className="font-medium">{t.name}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{t.category} · {t.instance_mode === 'single' ? '单实例' : '多实例'}</div>
              </button>
            ))}
          </div>
        ))}
        {templates.length === 0 && !loading && (
          <div className="p-6 text-center text-xs text-gray-400">暂无可见模版<br/>请管理员分配权限</div>
        )}
      </aside>

      <main className="flex-1 overflow-auto p-6 bg-gray-50 space-y-4">
        {/* UI 引导与数据联动说明 */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 text-white shadow-lg space-y-3 max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base flex items-center gap-2 text-indigo-300">
              <span>💡</span> 财务模版库使用指南与 Excel 转换说明
            </h3>
            <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">完整样式与公式保留</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
            <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                <span>📝</span> 步骤指引：
              </div>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
                <li>左侧选择模版分类与具体的 Excel 模版（如`付款申请表`或`费用报销表`）。</li>
                <li>在右侧表单或网格中录入数据，点击 **【保存】** 存入数据库实例。</li>
                <li>点击 **【下载 xlsx】**，下载全保留原始公式与格式的 Excel 文件！</li>
              </ol>
            </div>
            <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <span>🔄</span> 自动数据联动：
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
                <li>金额录入 ➔ 自动联动大写金额转化（如 RMB `12,345.00` 自动生成 `壹万贰仟叁佰肆拾伍元整`）。</li>
                <li>在线保存 ➔ 数据同步写入 `fin_instance`，支持按人员/角色分配模版查阅与导出权限。</li>
              </ul>
            </div>
          </div>
        </div>

        {!selectedTpl ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">请选择左侧模版</div>
        ) : (
          <div className="space-y-4 max-w-6xl mx-auto">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{selectedTpl.name}</h2>
                <p className="text-xs text-gray-400">{selectedTpl.company} · {selectedTpl.code}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {selectedTpl.instance_mode === 'multi' && (
                  <button onClick={newInstance} className="px-3 py-2 text-xs bg-white border rounded-lg hover:bg-gray-50">+ 新建实例</button>
                )}
                <button onClick={save} disabled={loading} className="px-3 py-2 text-xs bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg disabled:opacity-50">保存</button>
                <button onClick={doExport} className="px-3 py-2 text-xs bg-emerald-500 text-white rounded-lg">下载 xlsx</button>
                {isAdmin && (
                  <button onClick={() => finApi.downloadBlank(selectedTpl.id, `${selectedTpl.name}-空白.xlsx`).then(() => toastFn('空白模版下载中')).catch((e: any) => toastFn(e.message))}
                    className="px-3 py-2 text-xs bg-white border rounded-lg">空白模版</button>
                )}
              </div>
            </div>

            {selectedTpl.instance_mode === 'multi' && instances.length > 0 && (
              <div className="bg-white rounded-xl border p-3">
                <div className="text-xs font-semibold text-gray-500 mb-2">实例列表</div>
                <div className="flex flex-wrap gap-2">
                  {instances.map(inst => (
                    <div key={inst.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${activeInst?.id === inst.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200'}`}>
                      <button onClick={() => openInstance(inst)}>{inst.title}</button>
                      <button onClick={() => remove(inst.id)} className="text-red-400 hover:text-red-600">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">标题</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">期间（可选）</label>
                  <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="如 2026-06" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>

              {schema.type === 'grid' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        {(schema.columns || []).map((c: any) => <th key={c.key} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{c.label}</th>)}
                        <th className="px-2 py-2 w-16">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(formData.rows || []).map((row: any, idx: number) => (
                        <tr key={idx} className="border-b">
                          {(schema.columns || []).map((c: any) => (
                            <td key={c.key} className="px-1 py-1">
                              <input type={c.kind === 'number' ? 'number' : 'text'} value={row[c.key] ?? ''}
                                onChange={e => setGridCell(idx, c.key, c.kind === 'number' ? Number(e.target.value) : e.target.value)}
                                className="w-full min-w-[80px] px-2 py-1 border rounded" />
                            </td>
                          ))}
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => removeGridRow(idx)} className="text-red-400">删</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={addGridRow} className="mt-2 text-xs text-blue-600">+ 添加行</button>
                </div>
              )}

              {schema.type === 'form' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(schema.scalars || []).map((s: any) => (
                      <div key={s.key}>
                        <label className="text-xs text-gray-500">{s.label}</label>
                        <input type={s.kind === 'number' ? 'number' : s.kind === 'date' ? 'date' : 'text'}
                          value={(formData.scalars || {})[s.key] ?? ''}
                          onChange={e => setScalar(s.key, s.kind === 'number' ? Number(e.target.value) : e.target.value)}
                          className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                      </div>
                    ))}
                  </div>

                  {schema.detail && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-600">明细行</div>
                        <button onClick={addDetail} className="text-xs text-blue-600">+ 添加明细</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              {(schema.detail.fields || []).map((f: any) => <th key={f.key} className="px-2 py-2 text-left">{f.label}</th>)}
                              <th className="w-12">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(formData.detail || []).map((row: any, idx: number) => (
                              <tr key={idx} className="border-b">
                                {(schema.detail.fields || []).map((f: any) => (
                                  <td key={f.key} className="px-1 py-1">
                                    <input type={f.kind === 'number' ? 'number' : 'text'} value={row[f.key] ?? ''}
                                      onChange={e => setDetailCell(idx, f.key, f.kind === 'number' ? Number(e.target.value) : e.target.value)}
                                      className="w-full min-w-[70px] px-2 py-1 border rounded" />
                                  </td>
                                ))}
                                <td className="text-center"><button onClick={() => removeDetail(idx)} className="text-red-400">删</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {schema.fixedRows && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(schema.fixedRows.rows || []).map((r: any) => (
                        <div key={r.key} className="flex items-center gap-3">
                          <label className="text-xs text-gray-600 w-40 shrink-0">{r.label}</label>
                          <input type="number" value={(formData.fixedRows || {})[r.key] ?? 0}
                            onChange={e => setFixed(r.key, Number(e.target.value))}
                            className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {uploadOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setUploadOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800">上传财务模版</h3>
            <input type="text" placeholder="模版名称" value={uploadMeta.name} onChange={e => setUploadMeta(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <select value={uploadMeta.company} onChange={e => setUploadMeta(p => ({ ...p, company: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="通用">通用</option><option value="川蓉">川蓉</option><option value="成博">成博</option><option value="众一衡">众一衡</option>
            </select>
            <select value={uploadMeta.category} onChange={e => setUploadMeta(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="inventory">库存</option><option value="payment">付款</option><option value="expense">报销</option>
            </select>
            <select value={uploadMeta.instanceMode} onChange={e => setUploadMeta(p => ({ ...p, instanceMode: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="multi">多实例</option><option value="single">单实例</option>
            </select>
            <input type="file" accept=".xlsx" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="w-full text-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setUploadOpen(false)} className="px-4 py-2 text-sm text-gray-600">取消</button>
              <button onClick={doUpload} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">上传</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
