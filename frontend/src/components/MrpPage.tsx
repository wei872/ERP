import { useState } from 'react';
import { bizApi, dataApi } from '../api';

function fmt(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'; }

export default function MrpPage() {
  const [productCode, setProductCode] = useState('');
  const [qty, setQty] = useState(1);
  const [costCode, setCostCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [cost, setCost] = useState<number | null>(null);
  const [mrpList, setMrpList] = useState<any[]>([]);

  const toastFn = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const loadMrpRows = async () => {
    try {
      const res = await dataApi.list('prod_mrp_calc', 1, 10, '');
      if (res.data?.rows) setMrpList(res.data.rows);
    } catch (ignored) {}
  };

  const doMrp = async () => {
    if (!productCode) { toastFn('请填写产品编码'); return; }
    setLoading(true); setCost(null);
    try {
      await bizApi.mrpCalc(productCode, qty);
      toastFn('MRP 运算已完成，结果已自动生成');
      await loadMrpRows();
    }
    catch (e: any) { toastFn('运算失败: ' + e.message); }
    setLoading(false);
  };

  const doToPurchase = async (calcCode: string) => {
    setLoading(true);
    try {
      const res = await bizApi.mrpToPurchase(calcCode);
      toastFn(`✅ 已自动拉起采购订单: ${res.data?.purchase_no || ''}`);
      await loadMrpRows();
    } catch (e: any) { toastFn('转采购失败: ' + e.message); }
    setLoading(false);
  };

  const doToWorkOrder = async (calcCode: string) => {
    setLoading(true);
    try {
      const res = await bizApi.mrpToWorkOrder(calcCode);
      toastFn(`✅ 已自动拉起生产工单: ${res.data?.work_order_no || ''}`);
      await loadMrpRows();
    } catch (e: any) { toastFn('转工单失败: ' + e.message); }
    setLoading(false);
  };

  const doCost = async () => {
    if (!costCode) { toastFn('请填写产品编码'); return; }
    setLoading(true);
    try { const r = await bizApi.mrpRollupCost(costCode); setCost(Number(r.data?.cost) || 0); }
    catch (e: any) { toastFn('滚算失败: ' + e.message); }
    setLoading(false);
  };

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1200px] mx-auto">
      {toast && <div className="erp-toast">{toast}</div>}
      <div>
        <h2 className="text-xl font-bold text-gray-800">🧮 MRP 物料需求计划</h2>
        <p className="text-sm text-gray-500 mt-1">按产品净需求运算 + 自动拉起采购/生产 + BOM 成本递归滚算</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <h3 className="font-semibold text-gray-800 mb-4">📈 MRP 运算与自动单据拉起</h3>
          <div className="space-y-3">
            <div><label className="text-xs text-gray-500">产品编码 *</label><input value={productCode} onChange={e=>setProductCode(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" placeholder="例如: PROD-001"/></div>
            <div><label className="text-xs text-gray-500">需求数量</label><input type="number" value={qty} onChange={e=>setQty(Number(e.target.value)||1)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
            <button onClick={doMrp} disabled={loading} className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{loading?'运算中...':'开始运算'}</button>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <h3 className="font-semibold text-gray-800 mb-4">🏗️ BOM 成本滚算</h3>
          <div className="space-y-3">
            <div><label className="text-xs text-gray-500">成品编码 *</label><input value={costCode} onChange={e=>setCostCode(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" placeholder="例如: PROD-001"/></div>
            <button onClick={doCost} disabled={loading} className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{loading?'滚算中...':'查询成本'}</button>
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

      {mrpList.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border space-y-4">
          <h3 className="font-semibold text-gray-800 text-base">📋 最近 MRP 运算建议与智能单据联动</h3>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>计算单号</th>
                  <th>物料编码</th>
                  <th>总需求</th>
                  <th>当前库存</th>
                  <th>在途量</th>
                  <th>净需求</th>
                  <th>建议状态</th>
                  <th className="text-center">一键联动操作</th>
                </tr>
              </thead>
              <tbody>
                {mrpList.map((row) => (
                  <tr key={row.id || row.calc_code}>
                    <td className="font-mono text-xs text-gray-600">{row.calc_code}</td>
                    <td className="font-medium text-gray-800">{row.product_code}</td>
                    <td>{row.demand_qty}</td>
                    <td>{row.current_stock}</td>
                    <td>{row.in_transit_qty}</td>
                    <td className="font-bold text-indigo-600">{row.net_demand}</td>
                    <td><span className="erp-badge bg-blue-100 text-blue-700">{row.calc_status || '已运算'}</span></td>
                    <td className="text-center space-x-2">
                      <button onClick={() => doToPurchase(row.calc_code)} disabled={loading} className="px-2.5 py-1 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md font-medium">📦 转采购单</button>
                      <button onClick={() => doToWorkOrder(row.calc_code)} disabled={loading} className="px-2.5 py-1 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md font-medium">🏗️ 转生产单</button>
                    </td>
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