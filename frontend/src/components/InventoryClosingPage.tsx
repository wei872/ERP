import { useState, useEffect, useCallback } from 'react';
import { bizApi, dataApi } from '../api';
import { useAuth } from '../context/AuthContext';

function fmt(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'; }

export default function InventoryClosingPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [tab, setTab] = useState<'stock' | 'close'>('stock');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  // 库存直调表单
  const [ioType, setIoType] = useState<'in' | 'out'>('in');
  const [productCode, setProductCode] = useState('PROD-001');
  const [productName, setProductName] = useState('智能控制器');
  const [specModel, setSpecModel] = useState('V2.0');
  const [warehouse, setWarehouse] = useState('默认仓');
  const [qty, setQty] = useState(10);
  const [unitCost, setUnitCost] = useState(94.00);

  // 进销存全景数据
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [stockLogs, setStockLogList] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // 月结/年结
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [closeResult, setCloseResult] = useState<string>('');

  const toastFn = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); }, []);

  // 全量加载进销存与交易图景数据
  const loadPanoramicData = useCallback(async () => {
    setLoadingData(true);
    try {
      // 1. 库存余额与预警
      const invRes = await dataApi.list('trade_inventory_balance', 1, 100, '');
      if (invRes.data?.rows) setInventoryList(invRes.data.rows);

      // 2. 出入库变动日志
      const logRes = await dataApi.list('trade_stock_log', 1, 50, '');
      if (logRes.data?.rows) setStockLogList(logRes.data.rows);

      // 3. 销售订单与出库关系
      const salesRes = await dataApi.list('trade_sales_main', 1, 50, '');
      if (salesRes.data?.rows) setSalesOrders(salesRes.data.rows);

      // 4. 采购订单与入库关系
      const purRes = await dataApi.list('trade_purchase_main', 1, 50, '');
      if (purRes.data?.rows) setPurchaseOrders(purRes.data.rows);
    } catch (e) {
      // 忽略非阻断异常
    }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadPanoramicData();
  }, [isAdmin, loadPanoramicData]);

  const submitStock = async () => {
    if (!productCode) { toastFn('产品编码必填'); return; }
    if (qty <= 0) { toastFn('数量必须大于 0'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { product_code: productCode, product_name: productName, spec_model: specModel, warehouse, qty, unit_cost: unitCost };
      if (ioType === 'in') await bizApi.stockIn(body);
      else await bizApi.stockOut(body);
      toastFn(`✅ 库存${ioType === 'in' ? '直调入库' : '直调出库'}成功！数据与日志已实时同步`);
      setQty(0);
      await loadPanoramicData();
    } catch (e: any) { toastFn('❌ 失败: ' + (e.message || '系统错误')); }
    setSaving(false);
  };

  const doMonthClose = async () => {
    if (!confirm(`确认对期间 ${period} 执行月结？此操作将自动清零损益科目并结转本年利润。`)) return;
    setSaving(true);
    try { await bizApi.monthClose(period); setCloseResult(`期间 ${period} 月结完成，已自动转入本年利润！`); toastFn('✅ 月结处理完成'); }
    catch (e: any) { toastFn('❌ 月结失败: ' + e.message); }
    setSaving(false);
  };

  const doYearClose = async () => {
    if (!confirm(`确认对 ${year} 年执行年结？此操作将结转本年利润至未分配利润。`)) return;
    setSaving(true);
    try { await bizApi.yearClose(year); setCloseResult(`${year} 年年结完成，已初始化下期期初！`); toastFn('✅ 年结处理完成'); }
    catch (e: any) { toastFn('❌ 年结失败: ' + e.message); }
    setSaving(false);
  };

  if (!isAdmin) return <div className="p-12 text-center"><div className="text-5xl mb-3">🔒</div><p className="text-gray-500">仅管理员可访问库存与关账控制台</p></div>;

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1400px] mx-auto">
      {toast && <div className="erp-toast">{toast}</div>}

      {/* UI 引导与数据联动说明 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 text-white shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base flex items-center gap-2 text-indigo-300">
            <span>💡</span> 进销存与出入库交易全图景监控中心说明
          </h3>
          <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">全链路 100% 实时穿透联动</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <span>📝</span> 进销存与出入库场景操作步骤：
            </div>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
              <li>【销售与出库联动】：在销售订单中产生订单后，点击 **`🚚 出库`**，系统采用排他锁扣减库存并自动结转销售成本凭证(6401/1405)。</li>
              <li>【采购与入库联动】：在采购订单中点击 **`📦 入库`**，系统按加权平均法重算存货成本并更新商品主表与到货状态。</li>
              <li>【盘点直调与结账】：在下方进行盘点调账，月末输入期间点击【月结处理】完成损益科目自动冲销。</li>
            </ol>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <span>🔄</span> 全图景可视化与数据一致性：
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
              <li>**什么时候出库/入库了多少** ➔ 参见下表 `trade_stock_log` 出入库全量流水日志。</li>
              <li>**谁销售了多少与出库的关系** ➔ 参见下表 `trade_sales_main` 业务员对应销售额与发货出库状态。</li>
              <li>**库存还剩多少与预警线** ➔ 参见下表 `trade_inventory_balance` 实际库存 (`qty`) 与最低预警线 (`min_stock`)。</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🛠️ 进销存全景看板 & 期末结账</h2>
          <p className="text-sm text-gray-500 mt-1">展示出入库时间、出入库数量、操作人、销售与出库关系、库存预警线全图景</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadPanoramicData} disabled={loadingData} className="px-3.5 py-1.5 text-xs bg-white border rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium">
            {loadingData ? '加载中...' : '↻ 刷新全景看板'}
          </button>
          <button onClick={()=>setTab('stock')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab==='stock'?'bg-indigo-600 text-white shadow-md':'bg-white border'}`}>进销存直调与看板</button>
          <button onClick={()=>setTab('close')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab==='close'?'bg-indigo-600 text-white shadow-md':'bg-white border'}`}>期末月结/年结</button>
        </div>
      </div>

      {tab === 'stock' && (
        <div className="space-y-6">
          {/* 盘点直调表单 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 max-w-2xl">
            <h3 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2">
              <span>🔧</span>
              <span>盘点快速调账（库存直接调增/调减）</span>
            </h3>
            <div className="flex gap-2 mb-4">
              <button onClick={()=>setIoType('in')} className={`px-4 py-2 rounded-xl text-xs font-semibold ${ioType==='in'?'bg-emerald-600 text-white shadow-md':'bg-slate-100 text-slate-600'}`}>📥 盘点调增 (入库)</button>
              <button onClick={()=>setIoType('out')} className={`px-4 py-2 rounded-xl text-xs font-semibold ${ioType==='out'?'bg-red-500 text-white shadow-md':'bg-slate-100 text-slate-600'}`}>📤 盘点调减 (出库)</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs font-medium text-slate-500">商品编码 *</label><input value={productCode} onChange={e=>setProductCode(e.target.value)} placeholder="例如: PROD-001" className="input"/></div>
              <div><label className="text-xs font-medium text-slate-500">商品名称</label><input value={productName} onChange={e=>setProductName(e.target.value)} className="input"/></div>
              <div><label className="text-xs font-medium text-slate-500">规格型号</label><input value={specModel} onChange={e=>setSpecModel(e.target.value)} className="input"/></div>
              <div><label className="text-xs font-medium text-slate-500">调账仓库</label><input value={warehouse} onChange={e=>setWarehouse(e.target.value)} className="input"/></div>
              <div><label className="text-xs font-medium text-slate-500">调账数量</label><input type="number" value={qty} onChange={e=>setQty(Number(e.target.value)||0)} className="input font-mono"/></div>
              {ioType === 'in' && <div className="col-span-2"><label className="text-xs font-medium text-slate-500">单位成本 (¥)</label><input type="number" value={unitCost} onChange={e=>setUnitCost(Number(e.target.value)||0)} className="input font-mono"/></div>}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={submitStock} disabled={saving} className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-semibold shadow-md disabled:opacity-50">
                {saving ? '处理中...' : `确认执行 ${ioType==='in'?'入库':'出库'} ${qty} 件`}
              </button>
            </div>
          </div>

          {/* 实时库存余额与预警线看板 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">📦 当前库存余额与最低预警线监控 (`trade_inventory_balance`)</span>
              <span className="text-xs text-slate-400 font-normal">共 {inventoryList.length} 项商品存货</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>商品编码</th>
                    <th>商品名称</th>
                    <th>仓库</th>
                    <th>当前剩余库存</th>
                    <th>最低预警线 (min_stock)</th>
                    <th>单位成本</th>
                    <th>库存总金额</th>
                    <th>库存状态</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryList.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-6 text-slate-400">暂无库存数据</td></tr>
                  ) : (
                    inventoryList.slice(0, 8).map((inv) => {
                      const curQ = Number(inv.qty) || 0;
                      const minQ = Number(inv.min_stock) || 10;
                      const isAlert = curQ <= minQ;
                      return (
                        <tr key={inv.id || inv.product_code}>
                          <td className="font-mono text-indigo-600 font-medium">{inv.product_code}</td>
                          <td className="font-medium text-slate-800">{inv.product_name}</td>
                          <td className="text-slate-600">{inv.warehouse}</td>
                          <td className={`font-bold tabular-nums ${isAlert ? 'text-red-600' : 'text-emerald-700'}`}>{curQ}</td>
                          <td className="tabular-nums font-mono text-slate-500">{minQ}</td>
                          <td className="font-mono text-slate-600">¥{fmt(inv.unit_cost)}</td>
                          <td className="font-mono font-semibold text-slate-800">¥{fmt(inv.total_value)}</td>
                          <td>
                            <span className={`erp-badge ${isAlert ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {isAlert ? '⚠️ 低于预警线' : '正常'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 销售与出库履约关系看板 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">🚚 销售者与销售订单/出库发货关系 (`trade_sales_main`)</span>
              <span className="text-xs text-slate-400 font-normal">最近 {salesOrders.length} 笔销售履约</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>销售单号</th>
                    <th>销售者 / 业务员</th>
                    <th>客户名称</th>
                    <th>销售总金额</th>
                    <th>销售日期</th>
                    <th>发货出库状态</th>
                    <th>对应出库动作</th>
                  </tr>
                </thead>
                <tbody>
                  {salesOrders.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-6 text-slate-400">暂无销售订单记录</td></tr>
                  ) : (
                    salesOrders.slice(0, 6).map((so) => (
                      <tr key={so.id || so.sales_no}>
                        <td className="font-mono text-blue-600 font-medium">{so.sales_no}</td>
                        <td className="font-semibold text-slate-800">{so.sales_person || '业务员'}</td>
                        <td className="text-slate-700">{so.customer_name || '-'}</td>
                        <td className="font-mono font-bold text-emerald-600">¥{fmt(so.total_amount)}</td>
                        <td className="font-mono text-slate-500">{String(so.sales_date || '-').slice(0, 10)}</td>
                        <td>
                          <span className={`erp-badge ${so.shipping_status === '已出库' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {so.shipping_status || '待出库'}
                          </span>
                        </td>
                        <td className="text-slate-500 text-[11px]">
                          {so.shipping_status === '已出库' ? '✅ 已扣减库存并结转成本凭证(6401/1405)' : '需在【销售单】操作栏点击【🚚 出库】进行发货扣库'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 采购与入库到货关系看板 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">📦 采购员与采购订单/到货入库关系 (`trade_purchase_main`)</span>
              <span className="text-xs text-slate-400 font-normal">最近 {purchaseOrders.length} 笔采购履约</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>采购单号</th>
                    <th>采购员</th>
                    <th>供应商</th>
                    <th>采购总金额</th>
                    <th>采购日期</th>
                    <th>到货/入库状态</th>
                    <th>对应入库动作</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-6 text-slate-400">暂无采购订单记录</td></tr>
                  ) : (
                    purchaseOrders.slice(0, 6).map((po) => (
                      <tr key={po.id || po.purchase_no}>
                        <td className="font-mono text-purple-600 font-medium">{po.purchase_no}</td>
                        <td className="font-semibold text-slate-800">{po.buyer || '采购员'}</td>
                        <td className="text-slate-700">{po.supplier_name || '-'}</td>
                        <td className="font-mono font-bold text-slate-800">¥{fmt(po.total_amount)}</td>
                        <td className="font-mono text-slate-500">{String(po.purchase_date || '-').slice(0, 10)}</td>
                        <td>
                          <span className={`erp-badge ${po.purchase_status === '已入库' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {po.purchase_status || '待到货'}
                          </span>
                        </td>
                        <td className="text-slate-500 text-[11px]">
                          {po.purchase_status === '已入库' ? '✅ 已加权平均入库并写入应付账款' : '需在【采购单】操作栏点击【📦 入库】进行到货入库'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 出入库变动日志流水看板 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">📋 详细出入库流水变动日志：什么时候入库/出库了多少、谁操作的 (`trade_stock_log`)</span>
              <span className="text-xs text-slate-400 font-normal">最近 {stockLogs.length} 条变动流水</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>日志编号</th>
                    <th>商品编码</th>
                    <th>商品名称</th>
                    <th>仓库</th>
                    <th>变动类型</th>
                    <th>变动数量</th>
                    <th>关联单号</th>
                    <th>操作人 / 经办人</th>
                    <th>变动时间</th>
                  </tr>
                </thead>
                <tbody>
                  {stockLogs.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-6 text-slate-400">暂无出入库日志记录</td></tr>
                  ) : (
                    stockLogs.slice(0, 10).map((log) => (
                      <tr key={log.id || log.log_no}>
                        <td className="font-mono text-slate-500">{log.log_no}</td>
                        <td className="font-mono text-indigo-600 font-medium">{log.product_code}</td>
                        <td className="font-medium text-slate-800">{log.product_name || log.product_code}</td>
                        <td className="text-slate-600">{log.warehouse}</td>
                        <td>
                          <span className={`erp-badge ${log.change_type === '入库' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {log.change_type}
                          </span>
                        </td>
                        <td className={`font-mono font-bold ${log.change_type === '入库' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {log.change_type === '入库' ? `+${log.change_qty}` : `-${log.change_qty}`}
                        </td>
                        <td className="font-mono text-slate-500">{log.ref_no || '-'}</td>
                        <td className="font-semibold text-slate-700">{log.operator || '系统'}</td>
                        <td className="font-mono text-slate-400 text-[11px]">{String(log.change_date || log.created_at || '-').slice(0, 10)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'close' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <span>📅</span> 月末关账结转
            </h3>
            <div><label className="text-xs text-slate-500">结账期间（yyyy-MM）</label><input type="month" value={period} onChange={e=>setPeriod(e.target.value)} className="input mt-1"/></div>
            <button onClick={doMonthClose} disabled={saving} className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl text-sm shadow-md disabled:opacity-50">
              {saving ? '处理中...' : '执行月末关账'}
            </button>
            <p className="text-xs text-slate-400 leading-relaxed">关账会自动汇总 6 开头本期损益科目，清零损益余额并转入 `4104 本年利润` 科目，复制期末余额为下期期初。</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <span>🗓️</span> 年终年结处理
            </h3>
            <div><label className="text-xs text-slate-500">年结年份（yyyy）</label><input type="number" value={year} onChange={e=>setYear(e.target.value)} className="input mt-1 font-mono"/></div>
            <button onClick={doYearClose} disabled={saving} className="w-full py-2.5 bg-gradient-to-r from-red-500 to-pink-600 text-white font-semibold rounded-xl text-sm shadow-md disabled:opacity-50">
              {saving ? '处理中...' : '执行年终关账'}
            </button>
            <p className="text-xs text-slate-400 leading-relaxed">年结会自动将 `4104 本年利润` 年终结余转入 `4103 未分配利润` 科目，并初始化新一年期初账簿。</p>
          </div>

          {closeResult && <div className="md:col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 font-medium">{closeResult}</div>}
        </div>
      )}

      <style>{`
        .input { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: #6366f1; ring: 2px solid #6366f130; }
      `}</style>
    </div>
  );
}