import { useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';

export const STATEMENT_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'receivable_no', label: '单号' },
  { key: 'created_at', label: '日期' },
  { key: 'due_date', label: '到期日' },
  { key: 'total_amount', label: '应收金额' },
  { key: 'received_amount', label: '已收款' },
  { key: 'remain_amount', label: '未收余额' },
  { key: 'status', label: '状态' },
];

/** 对账单打印模板设计器：标题 / 公司抬头 / 落款 / 可见列 */
export default function PrintTemplateDesigner({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('客 户 对 账 单');
  const [companyLine, setCompanyLine] = useState('');
  const [footer, setFooter] = useState('如有异议请于 7 个工作日内与我司财务部联系核对。');
  const [fields, setFields] = useState<string[]>(STATEMENT_FIELDS.map(f => f.key));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    bizApi.printTemplateGet('statement').then(r => {
      const d = r.data;
      if (!d) return;
      setTitle(d.title || '客 户 对 账 单');
      setCompanyLine(d.company_line || '');
      setFooter(d.footer || '');
      try {
        const f = JSON.parse(d.fields_json || '[]');
        if (Array.isArray(f) && f.length > 0) setFields(f);
      } catch { /* 保持默认 */ }
    }).catch(() => {});
  }, []);

  const toggleField = (key: string) => {
    setFields(prev => prev.includes(key) ? (prev.length > 2 ? prev.filter(k => k !== key) : prev) : [...STATEMENT_FIELDS.map(f => f.key)].filter(k => prev.includes(k) || k === key));
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await bizApi.printTemplateSave('statement', { title, company_line: companyLine, footer, fields });
      toastNotify('打印模板已保存，立即生效');
      onSaved();
      onClose();
    } catch (e: any) { toastNotify('保存失败：' + (e.message || '')); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[96] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-sm">⚙️ 对账单打印模板设计</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">打印标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="erp-input w-full" />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">公司抬头行（留空则使用当前账套公司名）</label>
            <input value={companyLine} onChange={e => setCompanyLine(e.target.value)} placeholder="例如：三包智联科技有限公司" className="erp-input w-full" />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">落款 / 备注</label>
            <textarea value={footer} onChange={e => setFooter(e.target.value)} rows={2} className="erp-input w-full" />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">可见列（至少保留 2 列）</label>
            <div className="flex flex-wrap gap-2">
              {STATEMENT_FIELDS.map(f => (
                <button key={f.key} onClick={() => toggleField(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${fields.includes(f.key) ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                  {fields.includes(f.key) ? '✓ ' : ''}{f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-400">
            💡 模板保存后立即对"打印对账单"生效；模板存于数据库（所有用户共享），随业务数据一并备份。
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="erp-btn erp-btn-ghost">取消</button>
          <button onClick={doSave} disabled={saving} className="erp-btn erp-btn-primary disabled:opacity-50">{saving ? '保存中...' : '保存模板'}</button>
        </div>
      </div>
    </div>
  );
}
