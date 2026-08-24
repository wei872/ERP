import { useEffect, useState } from 'react';
import { dataApi } from '../api';
import { useTableMeta } from '../meta/store';

function fmtCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== '' && !/[-:T]/.test(String(v))) {
    return Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(Math.round(n * 100) / 100);
  }
  const s = String(v);
  return s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/**
 * 主单 → 明细钻取：按关联键检索明细表并渲染（列元数据驱动，中文列头 + 状态徽章）。
 */
export default function DetailDrilldown({ detailTable, keyValue }: { detailTable: string; keyValue: string }) {
  const { meta, loading } = useTableMeta(detailTable);
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setRows(null); setErr('');
    dataApi.list(detailTable, 1, 200, keyValue)
      .then(r => setRows(r.data?.rows || []))
      .catch(e => setErr(e.message || '明细加载失败'));
  }, [detailTable, keyValue]);

  if (loading) return <div className="py-10 text-center text-sm text-slate-400"><div className="erp-spinner mx-auto mb-2"></div>加载明细元数据...</div>;
  if (err) return <div className="py-8 text-center text-sm text-red-500">{err}</div>;
  if (!meta || rows === null) return <div className="py-10 text-center text-sm text-slate-400"><div className="erp-spinner mx-auto mb-2"></div>加载明细中...</div>;
  const cols = meta.cols.filter(c => c.name !== 'id' && c.name !== 'created_at' && c.name !== 'remark');

  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        关联键 <span className="font-mono text-indigo-600">{keyValue}</span> · 明细表 <span className="font-mono">{detailTable}</span> · 共 {rows.length} 行
      </p>
      {rows.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm text-slate-400">该单据暂无明细行</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="erp-table">
            <thead>
              <tr>{cols.map(c => <th key={c.name} className="whitespace-nowrap">{c.cnName}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={(row as any).id || i}>
                  {cols.map(c => (
                    <td key={c.name} className="whitespace-nowrap">
                      {meta.dicts[c.name]
                        ? <span className="erp-badge bg-slate-100 text-slate-600">{String(row[c.name] ?? '—')}</span>
                        : <span className={c.type === 'number' ? 'font-mono tabular-nums text-slate-700 block text-right' : 'text-slate-600'}>{fmtCell(row[c.name])}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
