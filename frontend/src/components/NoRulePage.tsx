import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';

const KEY_LABELS: Record<string, string> = {
  voucher: '手工凭证号',
  sales: '销售订单号',
  purchase: '采购订单号',
};

/** 单据编号规则：前缀 + 年月 + 流水（按月自动复位），前缀与位数可自定义 */
export default function NoRulePage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string>('');
  const [prefix, setPrefix] = useState('');
  const [seqLen, setSeqLen] = useState(4);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await bizApi.noRuleList(); setRules(r.data || []); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (r: any) => {
    setEditing(r.rule_key);
    setPrefix(r.prefix);
    setSeqLen(Number(r.seq_length) || 4);
  };

  const doSave = async (key: string) => {
    try {
      const r = await bizApi.noRuleSave({ rule_key: key, prefix, seq_length: seqLen });
      toastNotify(String((r as any).data || '规则已保存'));
      setEditing('');
      load();
    } catch (e: any) { toastNotify('保存失败：' + (e.message || '')); }
  };

  const doReset = async (key: string) => {
    if (!confirm('重置该规则的流水号（归零，从 0001 重新计数）？')) return;
    try {
      const r = await bizApi.noRuleReset(key);
      toastNotify(String((r as any).data || '流水已重置'));
      load();
    } catch (e: any) { toastNotify('重置失败：' + (e.message || '')); }
  };

  const sampleNo = (r: any, pfx: string, len: number) => {
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    const next = (Number(r.current_seq) || 0) + 1;
    return `${pfx}${ym}${String(next).padStart(len, '0')}`;
  };

  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[900px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">🔢 单据编号规则</h2>
        <p className="text-sm text-slate-400 mt-1">单据号 = 前缀 + 年月(yyyyMM) + 流水，按月自动复位归零；前缀与位数可自定义</p>
      </div>

      <div className="erp-card overflow-hidden">
        {loading ? (
          <div className="py-14 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">加载中...</p></div>
        ) : rules.length === 0 ? (
          <div className="py-14 text-center">
            <div className="text-4xl mb-3">🔢</div>
            <p className="text-sm text-slate-400">暂无编号规则（执行 upgrade3.sql 后自动生成默认规则）</p>
          </div>
        ) : (
          <table className="erp-table">
            <thead><tr><th>规则</th><th>前缀</th><th>流水位数</th><th>当前流水</th><th>下一编号示例</th><th className="text-center">操作</th></tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.rule_key}>
                  <td className="whitespace-nowrap font-medium text-slate-700">{KEY_LABELS[r.rule_key] || r.rule_name || r.rule_key}</td>
                  <td className="whitespace-nowrap">
                    {editing === r.rule_key
                      ? <input value={prefix} onChange={e => setPrefix(e.target.value)} className="px-2 py-1 border border-indigo-300 rounded-md text-sm w-24 font-mono" />
                      : <span className="font-mono text-indigo-600">{r.prefix}</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {editing === r.rule_key
                      ? <input type="number" value={seqLen} onChange={e => setSeqLen(Number(e.target.value) || 4)} min={2} max={8} className="px-2 py-1 border border-indigo-300 rounded-md text-sm w-16" />
                      : <span className="tabular-nums text-slate-600">{r.seq_length} 位</span>}
                  </td>
                  <td className="whitespace-nowrap tabular-nums text-slate-500">{r.current_seq || 0}</td>
                  <td className="whitespace-nowrap font-mono text-xs text-slate-500">{sampleNo(r, editing === r.rule_key ? prefix : r.prefix, editing === r.rule_key ? seqLen : Number(r.seq_length) || 4)}</td>
                  <td className="text-center whitespace-nowrap">
                    {editing === r.rule_key ? (
                      <>
                        <button onClick={() => doSave(r.rule_key)} className="px-2.5 py-1 text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md mr-1.5 font-medium">保存</button>
                        <button onClick={() => setEditing('')} className="px-2.5 py-1 text-[11px] text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-md">取消</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(r)} className="px-2.5 py-1 text-[11px] text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-md mr-1.5 font-medium">编辑</button>
                        <button onClick={() => doReset(r.rule_key)} className="px-2.5 py-1 text-[11px] text-red-500 bg-red-50 hover:bg-red-100 rounded-md font-medium">重置流水</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="erp-card p-4 text-[11px] text-slate-400 leading-relaxed">
        💡 说明：流水按自然月自动复位（如 202608 → 202609 时归零重计）。手工凭证、报价转销售订单、补货转采购单已接入本规则；
        修改前缀/位数后新单据立即生效，已生成单据不受影响。
      </div>
    </div>
  );
}
