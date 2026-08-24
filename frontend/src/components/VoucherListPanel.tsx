import { useCallback, useEffect, useState } from 'react';
import { bizApi, dataApi } from '../api';
import { toastNotify } from '../utils/toast';

const STATUS_STYLE: Record<string, string> = {
  '待审核': 'bg-amber-50 text-amber-700 border-amber-200',
  '已审核': 'bg-blue-50 text-blue-600 border-blue-200',
  '已记账': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
};

/** 凭证列表：审核流状态机（待审核 → 已审核 → 已记账） */
export default function VoucherListPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (kw: string) => {
    setLoading(true);
    try {
      const r = await dataApi.list('voucher_main', 1, 50, kw);
      setRows(r.data?.rows || []);
    } catch (e: any) { toastNotify('凭证加载失败：' + (e.message || '')); }
    setLoading(false);
  }, []);

  useEffect(() => { load(''); }, [load]);

  const doAudit = async (no: string) => {
    try { await bizApi.voucherAudit(no); toastNotify(`凭证 ${no} 审核通过`); load(search); }
    catch (e: any) { toastNotify('审核失败：' + (e.message || '')); }
  };
  const doPost = async (no: string) => {
    try { await bizApi.voucherPost(no); toastNotify(`凭证 ${no} 已记账`); load(search); }
    catch (e: any) { toastNotify('记账失败：' + (e.message || '')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">📒 凭证列表（审核流）</h3>
          <p className="text-xs text-slate-400 mt-1">手工凭证保存后进入「待审核」：会计/管理员【审核】→【记账】归档；系统自动凭证直接「已审核」</p>
        </div>
        <div className="flex gap-2">
          <input value={search} onChange={e => { setSearch(e.target.value); setTimeout(() => load(e.target.value), 350); }} placeholder="搜索凭证号/摘要..." className="erp-input w-56"/>
          <button onClick={() => load(search)} disabled={loading} className="erp-btn erp-btn-ghost">↻</button>
        </div>
      </div>

      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead><tr>
              <th>凭证号</th><th>凭证字</th><th>日期</th><th>期间</th><th className="text-right">借方合计</th><th className="text-right">贷方合计</th><th>制单人</th><th>审核人</th><th>状态</th><th className="text-center">操作</th>
            </tr></thead>
            <tbody>
              {rows.map(v => {
                const st = String(v.voucher_status || '');
                return (
                  <tr key={v.id}>
                    <td className="font-mono whitespace-nowrap text-indigo-600">{v.voucher_no}</td>
                    <td className="whitespace-nowrap">{v.voucher_word || '记'}</td>
                    <td className="whitespace-nowrap text-slate-500">{String(v.voucher_date || '').slice(0, 10)}</td>
                    <td className="whitespace-nowrap text-slate-500">{v.period}</td>
                    <td className="text-right tabular-nums whitespace-nowrap font-medium">{money(v.debit_total)}</td>
                    <td className="text-right tabular-nums whitespace-nowrap font-medium">{money(v.credit_total)}</td>
                    <td className="whitespace-nowrap text-slate-600">{v.prepared_by || '—'}</td>
                    <td className="whitespace-nowrap text-slate-600">{v.reviewer || '—'}</td>
                    <td className="whitespace-nowrap"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLE[st] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>{st}</span></td>
                    <td className="text-center whitespace-nowrap">
                      {st === '待审核' && <button onClick={() => doAudit(String(v.voucher_no))} className="px-2.5 py-1 text-[11px] bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md font-medium">✓ 审核</button>}
                      {st === '已审核' && <button onClick={() => doPost(String(v.voucher_no))} className="px-2.5 py-1 text-[11px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md font-medium">📗 记账</button>}
                      {st === '已记账' && <span className="text-[11px] text-slate-300">已归档</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={10} className="py-12 text-center">
                  <div className="text-3xl mb-2">📒</div>
                  <p className="text-sm text-slate-400">{search ? `未找到匹配 "${search}" 的凭证` : '暂无凭证'}</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
