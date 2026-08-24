import { toastNotify } from '../utils/toast';
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { bizApi, dataApi } from '../api';
import { useAuth } from '../context/AuthContext';

const SummaryPanel = lazy(() => import('./SummaryPanel'));

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
  const [showGuide, setShowGuide] = useState(false);
  const [action, setAction] = useState<Action>('workorder');
  const [result, setResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // 动态数据列表
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [scraps, setScraps] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  const toastFn = useCallback((m: string) => toastNotify(m), []);

  // 加载系统现有工单、领料单与报废单列表
  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const woRes = await dataApi.list('prod_work_order', 1, 100, '');
      if (woRes.data?.rows) setWorkOrders(woRes.data.rows);

      const reqRes = await dataApi.list('prod_material_requisition', 1, 100, '');
      if (reqRes.data?.rows) setRequisitions(reqRes.data.rows);

      const scrapRes = await dataApi.list('prod_scrap_main', 1, 100, '');
      if (scrapRes.data?.rows) setScraps(scrapRes.data.rows);
    } catch (e) {
      // 忽略非阻断性加载异常
    }
    setLoadingLists(false);
  }, []);

  useEffect(() => {
    if (canAccess) loadLists();
  }, [canAccess, loadLists]);

  // workorder
  const [woProduct, setWoProduct] = useState('PROD-001');
  const [woSpec, setWoSpec] = useState('V1.0');
  const [woPlanNo, setWoPlanNo] = useState('PLAN-001');
  const [woQty, setWoQty] = useState(100);
  const [woWorkshop, setWoWorkshop] = useState('一车间');

  // warehousing
  const [whNo, setWhNo] = useState('');
  const [whQty, setWhQty] = useState(100);
  const [whWarehouse, setWhWarehouse] = useState('成品仓');

  // scrap
  const [scrapNo, setScrapNo] = useState('');
  const [scrapQty, setScrapQty] = useState(1);
  const [scrapReason, setScrapReason] = useState('工艺边角废料');

  // requisition
  const [reqNo, setReqNo] = useState('');
  const [reqQty, setReqQty] = useState(100);
  const [reqWh, setReqWh] = useState('原材料仓');

  // settle
  const [settleNo, setSettleNo] = useState('');

  // 快捷触发：在表格行上一键填充表单并切换动作
  const triggerWarehousing = (wo: any) => {
    setAction('warehousing');
    setWhNo(wo.work_order_no || '');
    const plan = Number(wo.plan_qty) || 0;
    const actual = Number(wo.actual_qty) || 0;
    const remain = Math.max(0, plan - actual);
    setWhQty(remain > 0 ? remain : plan > 0 ? plan : 100);
    setResult(null);
    toastFn(`已加载工单 [${wo.work_order_no}]，可确认生产入库数量！`);
  };

  const triggerScrap = (wo: any) => {
    setAction('scrap');
    setScrapNo(wo.work_order_no || '');
    setScrapQty(1);
    setResult(null);
    toastFn(`已加载工单 [${wo.work_order_no}]，可填写报废数量与原因！`);
  };

  const triggerSettle = async (woNo: string) => {
    if (!woNo) return;
    setSaving(true); setResult(null);
    try {
      const r = await bizApi.productionSettle(woNo);
      setResult(r.data || r);
      toastFn(`✅ 工单 [${woNo}] 成本结算成功，已自动生成产成品完工凭证！`);
      await loadLists();
    } catch (e: any) {
      toastFn('❌ 结算失败: ' + (e.message || '未知错误'));
    }
    setSaving(false);
  };

  const triggerConfirmReq = async (req: any) => {
    const rNo = req.req_no;
    const q = Number(req.plan_req_qty) || 10;
    if (!rNo) return;
    setSaving(true); setResult(null);
    try {
      await bizApi.confirmRequisition({ req_no: rNo, actual_qty: q, warehouse: req.warehouse || '原材料仓' });
      toastFn(`✅ 领料单 [${rNo}] 扣库确认成功，已自动联动原材料成本凭证！`);
      await loadLists();
    } catch (e: any) {
      toastFn('❌ 领料确认失败: ' + (e.message || '未知错误'));
    }
    setSaving(false);
  };

  const submit = async () => {
    setSaving(true); setResult(null);
    try {
      let r;
      if (action === 'workorder') {
        if (!woProduct) { toastFn('产品编码必填'); setSaving(false); return; }
        r = await bizApi.createWorkOrder({ plan_no: woPlanNo, product_code: woProduct, spec_model: woSpec, plan_qty: woQty, workshop: woWorkshop });
        toastFn(`✅ 工单创建成功！单号：${r?.data?.work_order_no || ''}`);
      } else if (action === 'warehousing') {
        if (!whNo) { toastFn('请选择或填写有效工单号'); setSaving(false); return; }
        r = await bizApi.productionWarehousing({ work_order_no: whNo, actual_qty: whQty, warehouse: whWarehouse });
        toastFn(`✅ 生产入库成功！入库单号：${r?.data?.warehousing_no || ''}`);
      } else if (action === 'scrap') {
        if (!scrapNo) { toastFn('请选择或填写有效工单号'); setSaving(false); return; }
        r = await bizApi.productionScrap({ work_order_no: scrapNo, scrap_qty: scrapQty, reason: scrapReason });
        toastFn(`✅ 报废登记成功！报废单号：${r?.data?.scrap_no || ''}`);
      } else if (action === 'requisition') {
        if (!reqNo) { toastFn('请选择或填写有效领料单号'); setSaving(false); return; }
        await bizApi.confirmRequisition({ req_no: reqNo, actual_qty: reqQty, warehouse: reqWh });
        r = { ok: true, message: '领料确认成功' };
        toastFn('✅ 领料扣库确认成功');
      } else if (action === 'settle') {
        if (!settleNo) { toastFn('请选择或填写有效工单号'); setSaving(false); return; }
        r = await bizApi.productionSettle(settleNo);
        toastFn(`✅ 成本结算完成！单位成本：¥${r?.data?.unit_cost || 0}`);
      }
      setResult(r?.data || r);
      await loadLists();
    } catch (e: any) { toastFn('❌ 操作失败: ' + (e.message || '请检查输入字段')); }
    setSaving(false);
  };

  if (!canAccess) return <div className="p-12 text-center"><div className="text-5xl mb-3">🔒</div><p className="text-gray-500">仅 admin / production / warehouse 可访问</p></div>;

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1350px] mx-auto">

      {/* 工单汇总卡片 + 分析图 */}
      <Suspense fallback={null}><SummaryPanel tableKey="prod_work_order" /></Suspense>

      {/* UI 引导与数据联动说明 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl px-5 py-3 text-white shadow-lg">
        <button onClick={() => setShowGuide(s => !s)} className="w-full flex items-center justify-between text-left">
          <h3 className="font-bold text-sm flex items-center gap-2 text-indigo-300"> <span>💡</span> 生产管理使用指南与后台数据联动说明 </h3>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">工单全生命周期</span>
            <span className="text-indigo-300/70 text-xs">{showGuide ? '▲ 收起' : '▼ 展开'}</span>
          </span>
        </button>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed mt-3 ${showGuide ? '' : 'hidden'}`}>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <span>📝</span> 步骤指引：
            </div>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
              <li>【创建工单】：录入产品编码与数量，系统自动展开 BOM 生成待扣库领料单。</li>
              <li>【领料确认】：在下表直接点击 **`📋 一键扣库确认`** 扣减原材料。</li>
              <li>【生产入库】：在工单列表直接点击 **`📦 生产入库`**，确认成品入库；在【报废登记】中处理残次品。</li>
              <li>【成本结算】：点击 **`💰 成本结算`**，核算产品最终成本并建立完工凭证。</li>
            </ol>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <span>🔄</span> 自动数据联动：
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
              <li>领料确认 ➔ 自动扣减原材料库存，并**生成领料成本凭证（借:5001生产成本 贷:1403原材料）**。</li>
              <li>生产入库 ➔ 自动增加产成品实际库存余额，更新工单已完成数量。</li>
              <li>报废登记 ➔ 实时记录报废单 `prod_scrap_main` 并累加工单 `scrap_qty` 报废量。</li>
              <li>成本结算 ➔ 汇总材料与工序成本更新商品单位成本，**生成完工凭证（借:1405库存商品 贷:5001生产成本）**。</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🏗️ 生产管理 - 工单全生命周期</h2>
          <p className="text-sm text-gray-500 mt-1">工单创建 ➔ 智能 BOM 展算 ➔ 领料确认 ➔ 生产入库 ➔ 报废登记 ➔ 成本结算全联动</p>
        </div>
        <button onClick={loadLists} disabled={loadingLists} className="px-3.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium">
          {loadingLists ? '刷新中...' : '↻ 刷新看板数据'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {(Object.keys(ACTIONS) as Action[]).map(k => (
          <button key={k} onClick={()=>{setAction(k); setResult(null);}} className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${action===k?`${ACTIONS[k].color} text-white border-transparent shadow-md font-semibold`:'bg-white text-gray-600 hover:bg-slate-50 border-slate-200'}`}>
            <span className="text-2xl">{ACTIONS[k].icon}</span>
            <span className="text-xs">{ACTIONS[k].title}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 表单卡片 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 lg:col-span-1 space-y-4">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 border-b border-slate-100 pb-3">
            <span>{ACTIONS[action].icon}</span>
            <span>{ACTIONS[action].title}</span>
          </h3>

          {action === 'workorder' && (
            <div className="space-y-3">
              <Field label="产品编码 *"><input value={woProduct} onChange={e=>setWoProduct(e.target.value)} placeholder="例如: PROD-001" className="input"/></Field>
              <Field label="规格型号"><input value={woSpec} onChange={e=>setWoSpec(e.target.value)} placeholder="规格型号" className="input"/></Field>
              <Field label="关联计划单号"><input value={woPlanNo} onChange={e=>setWoPlanNo(e.target.value)} className="input"/></Field>
              <Field label="计划生产数量"><input type="number" value={woQty} onChange={e=>setWoQty(Number(e.target.value)||0)} className="input"/></Field>
              <Field label="车间"><input value={woWorkshop} onChange={e=>setWoWorkshop(e.target.value)} className="input"/></Field>
            </div>
          )}

          {action === 'warehousing' && (
            <div className="space-y-3">
              <Field label="选择或输入生产工单号 *">
                {workOrders.length > 0 ? (
                  <select value={whNo} onChange={e=>setWhNo(e.target.value)} className="input bg-white">
                    <option value="">-- 请选择当前有效工单 --</option>
                    {workOrders.map(wo => (
                      <option key={wo.work_order_no} value={wo.work_order_no}>
                        {wo.work_order_no} ({wo.product_name || wo.product_code} - 计划{wo.plan_qty}已入{wo.actual_qty})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={whNo} onChange={e=>setWhNo(e.target.value)} placeholder="例如: WO-172327000" className="input"/>
                )}
              </Field>
              <Field label="实际生产入库数量"><input type="number" value={whQty} onChange={e=>setWhQty(Number(e.target.value)||0)} className="input"/></Field>
              <Field label="入库目标仓库"><input value={whWarehouse} onChange={e=>setWhWarehouse(e.target.value)} className="input"/></Field>
            </div>
          )}

          {action === 'scrap' && (
            <div className="space-y-3">
              <Field label="选择或输入工单号 *">
                {workOrders.length > 0 ? (
                  <select value={scrapNo} onChange={e=>setScrapNo(e.target.value)} className="input bg-white">
                    <option value="">-- 请选择报废对应工单 --</option>
                    {workOrders.map(wo => (
                      <option key={wo.work_order_no} value={wo.work_order_no}>
                        {wo.work_order_no} ({wo.product_name || wo.product_code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={scrapNo} onChange={e=>setScrapNo(e.target.value)} placeholder="例如: WO-172327000" className="input"/>
                )}
              </Field>
              <Field label="报废数量"><input type="number" value={scrapQty} onChange={e=>setScrapQty(Number(e.target.value)||0)} className="input"/></Field>
              <Field label="报废原因描述"><input value={scrapReason} onChange={e=>setScrapReason(e.target.value)} className="input"/></Field>
            </div>
          )}

          {action === 'requisition' && (
            <div className="space-y-3">
              <Field label="选择或输入领料单号 *">
                {requisitions.length > 0 ? (
                  <select value={reqNo} onChange={e=>setReqNo(e.target.value)} className="input bg-white">
                    <option value="">-- 请选择待扣库领料单 --</option>
                    {requisitions.map(req => (
                      <option key={req.req_no} value={req.req_no}>
                        {req.req_no} (物料:{req.product_code} - 需{req.plan_req_qty})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={reqNo} onChange={e=>setReqNo(e.target.value)} placeholder="例如: REQ-172327000" className="input"/>
                )}
              </Field>
              <Field label="实际领料扣库数量"><input type="number" value={reqQty} onChange={e=>setReqQty(Number(e.target.value)||0)} className="input"/></Field>
              <Field label="发料扣减仓库"><input value={reqWh} onChange={e=>setReqWh(e.target.value)} className="input"/></Field>
            </div>
          )}

          {action === 'settle' && (
            <div className="space-y-3">
              <Field label="选择或输入需结算工单号 *">
                {workOrders.length > 0 ? (
                  <select value={settleNo} onChange={e=>setSettleNo(e.target.value)} className="input bg-white">
                    <option value="">-- 请选择待结算成本工单 --</option>
                    {workOrders.map(wo => (
                      <option key={wo.work_order_no} value={wo.work_order_no}>
                        {wo.work_order_no} ({wo.product_name || wo.product_code} - 完工量:{wo.actual_qty})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={settleNo} onChange={e=>setSettleNo(e.target.value)} placeholder="例如: WO-172327000" className="input"/>
                )}
              </Field>
            </div>
          )}

          <div className="pt-2">
            <button onClick={submit} disabled={saving} className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all disabled:opacity-50">
              {saving ? '处理中...' : '提交执行'}
            </button>
          </div>

          {result && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200/80 rounded-xl p-3.5 text-xs text-emerald-800 space-y-1">
              <div className="font-bold text-emerald-900">执行结果:</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap overflow-x-auto max-h-40">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* 动态工单、领料单与报废记录实时看板 */}
        <div className="lg:col-span-2 space-y-5">
          {/* 工单看板 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>🏭 现有生产工单列表 (`prod_work_order`)</span>
                <span className="text-xs text-slate-400 font-normal">({workOrders.length} 个)</span>
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>工单号</th>
                    <th>商品</th>
                    <th>计划量</th>
                    <th>实际入库</th>
                    <th>报废数</th>
                    <th>状态</th>
                    <th className="text-center">快捷一键联动</th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-6 text-slate-400">暂无生产工单，点击左侧【创建工单】即可生成</td></tr>
                  ) : (
                    workOrders.slice(0, 6).map(wo => (
                      <tr key={wo.id || wo.work_order_no}>
                        <td className="font-mono text-indigo-600 font-medium">{wo.work_order_no}</td>
                        <td className="font-medium text-slate-800">{wo.product_name || wo.product_code}</td>
                        <td className="tabular-nums">{wo.plan_qty}</td>
                        <td className="tabular-nums font-semibold text-emerald-600">{wo.actual_qty || 0}</td>
                        <td className="tabular-nums text-red-600 font-medium">{wo.scrap_qty || 0}</td>
                        <td>
                          <span className={`erp-badge ${wo.order_status === '已完成' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {wo.order_status || '生产中'}
                          </span>
                        </td>
                        <td className="text-center space-x-1 whitespace-nowrap">
                          <button onClick={() => triggerWarehousing(wo)} className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[11px] font-medium transition-colors">📦 入库</button>
                          <button onClick={() => triggerScrap(wo)} className="px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded text-[11px] font-medium transition-colors">⚠️ 报废</button>
                          <button onClick={() => triggerSettle(wo.work_order_no)} className="px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded text-[11px] font-medium transition-colors">💰 结算</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 领料单看板 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>📋 待扣库领料单列表 (`prod_material_requisition`)</span>
                <span className="text-xs text-slate-400 font-normal">({requisitions.length} 个)</span>
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>领料单号</th>
                    <th>关联工单</th>
                    <th>物料编码</th>
                    <th>计划用量</th>
                    <th>已扣用量</th>
                    <th className="text-center">一键操作</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-6 text-slate-400">暂无领料单，创建工单时若物料有 BOM 会自动展算生成</td></tr>
                  ) : (
                    requisitions.slice(0, 4).map(req => (
                      <tr key={req.id || req.req_no}>
                        <td className="font-mono text-amber-700 font-medium">{req.req_no}</td>
                        <td className="font-mono text-slate-500">{req.ref_work_order}</td>
                        <td className="font-medium text-slate-800">{req.product_code}</td>
                        <td className="tabular-nums">{req.plan_req_qty}</td>
                        <td className="tabular-nums text-emerald-600 font-semibold">{req.actual_req_qty || 0}</td>
                        <td className="text-center">
                          <button onClick={() => triggerConfirmReq(req)} className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded text-[11px] font-medium transition-colors">📋 扣库确认</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 报废登记记录列表看板 */}
          {scraps.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <span>⚠️ 已登记报废记录表 (`prod_scrap_main`)</span>
                  <span className="text-xs text-slate-400 font-normal">({scraps.length} 个)</span>
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="erp-table text-xs">
                  <thead>
                    <tr>
                      <th>报废单号</th>
                      <th>关联工单</th>
                      <th>商品</th>
                      <th>报废数量</th>
                      <th>报废原因</th>
                      <th>登记时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scraps.slice(0, 5).map(sc => (
                      <tr key={sc.id || sc.scrap_no}>
                        <td className="font-mono text-red-600 font-medium">{sc.scrap_no}</td>
                        <td className="font-mono text-slate-600">{sc.work_order_no}</td>
                        <td className="font-medium text-slate-800">{sc.product_name || sc.product_code}</td>
                        <td className="tabular-nums font-bold text-red-600">{sc.scrap_qty}</td>
                        <td className="text-slate-600 max-w-[150px] truncate">{sc.scrap_reason || '-'}</td>
                        <td className="text-slate-400 font-mono text-[11px]">{String(sc.scrap_date || sc.created_at || '-').slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: #6366f1; ring: 2px solid #6366f130; }
      `}</style>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>{children}</div>;
}