import { useState } from 'react';
import { bizApi } from '../api';

type Line = { subject_code: string; subject_name: string; debit_amount: number; credit_amount: number; summary: string };

const PRESET_SUBJECTS: Record<string, string> = {
  '1001': '库存现金', '1002': '银行存款', '1122': '应收账款', '1403': '原材料',
  '2202': '应付账款', '4001': '实收资本', '6001': '主营业务收入', '6601': '销售费用',
};

export default function VoucherPage() {
  const [voucherWord, setVoucherWord] = useState('记');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [lines, setLines] = useState<Line[]>([
    { subject_code: '1001', subject_name: '库存现金', debit_amount: 0, credit_amount: 0, summary: '' },
    { subject_code: '1002', subject_name: '银行存款', debit_amount: 0, credit_amount: 0, summary: '' },
  ]);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  // 从销售/采购单生成
  const [saleId, setSaleId] = useState('');
  const [purchaseId, setPurchaseId] = useState('');

  const toastFn = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const debitTotal = lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0);
  const creditTotal = lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0);
  const balanced = Math.abs(debitTotal - creditTotal) < 0.001 && debitTotal > 0;

  const updateLine = (idx: number, key: keyof Line, val: any) => setLines(prev => {
    const next = [...prev];
    next[idx] = { ...next[idx], [key]: val };
    if (key === 'subject_code' && PRESET_SUBJECTS[val]) next[idx].subject_name = PRESET_SUBJECTS[val];
    return next;
  });
  const addLine = () => setLines(prev => [...prev, { subject_code: '', subject_name: '', debit_amount: 0, credit_amount: 0, summary: '' }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const save = async () => {
    if (!balanced) { toastFn('借贷不平，无法保存'); return; }
    if (!lines.every(l => l.subject_code)) { toastFn('每行科目编码不能为空'); return; }
    setSaving(true);
    try {
      const r = await bizApi.createVoucher(lines, voucherWord, period);
      toastFn(`凭证已生成: ${r.data.voucher_no} 金额 ¥${debitTotal.toLocaleString()}`);
    } catch (e: any) { toastFn('保存失败: ' + e.message); }
    setSaving(false);
  };

  const genFromSale = async () => {
    if (!saleId) { toastFn('请填写销售单 ID'); return; }
    try { await bizApi.voucherFromSale(Number(saleId)); toastFn('已从销售单生成凭证'); setSaleId(''); }
    catch (e: any) { toastFn('生成失败: ' + e.message); }
  };
  const genFromPurchase = async () => {
    if (!purchaseId) { toastFn('请填写采购单 ID'); return; }
    try { await bizApi.voucherFromPurchase(Number(purchaseId)); toastFn('已从采购单生成凭证'); setPurchaseId(''); }
    catch (e: any) { toastFn('生成失败: ' + e.message); }
  };

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1400px] mx-auto">
      {toast && <div className="erp-toast">{toast}</div>}

      {/* UI 引导与数据联动说明 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 text-white shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base flex items-center gap-2 text-indigo-300">
            <span>💡</span> 会计凭证使用指南与后台数据联动说明
          </h3>
          <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">借贷强平衡校验</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <span>📝</span> 步骤指引：
            </div>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
              <li>选择凭证字（如`记`）与会计期间（如 `2026-08`）。</li>
              <li>添加多行借贷明细（录入科目编码、借/贷金额与摘要）。系统自动提示【借方金额 ＝ 贷方金额】。</li>
              <li>校验平衡无误后，点击【保存凭证】完成总账落库。</li>
            </ol>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <span>🔄</span> 自动数据联动：
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
              <li>出库/核销/领料/费用审批通过 ➔ 均已在后台**自动实时生成记账凭证**。</li>
              <li>凭证保存成功 ➔ 实时更新 `account_subject_balance` 科目余额表。</li>
              <li>本页生成的所有凭证 ➔ 实时参与三大财务报表（资产负债/利润/现金流量）计算。</li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-800">📒 会计凭证</h2>
        <p className="text-sm text-gray-500 mt-1">手工录入凭证（借贷必须平衡）+ 从销售/采购单自动生成凭证</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border">
          <h3 className="font-semibold text-gray-800 mb-3">📐 自动生成凭证</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">从销售单生成（借应收/贷收入）</label>
              <div className="flex gap-2 mt-1">
                <input value={saleId} onChange={e=>setSaleId(e.target.value)} placeholder="trade_sales_main.id" className="flex-1 px-3 py-2 border rounded-lg text-sm"/>
                <button onClick={genFromSale} className="px-3 py-2 bg-emerald-500 text-white text-sm rounded-lg">生成</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">从采购单生成（借原材料/贷应付）</label>
              <div className="flex gap-2 mt-1">
                <input value={purchaseId} onChange={e=>setPurchaseId(e.target.value)} placeholder="trade_purchase_main.id" className="flex-1 px-3 py-2 border rounded-lg text-sm"/>
                <button onClick={genFromPurchase} className="px-3 py-2 bg-cyan-500 text-white text-sm rounded-lg">生成</button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border lg:col-span-2">
          <h3 className="font-semibold text-gray-800 mb-3">✍️ 手工录入凭证</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500">凭证字</label>
              <select value={voucherWord} onChange={e=>setVoucherWord(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm">
                <option>记</option><option>收</option><option>付</option><option>转</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">会计期间</label>
              <input type="month" value={period} onChange={e=>setPeriod(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/>
            </div>
            <div className="flex items-end">
              <div className={`text-sm ${balanced?'text-emerald-600':'text-red-500'}`}>
                借 {debitTotal.toLocaleString()} ＝ 贷 {creditTotal.toLocaleString()} {balanced?'✓':'✗ 不平'}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left text-xs text-gray-500">科目编码</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">科目名称</th>
                <th className="px-3 py-2 text-right text-xs text-gray-500">借方</th>
                <th className="px-3 py-2 text-right text-xs text-gray-500">贷方</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">摘要</th>
                <th className="px-2 py-2 w-12"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5"><input value={l.subject_code} onChange={e=>updateLine(i, 'subject_code', e.target.value)} list="subjects" className="w-24 px-2 py-1 border rounded text-xs"/></td>
                    <td className="px-3 py-1.5"><input value={l.subject_name} onChange={e=>updateLine(i, 'subject_name', e.target.value)} className="w-32 px-2 py-1 border rounded text-xs"/></td>
                    <td className="px-3 py-1.5"><input type="number" value={l.debit_amount} onChange={e=>updateLine(i, 'debit_amount', Number(e.target.value)||0)} className="w-24 px-2 py-1 border rounded text-xs text-right"/></td>
                    <td className="px-3 py-1.5"><input type="number" value={l.credit_amount} onChange={e=>updateLine(i, 'credit_amount', Number(e.target.value)||0)} className="w-24 px-2 py-1 border rounded text-xs text-right"/></td>
                    <td className="px-3 py-1.5"><input value={l.summary} onChange={e=>updateLine(i, 'summary', e.target.value)} className="w-40 px-2 py-1 border rounded text-xs"/></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={()=>removeLine(i)} className="text-red-400">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <datalist id="subjects">{Object.entries(PRESET_SUBJECTS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</datalist>

          <div className="flex justify-between mt-4">
            <button onClick={addLine} className="px-3 py-2 text-sm text-blue-600 border rounded-lg">+ 添加行</button>
            <button onClick={save} disabled={saving || !balanced} className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">{saving?'保存中...':'保存凭证'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}