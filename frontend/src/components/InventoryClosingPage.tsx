import { useState } from 'react';
import { bizApi } from '../api';
import { useAuth } from '../context/AuthContext';

function fmt(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString() : '0'; }

export default function InventoryClosingPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [tab, setTab] = useState<'stock' | 'close'>('stock');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  // 库存直调
  const [ioType, setIoType] = useState<'in' | 'out'>('in');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [specModel, setSpecModel] = useState('');
  const [warehouse, setWarehouse] = useState('默认仓');
  const [qty, setQty] = useState(0);
  const [unitCost, setUnitCost] = useState(0);

  // 月结/年结
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [closeResult, setCloseResult] = useState<string>('');

  const toastFn = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const submitStock = async () => {
    if (!productCode) { toastFn('产品编码必填'); return; }
    if (qty <= 0) { toastFn('数量必须大于 0'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { product_code: productCode, product_name: productName, spec_model: specModel, warehouse, qty, unit_cost: unitCost };
      if (ioType === 'in') await bizApi.stockIn(body);
      else await bizApi.stockOut(body);
      toastFn(`${ioType === 'in' ? '入库' : '出库'}成功`);
      setQty(0);
    } catch (e: any) { toastFn('失败: ' + e.message); }
    setSaving(false);
  };

  const doMonthClose = async () => {
    if (!confirm(`确认对期间 ${period} 执行月结？此操作不可撤销。`)) return;
    setSaving(true);
    try { await bizApi.monthClose(period); setCloseResult(`期间 ${period} 月结完成`); toastFn('月结完成'); }
    catch (e: any) { toastFn('月结失败: ' + e.message); }
    setSaving(false);
  };
  const doYearClose = async () => {
    if (!confirm(`确认对 ${year} 年执行年结？此操作不可撤销。`)) return;
    setSaving(true);
    try { await bizApi.yearClose(year); setCloseResult(`${year} 年年结完成`); toastFn('年结完成'); }
    catch (e: any) { toastFn('年结失败: ' + e.message); }
    setSaving(false);
  };

  return (
    <div className="erp-fade-in p-6 space-y-6 max-w-[1200px] mx-auto">
      {toast && <div className="erp-toast">{toast}</div>}

      {/* UI 引导与数据联动说明 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 text-white shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base flex items-center gap-2 text-indigo-300">
            <span>💡</span> 库存直调与期末结账使用指南与后台数据联动说明
          </h3>
          <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30 font-medium">期末损益自动冲销</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <span>📝</span> 步骤指引：
            </div>
            <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-200">
              <li>【库存直调】：用于盘点快速修正库存，选择商品编码与仓库，输入数量点击【执行】。</li>
              <li>【月末结账】：选择会计期间（如 `2026-08`），点击【月结】，系统自动关账。</li>
              <li>【年终结账】：选择年份，点击【年结】，完成年度损益结转。</li>
            </ol>
          </div>
          <div className="bg-white/5 rounded-xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <span>🔄</span> 自动数据联动：
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-200">
              <li>库存直调 ➔ 采用 `FOR UPDATE` 行排他锁重算 `trade_inventory_balance` 并记录日志。</li>
              <li>月结完成 ➔ 自动清零损益类科目（6开头），计算净利润转入 `4104 本年利润` 科目。</li>
              <li>年结完成 ➔ 自动将 `4104` 余额结转至 `4103 未分配利润` 科目。</li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-800">🛠️ 库存直调 & 期末结账</h2>
        <p className="text-sm text-gray-500 mt-1">绕过主从表快速调整库存 + 期间月结/年终结账</p>
      </div>

      {!isAdmin && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">🔒 仅管理员可访问</div>}

      {isAdmin && (
        <>
          <div className="flex gap-2">
            <button onClick={()=>setTab('stock')} className={`px-4 py-2 rounded-lg text-sm ${tab==='stock'?'bg-blue-600 text-white':'bg-white border'}`}>库存直调</button>
            <button onClick={()=>setTab('close')} className={`px-4 py-2 rounded-lg text-sm ${tab==='close'?'bg-blue-600 text-white':'bg-white border'}`}>期末结账</button>
          </div>

          {tab === 'stock' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border max-w-2xl">
              <div className="flex gap-2 mb-4">
                <button onClick={()=>setIoType('in')} className={`px-4 py-2 rounded-lg text-sm ${ioType==='in'?'bg-emerald-500 text-white':'bg-gray-100'}`}>📥 入库</button>
                <button onClick={()=>setIoType('out')} className={`px-4 py-2 rounded-lg text-sm ${ioType==='out'?'bg-red-500 text-white':'bg-gray-100'}`}>📤 出库</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="text-xs text-gray-500">产品编码 *</label><input value={productCode} onChange={e=>setProductCode(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
                <div><label className="text-xs text-gray-500">产品名称</label><input value={productName} onChange={e=>setProductName(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
                <div><label className="text-xs text-gray-500">规格</label><input value={specModel} onChange={e=>setSpecModel(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
                <div><label className="text-xs text-gray-500">仓库</label><input value={warehouse} onChange={e=>setWarehouse(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
                <div><label className="text-xs text-gray-500">数量</label><input type="number" value={qty} onChange={e=>setQty(Number(e.target.value)||0)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
                {ioType === 'in' && <div className="col-span-2"><label className="text-xs text-gray-500">单位成本</label><input type="number" value={unitCost} onChange={e=>setUnitCost(Number(e.target.value)||0)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={submitStock} disabled={saving} className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">{saving?'处理中...':`执行${ioType==='in'?'入库':'出库'} ${fmt(qty)}件`}</button>
              </div>
            </div>
          )}

          {tab === 'close' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border">
                <h3 className="font-semibold text-gray-800 mb-3">📅 月末结账</h3>
                <div><label className="text-xs text-gray-500">期间（yyyy-MM）</label><input type="month" value={period} onChange={e=>setPeriod(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
                <button onClick={doMonthClose} disabled={saving} className="mt-4 w-full px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg text-sm disabled:opacity-50">{saving?'处理中...':'月结'}</button>
                <p className="mt-3 text-xs text-gray-400">月结会归集本期损益、生成期末科目余额、留存损益</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm border">
                <h3 className="font-semibold text-gray-800 mb-3">🗓️ 年终结账</h3>
                <div><label className="text-xs text-gray-500">年份</label><input type="number" value={year} onChange={e=>setYear(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"/></div>
                <button onClick={doYearClose} disabled={saving} className="mt-4 w-full px-4 py-2.5 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-lg text-sm disabled:opacity-50">{saving?'处理中...':'年结'}</button>
                <p className="mt-3 text-xs text-gray-400">年结会结转本年利润、清理临时科目、初始化下年期初</p>
              </div>
              {closeResult && <div className="md:col-span-2 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-700">{closeResult}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}