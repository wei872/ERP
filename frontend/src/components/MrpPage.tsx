import { useState } from 'react';
import { bizApi } from '../api';

function fmt(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'; }

export default function MrpPage() {
  const [productCode, setProductCode] = useState('');
  const [qty, setQty] = useState(1);
  const [costCode, setCostCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [cost, setCost] = useState<number | null>(null);
  const [mrpResult, setMrpResult] = useState<string>('');

  const toastFn = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const doMrp = async () => {
    if (!productCode) { toastFn('请填写产品编码'); return; }
    setLoading(true); setCost(null);
    try { await bizApi.mrpCalc(productCode, qty); toastFn('MRP 运算已完成，结果写入 prod_mrp_calc 表'); setMrpResult(`产品 ${productCode} × ${qty} 已运算，净需求/建议采购量/建议生产量已写入 prod_mrp_calc 表，请在"生产模块 > 基础资料 > MRP运算"中查看明细。`); }
    catch (e: any) { toastFn('运算失败: ' + e.message); }
    setLoading(false);
  };

  const doCost = async () => {
    if (!costCode) { toastFn('请填写产品编码'); return; }
    setLoading(true); setMrpResult('');
    try { const r = await bizApi.mrpRollupCost(costCode); setCost(Number(r.data?.cost) || 0); }
    catch (e: any) { toastFn('滚算失败: ' + e.message); }
    setLoading(false);
  };

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1200px] mx-auto">
      {toast && <div className="erp-toast">{toast}</div>}
      <div>
        <h2 className="text-xl font-bold text-gray-800">🧮 MRP 物料需求计划</h2>
        <p className="text-sm text-gray-500 mt-1">按产品净需求运算 + BOM 成本递归滚算</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <h3 className="font-semibold text-gray-800 mb-4">📈 MRP 运算</h3>
          <div className="space-y-3">
            <div><label className="text-xs text-gray-500">产品编码 *</label><input value={productCode} onChange={e=>setProductCode(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
            <div><label className="text-xs text-gray-500">需求数量</label><input type="number" value={qty} onChange={e=>setQty(Number(e.target.value)||1)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
            <button onClick={doMrp} disabled={loading} className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">{loading?'运算中...':'开始运算'}</button>
            {mrpResult && <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">{mrpResult}</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <h3 className="font-semibold text-gray-800 mb-4">🏗️ BOM 成本滚算</h3>
          <div className="space-y-3">
            <div><label className="text-xs text-gray-500">成品编码 *</label><input value={costCode} onChange={e=>setCostCode(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
            <button onClick={doCost} disabled={loading} className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg text-sm disabled:opacity-50">{loading?'滚算中...':'查询成本'}</button>
            {cost !== null && (
              <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="text-xs text-emerald-600">递归 BOM 后的单位成本</div>
                <div className="text-3xl font-bold text-emerald-700 mt-1">¥{fmt(cost)}</div>
                <div className="text-xs text-gray-500 mt-1">基于 prod_bom_structure.qty × unit_price 递归累加</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}