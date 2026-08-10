import { useState } from 'react';
import { bizApi } from '../api';
import { useAuth } from '../context/AuthContext';

type Action = 'workorder' | 'warehousing' | 'scrap' | 'requisition' | 'settle';
const ACTIONS: Record<Action, { title: string; icon: string; color: string }> = {
  workorder: { title: '创建工单', icon: '🏭', color: 'bg-blue-500' },
  warehousing: { title: '生产入库', icon: '📦', color: 'bg-emerald-500' },
  scrap: { title: '报废登记', icon: '⚠️', color: 'bg-red-500' },
  requisition: { title: '领料确认', icon: '📋', color: 'bg-amber-500' },
  settle: { title: '成本结算', icon: '💰', color: 'bg-purple-500' },
};

export default function ProductionPage() {
  const { currentUser } = useAuth();
  const canAccess = currentUser?.role === 'admin' || currentUser?.role === 'production' || currentUser?.role === 'warehouse';
  const [action, setAction] = useState<Action>('workorder');
  const [toast, setToast] = useState('');
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const toastFn = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  // workorder
  const [woProduct, setWoProduct] = useState('');
  const [woSpec, setWoSpec] = useState('');
  const [woPlanNo, setWoPlanNo] = useState('');
  const [woQty, setWoQty] = useState(0);
  const [woWorkshop, setWoWorkshop] = useState('默认车间');

  // warehousing
  const [whNo, setWhNo] = useState('');
  const [whQty, setWhQty] = useState(0);
  const [whWarehouse, setWhWarehouse] = useState('默认仓');

  // scrap
  const [scrapNo, setScrapNo] = useState('');
  const [scrapQty, setScrapQty] = useState(0);
  const [scrapReason, setScrapReason] = useState('');

  // requisition
  const [reqNo, setReqNo] = useState('');
  const [reqQty, setReqQty] = useState(0);
  const [reqWh, setReqWh] = useState('默认仓');

  // settle
  const [settleNo, setSettleNo] = useState('');

  const submit = async () => {
    setSaving(true); setResult(null);
    try {
      let r;
      if (action === 'workorder') {
        if (!woProduct) { toastFn('产品编码必填'); setSaving(false); return; }
        r = await bizApi.createWorkOrder({ plan_no: woPlanNo, product_code: woProduct, spec_model: woSpec, plan_qty: woQty, workshop: woWorkshop });
      } else if (action === 'warehousing') {
        if (!whNo) { toastFn('工单号必填'); setSaving(false); return; }
        r = await bizApi.productionWarehousing({ work_order_no: whNo, actual_qty: whQty, warehouse: whWarehouse });
      } else if (action === 'scrap') {
        if (!scrapNo) { toastFn('工单号必填'); setSaving(false); return; }
        await bizApi.productionScrap({ work_order_no: scrapNo, scrap_qty: scrapQty, reason: scrapReason });
        r = { ok: true };
      } else if (action === 'requisition') {
        if (!reqNo) { toastFn('领料单号必填'); setSaving(false); return; }
        await bizApi.confirmRequisition({ req_no: reqNo, actual_qty: reqQty, warehouse: reqWh });
        r = { ok: true };
      } else if (action === 'settle') {
        if (!settleNo) { toastFn('工单号必填'); setSaving(false); return; }
        r = await bizApi.productionSettle(settleNo);
      }
      setResult(r?.data || r);
      toastFn('操作成功');
    } catch (e: any) { toastFn('失败: ' + e.message); }
    setSaving(false);
  };

  if (!canAccess) return <div className="p-12 text-center"><div className="text-5xl mb-3">🔒</div><p className="text-gray-500">仅 admin / production / warehouse 可访问</p></div>;

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1200px] mx-auto">
      {toast && <div className="erp-toast">{toast}</div>}
      <div>
        <h2 className="text-xl font-bold text-gray-800">🏗️ 生产管理</h2>
        <p className="text-sm text-gray-500 mt-1">工单创建 → 生产入库 → 报废登记 → 领料确认 → 成本结算 全生命周期操作</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(Object.keys(ACTIONS) as Action[]).map(k => (
          <button key={k} onClick={()=>{setAction(k); setResult(null);}} className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${action===k?`${ACTIONS[k].color} text-white border-transparent shadow-lg`:'bg-white text-gray-600 hover:bg-gray-50'}`}>
            <span className="text-2xl">{ACTIONS[k].icon}</span>
            <span className="text-xs font-medium">{ACTIONS[k].title}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border max-w-2xl">
        <h3 className="font-semibold text-gray-800 mb-4">{ACTIONS[action].icon} {ACTIONS[action].title}</h3>

        {action === 'workorder' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="产品编码 *"><input value={woProduct} onChange={e=>setWoProduct(e.target.value)} className="input"/></Field>
            <Field label="规格型号"><input value={woSpec} onChange={e=>setWoSpec(e.target.value)} className="input"/></Field>
            <Field label="关联计划单号"><input value={woPlanNo} onChange={e=>setWoPlanNo(e.target.value)} className="input"/></Field>
            <Field label="计划数量"><input type="number" value={woQty} onChange={e=>setWoQty(Number(e.target.value)||0)} className="input"/></Field>
            <Field label="车间"><input value={woWorkshop} onChange={e=>setWoWorkshop(e.target.value)} className="input"/></Field>
          </div>
        )}
        {action === 'warehousing' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="工单号 *"><input value={whNo} onChange={e=>setWhNo(e.target.value)} className="input"/></Field>
            <Field label="实际入库数量"><input type="number" value={whQty} onChange={e=>setWhQty(Number(e.target.value)||0)} className="input"/></Field>
            <Field label="入库仓库"><input value={whWarehouse} onChange={e=>setWhWarehouse(e.target.value)} className="input"/></Field>
          </div>
        )}
        {action === 'scrap' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="工单号 *"><input value={scrapNo} onChange={e=>setScrapNo(e.target.value)} className="input"/></Field>
            <Field label="报废数量"><input type="number" value={scrapQty} onChange={e=>setScrapQty(Number(e.target.value)||0)} className="input"/></Field>
            <Field label="报废原因" className="col-span-2"><input value={scrapReason} onChange={e=>setScrapReason(e.target.value)} className="input"/></Field>
          </div>
        )}
        {action === 'requisition' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="领料单号 *"><input value={reqNo} onChange={e=>setReqNo(e.target.value)} className="input"/></Field>
            <Field label="实际领料数量"><input type="number" value={reqQty} onChange={e=>setReqQty(Number(e.target.value)||0)} className="input"/></Field>
            <Field label="领料仓库"><input value={reqWh} onChange={e=>setReqWh(e.target.value)} className="input"/></Field>
          </div>
        )}
        {action === 'settle' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="工单号 *"><input value={settleNo} onChange={e=>setSettleNo(e.target.value)} className="input"/></Field>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={submit} disabled={saving} className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">{saving?'处理中...':'执行'}</button>
        </div>

        {result && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm">
            <div className="font-semibold text-emerald-700 mb-2">操作结果</div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>

      <style>{`
        .input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.875rem; }
      `}</style>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div>;
}