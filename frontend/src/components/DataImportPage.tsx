import { useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';
import { downloadCsv } from '../utils/csv';

const SALES_TEMPLATE: (string | number)[][] = [
  ['客户名称', '商品编码', '商品名称', '数量', '单价', '单位'],
  ['华东智能制造有限公司', 'FG-001', '智能工业网关', 10, 1280, '台'],
  ['华东智能制造有限公司', 'FG-002', '工业温湿度传感器', 20, 460, '只'],
  ['南方物联科技公司', 'FG-003', '边缘计算控制主板', 5, 2350, '块'],
];
const PURCHASE_TEMPLATE: (string | number)[][] = [
  ['供应商名称', '商品编码', '商品名称', '数量', '单价', '单位'],
  ['深圳芯联电子公司', 'IC-0001', '主控芯片STM32F4', 200, 45, '片'],
  ['苏州光电科技公司', 'DSP-0001', '3.5寸触控显示屏', 50, 85, '块'],
];

function ImportCard({ title, icon, desc, template, tplName, type }: {
  title: string; icon: string; desc: string; template: (string | number)[][]; tplName: string; type: 'sales' | 'purchase';
}) {
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const doImport = async (file: File) => {
    setBusy(true); setResult(null);
    try {
      const r = await bizApi.importOrders(type, file);
      setResult(r.data);
      toastNotify(`导入成功：${r.data.order_count} 张订单 / ${r.data.line_count} 行明细（自动生成凭证与应收应付）`);
    } catch (e: any) {
      toastNotify('导入失败：' + (e.message || ''));
    }
    setBusy(false);
  };

  return (
    <div className="erp-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0">{icon}</span>
        <div>
          <h3 className="font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => downloadCsv(tplName, template)} className="erp-btn erp-btn-ghost flex-1">⬇ 下载导入模板</button>
        <label className={`erp-btn erp-btn-primary flex-1 cursor-pointer text-center ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          ⬆ 选择 Excel 上传
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }} />
        </label>
      </div>
      <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
        <li>同一{type === 'sales' ? '客户' : '供应商'}名称的连续多行自动合并为一张订单</li>
        <li>商品编码在商品主数据中存在时自动带出商品名称</li>
        <li>{type === 'sales' ? '生成「已审核」销售单 + 凭证 + 应收单' : '生成「待审批」采购单 + 凭证 + 应付单'}</li>
      </ul>
      {result && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 space-y-1">
          <p>✅ 已生成 <b>{result.order_count}</b> 张订单 / <b>{result.line_count}</b> 行明细</p>
          <p className="font-mono text-[10px] break-all">{(result.order_nos || []).join('、')}</p>
          {(result.errors || []).length > 0 && <p className="text-amber-600">⚠️ {(result.errors || []).join('；')}</p>}
        </div>
      )}
    </div>
  );
}

/** 数据导入中心：销售/采购订单 Excel 批量导入 */
export default function DataImportPage() {
  return (
    <div className="erp-fade-in p-6 space-y-5 max-w-[1200px] mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">⬆️ 数据导入中心</h2>
        <p className="text-sm text-slate-400 mt-1">Excel 批量导入销售/采购订单：自动合并同名单行、带出商品名称、联动生成凭证与应收应付</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ImportCard title="销售订单导入" icon="💰" desc="导入后进入销售流程：出库 → 收款核销 → 毛利分析" template={SALES_TEMPLATE} tplName="销售订单导入模板.csv" type="sales" />
        <ImportCard title="采购订单导入" icon="🛒" desc="导入后进入采购流程：审批 → 入库 → 付款核销" template={PURCHASE_TEMPLATE} tplName="采购订单导入模板.csv" type="purchase" />
      </div>
    </div>
  );
}
