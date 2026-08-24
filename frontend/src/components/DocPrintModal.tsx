import { useEffect, useState } from 'react';
import { dataApi } from '../api';
import { toChineseAmount } from '../utils/amount';

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
};

interface Props {
  kind: 'sales' | 'purchase';
  mainRow: Record<string, any>;
  onClose: () => void;
}

/** 单据套打：销售送货单 / 采购订单（正式排版，一键打印归档） */
export default function DocPrintModal({ kind, mainRow, onClose }: Props) {
  const [lines, setLines] = useState<any[] | null>(null);
  const [err, setErr] = useState('');

  const isSales = kind === 'sales';
  const docNo = String(isSales ? mainRow.sales_no : mainRow.purchase_no || '');
  const detailTable = isSales ? 'trade_sales_detail' : 'trade_purchase_detail';
  const keyCol = isSales ? 'sales_no' : 'purchase_no';

  useEffect(() => {
    dataApi.list(detailTable, 1, 200, docNo)
      .then(r => setLines((r.data?.rows || []).filter((l: any) => String(l[keyCol]) === docNo)))
      .catch(e => setErr(e.message || '明细加载失败'));
  }, [detailTable, docNo, keyCol]);

  const total = (lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[95] p-4 erp-modal-bg" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col erp-modal-panel" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-3 border-b flex items-center justify-between no-print shrink-0">
          <h3 className="font-bold text-slate-800 text-sm">🖨️ {isSales ? '销售送货单' : '采购订单'}套打预览 <span className="font-mono text-xs text-indigo-600 ml-1">{docNo}</span></h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="px-4 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-700">🖨️ 打印</button>
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs hover:bg-slate-200">关闭</button>
          </div>
        </div>

        <div className="p-8 overflow-y-auto flex-1 print-area">
          {/* 单据正文（打印区域） */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold tracking-[0.3em] text-slate-800">{isSales ? '销 售 送 货 单' : '采 购 订 单'}</h1>
            <p className="text-[11px] text-slate-400 mt-1">ERP 企业管理系统 · 业财一体化单据</p>
          </div>

          <div className="flex justify-between text-xs text-slate-600 mb-3">
            <span>单据编号：<b className="font-mono">{docNo}</b></span>
            <span>日期：<b>{String(isSales ? mainRow.sales_date : mainRow.purchase_date || '').slice(0, 10)}</b></span>
          </div>

          <table className="w-full text-xs border-collapse mb-4">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 w-20 bg-slate-50 font-medium">{isSales ? '客户名称' : '供应商'}</td>
                <td className="border border-slate-300 px-2 py-1.5">{String(isSales ? mainRow.customer_name : mainRow.supplier_name || '') || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 w-20 bg-slate-50 font-medium">{isSales ? '客户编码' : '供应商编码'}</td>
                <td className="border border-slate-300 px-2 py-1.5 font-mono">{String(isSales ? mainRow.customer_code : mainRow.supplier_code || '') || '—'}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 bg-slate-50 font-medium">经办人</td>
                <td className="border border-slate-300 px-2 py-1.5">{String(isSales ? mainRow.sales_person : mainRow.buyer || '') || '—'}</td>
                <td className="border border-slate-300 px-2 py-1.5 bg-slate-50 font-medium">单据状态</td>
                <td className="border border-slate-300 px-2 py-1.5">{String(isSales ? mainRow.sales_status : mainRow.purchase_status || '') || '—'}</td>
              </tr>
            </tbody>
          </table>

          {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
          {lines === null && !err && <p className="text-xs text-slate-400 text-center py-6">明细加载中...</p>}

          {lines !== null && (
            <table className="w-full text-xs border-collapse mb-4">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-300 px-2 py-1.5 w-8">序号</th>
                  <th className="border border-slate-300 px-2 py-1.5">编码</th>
                  <th className="border border-slate-300 px-2 py-1.5">名称</th>
                  <th className="border border-slate-300 px-2 py-1.5">规格型号</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right">数量</th>
                  <th className="border border-slate-300 px-2 py-1.5">单位</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right">单价</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right">金额</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id || i}>
                    <td className="border border-slate-300 px-2 py-1.5 text-center">{i + 1}</td>
                    <td className="border border-slate-300 px-2 py-1.5 font-mono">{l.product_code}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{l.product_name}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{l.spec_model || '—'}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{Number(l.qty || 0)}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{l.unit || '—'}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{money(l.unit_price)}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-medium">{money(l.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className="border border-slate-300 px-2 py-2 text-center" colSpan={4}>合计</td>
                  <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)}</td>
                  <td className="border border-slate-300 px-2 py-2"></td>
                  <td className="border border-slate-300 px-2 py-2"></td>
                  <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">¥{money(total)}</td>
                </tr>
              </tbody>
            </table>
          )}

          <div className="text-xs text-slate-600 mb-8">
            <span>金额大写：</span>
            <span className="font-semibold tracking-wider">{toChineseAmount(total)}</span>
          </div>

          <div className="grid grid-cols-3 gap-8 text-xs text-slate-500">
            <div>制单人：__________</div>
            <div>{isSales ? '客户签收' : '供应商确认'}：__________</div>
            <div>审批人：__________</div>
          </div>
        </div>
      </div>
    </div>
  );
}
