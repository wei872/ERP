import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';

const GROUP_ICON: Record<string, string> = {
  '生产成本': '🏭', '库存策略': '📦', '信用风控': '💳',
};

/** 系统参数配置中心（v5.31）：业务计算参数统一管理，保存即时生效于工单成本/ABC/信用拦截等计算 */
export default function SysConfigPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    bizApi.configList().then(r => {
      const list = r.data || [];
      setRows(list);
      const e: Record<string, string> = {};
      list.forEach((x: any) => { e[x.config_key] = String(x.config_value ?? ''); });
      setEdits(e);
    }).catch(e2 => setError(e2.message || '加载失败')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (row: any) => {
    const v = String(edits[row.config_key] ?? '').trim();
    if (v === String(row.config_value)) { toastNotify('参数值未变更', 'warn'); return; }
    setBusyKey(row.config_key);
    try {
      const r = await bizApi.configSet({ config_key: row.config_key, config_value: v });
      toastNotify(String(r.data) + `（${row.config_key}: ${row.config_value} → ${v}）`);
      load();
    } catch (e: any) { toastNotify('保存失败：' + (e.message || ''), 'error'); }
    setBusyKey('');
  };

  const groups = [...new Set(rows.map(r => r.group_name || '其他'))];

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-3xl mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #111827, #1f2937 55%, #374151)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-slate-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">⚙️ 系统参数配置中心</h2>
          <p className="text-[11px] md:text-xs text-slate-300 mt-1.5">业务计算参数统一管理 · 保存即时生效（工单成本费率 / ABC 阈值 / 信用拦截开关）· 修改写入审计日志</p>
        </div>
      </div>

      {error && <div className="erp-card p-8 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-sm text-red-500">{error}</p></div>}
      {loading && <div className="p-12 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">参数加载中…</p></div>}

      {!loading && groups.map(g => (
        <div key={g} className="erp-card p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">{GROUP_ICON[g] || '🔧'} {g}</h3>
          <div className="space-y-3">
            {rows.filter(r => (r.group_name || '其他') === g).map(r => (
              <div key={r.config_key} className="border border-slate-100 rounded-xl p-3.5">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{r.config_key}</span>
                  <span className="text-xs text-slate-500 flex-1 min-w-[200px]">{r.description}</span>
                </div>
                <div className="flex gap-2 items-center">
                  {r.config_key === 'credit_block_enabled' ? (
                    <select value={edits[r.config_key] ?? ''} onChange={e => setEdits(p => ({ ...p, [r.config_key]: e.target.value }))} className="erp-input w-40">
                      <option value="true">true（开启拦截）</option>
                      <option value="false">false（关闭拦截）</option>
                    </select>
                  ) : (
                    <input value={edits[r.config_key] ?? ''} onChange={e => setEdits(p => ({ ...p, [r.config_key]: e.target.value }))} className="erp-input w-40 font-mono tabular-nums"/>
                  )}
                  <button onClick={() => save(r)} disabled={busyKey === r.config_key || String(edits[r.config_key] ?? '') === String(r.config_value)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-opacity">
                    {busyKey === r.config_key ? '保存中…' : '保存'}
                  </button>
                  <span className="text-[10px] text-slate-400 ml-auto">更新于 {String(r.updated_at || '').slice(0, 16)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="erp-card p-4 text-[11px] text-slate-500 space-y-1">
        <p>🔒 安全约束：仅管理员可访问；只允许修改已注册参数（防止脏参数污染计算）；数值型参数自动校验格式。</p>
        <p>⚡ 生效范围：人工/制费费率 → 工单成本分析；ABC 阈值 → 库存周转分析页；信用开关 → 销售下单与报价转单拦截。</p>
      </div>
    </div>
  );
}
