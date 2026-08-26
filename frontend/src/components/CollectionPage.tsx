import { useCallback, useEffect, useState } from 'react';
import { bizApi } from '../api';
import { toastNotify } from '../utils/toast';

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function OverdueBadge({ days }: { days: number }) {
  const cls = days > 90 ? 'bg-red-500 text-white animate-pulse' : days > 60 ? 'bg-red-50 text-red-600 border border-red-200' : days > 30 ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-amber-50 text-amber-600 border border-amber-200';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${cls}`}>逾期 {days} 天</span>;
}

/** 催收管理中心（v5.29）：逾期应收账龄看板 + 催收记录登记 + 一键生成催款函打印 */
export default function CollectionPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bucket, setBucket] = useState<'all' | 'b30' | 'b60' | 'b90' | 'b90p'>('all');
  // 催收登记弹窗
  const [target, setTarget] = useState<any>(null);
  const [fMethod, setFMethod] = useState('电话');
  const [fPerson, setFPerson] = useState('');
  const [fContent, setFContent] = useState('');
  const [fResult, setFResult] = useState('承诺付款');
  const [fNext, setFNext] = useState('');
  // 催款函弹窗
  const [letter, setLetter] = useState<any>(null);
  const [letterText, setLetterText] = useState('');
  // 催收历史抽屉
  const [history, setHistory] = useState<any[] | null>(null);
  const [historyNo, setHistoryNo] = useState('');

  const load = useCallback(() => {
    setError('');
    bizApi.collectionBoard().then(r => setData(r.data)).catch(e => setError(e.message || '加载失败'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openLetter = (r: any) => {
    const days = Number(r.overdue_days_calc || 0);
    const today = new Date().toLocaleDateString('zh-CN');
    setLetterText(
`催 款 函

致：${r.customer_name}

贵我双方业务往来，感谢长期支持。经核对，截至 ${today}，贵司尚有以下应收款项未结清：

    应收单号：${r.receivable_no}
    应收金额：¥${money(r.total_amount)}
    已收金额：¥${money(r.received_amount)}
    未收余额：¥${money(r.remain_amount)}
    约定付款日：${String(r.due_date || '').slice(0, 10)}（已逾期 ${days} 天）

烦请贵司于收函后 5 个工作日内安排付款；如已支付，请提供付款凭证以便我方核销。如有任何争议，请及时与我们联系协商处理。

顺祝商祺！

                                        财务部
                                        ${today}`);
    setLetter(r);
  };

  const doAdd = async () => {
    setBusy(true);
    try {
      await bizApi.collectionAdd({ receivable_no: target.receivable_no, method: fMethod, contact_person: fPerson, content: fContent, result: fResult, next_follow_date: fNext });
      toastNotify(`催收记录已登记：${target.receivable_no}（${fMethod} / ${fResult}）`);
      setTarget(null); setFPerson(''); setFContent(''); setFNext('');
      load();
    } catch (e: any) { toastNotify('登记失败：' + (e.message || ''), 'error'); }
    setBusy(false);
  };

  const openHistory = async (no: string) => {
    setHistoryNo(no); setHistory(null);
    try { setHistory(await bizApi.collectionRecords(no).then(r => r.data || [])); }
    catch { setHistory([]); }
  };

  if (error) return <div className="p-16 text-center"><div className="text-5xl mb-3">⚠️</div><p className="text-red-500">{error}</p></div>;
  if (!data) return <div className="p-16 text-center"><div className="erp-spinner mx-auto mb-3"></div><p className="text-sm text-slate-400">催收看板加载中…</p></div>;

  const t = data.totals || {};
  const rows: any[] = ((data.rows || []) as any[]).filter((r: any) => {
    const d = Number(r.overdue_days_calc || 0);
    if (bucket === 'all') return true;
    if (bucket === 'b30') return d <= 30;
    if (bucket === 'b60') return d > 30 && d <= 60;
    if (bucket === 'b90') return d > 60 && d <= 90;
    return d > 90;
  });
  const BUCKETS = [
    { key: 'b30', label: '逾期 ≤30天', cls: 'text-amber-600' },
    { key: 'b60', label: '31-60天', cls: 'text-orange-500' },
    { key: 'b90', label: '61-90天', cls: 'text-red-500' },
    { key: 'b90p', label: '90天以上', cls: 'text-red-600' },
  ] as const;

  return (
    <div className="erp-fade-in p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto">
      <div className="rounded-2xl p-4 md:p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7c2d12, #b45309 55%, #f59e0b)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-amber-400/20 blur-2xl"></div>
        <div className="relative">
          <h2 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">📣 催收管理中心</h2>
          <p className="text-[11px] md:text-xs text-amber-100 mt-1.5">逾期应收账龄看板 · 催收过程留痕 · 一键生成催款函（打印归档）</p>
        </div>
      </div>

      {/* 账龄汇总 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <button onClick={() => setBucket('all')} className={`erp-card p-3.5 text-center transition-all ${bucket === 'all' ? 'ring-2 ring-amber-400' : 'hover:shadow-md'}`}>
          <p className="text-[10px] text-slate-400 mb-0.5">逾期总额</p>
          <p className="text-lg font-bold tabular-nums text-red-500">¥{money(t.amount)}</p>
          <p className="text-[10px] text-slate-400">{Number(t.count || 0)} 笔</p>
        </button>
        {BUCKETS.map(b => (
          <button key={b.key} onClick={() => setBucket(bucket === b.key ? 'all' : b.key)} className={`erp-card p-3.5 text-center transition-all ${bucket === b.key ? 'ring-2 ring-amber-400' : 'hover:shadow-md'}`}>
            <p className="text-[10px] text-slate-400 mb-0.5">{b.label}</p>
            <p className={`text-lg font-bold tabular-nums ${b.cls}`}>¥{money(t[b.key]?.amount)}</p>
            <p className="text-[10px] text-slate-400">{Number(t[b.key]?.count || 0)} 笔</p>
          </button>
        ))}
        <div className="erp-card p-3.5 text-center bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <p className="text-[10px] text-amber-600 mb-0.5">催收建议</p>
          <p className="text-[11px] text-amber-700 font-medium leading-relaxed">{Number(t.b90p?.count || 0) > 0 ? '90天以上建议发函并升级处理' : Number(t.b90?.count || 0) > 0 ? '60天以上建议电话+邮件双催' : '按账龄循序跟进即可'}</p>
        </div>
      </div>

      {/* 逾期清单 */}
      <div className="erp-card p-3 md:p-4 overflow-x-auto">
        <table className="erp-table text-xs w-full min-w-[920px]">
          <thead><tr><th className="text-left">应收单</th><th className="text-left">客户</th><th>应收金额</th><th>已收</th><th>未收余额</th><th>到期日</th><th>账龄</th><th>催收</th><th>操作</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-slate-400">🎉 当前账龄段无逾期应收</td></tr>}
            {rows.map((r: any) => {
              const days = Number(r.overdue_days_calc || 0);
              const pct = Number(r.total_amount || 0) > 0 ? (Number(r.received_amount || 0) / Number(r.total_amount)) * 100 : 0;
              return (
                <tr key={r.id} className={days > 90 ? 'bg-red-50/40' : ''}>
                  <td className="text-left"><span className="font-mono text-indigo-600 whitespace-nowrap">{r.receivable_no}</span></td>
                  <td className="text-left font-medium text-slate-700 whitespace-nowrap">{r.customer_name}</td>
                  <td className="tabular-nums">¥{money(r.total_amount)}</td>
                  <td className="min-w-[90px]">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex-1"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, pct)}%` }}></div></div>
                      <span className="tabular-nums text-emerald-600 shrink-0">¥{money(r.received_amount)}</span>
                    </div>
                  </td>
                  <td className="tabular-nums font-bold text-red-500 whitespace-nowrap">¥{money(r.remain_amount)}</td>
                  <td className="tabular-nums whitespace-nowrap">{String(r.due_date || '').slice(0, 10)}</td>
                  <td><OverdueBadge days={days} /></td>
                  <td className="text-center">
                    <button onClick={() => openHistory(r.receivable_no)} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 whitespace-nowrap">{Number(r.follow_cnt || 0)} 次记录</button>
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex gap-1.5">
                      <button onClick={() => { setTarget(r); setFResult('承诺付款'); }} className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-500">登记催收</button>
                      <button onClick={() => openLetter(r)} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-medium hover:bg-slate-50">催款函</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 催收登记弹窗 */}
      {target && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 erp-modal-bg" onClick={() => setTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-indigo-50 flex items-center justify-between shrink-0"><h3 className="font-bold text-slate-800">📞 登记催收 · {target.receivable_no}</h3><button onClick={() => setTarget(null)} className="text-slate-400">✕</button></div>
            <div className="p-6 overflow-y-auto space-y-3 text-sm">
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">{target.customer_name} · 未收 <b className="text-red-500">¥{money(target.remain_amount)}</b> · 逾期 <b className="text-red-500">{Number(target.overdue_days_calc || 0)} 天</b></p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-slate-500">催收方式</label><select value={fMethod} onChange={e => setFMethod(e.target.value)} className="erp-input">{['电话', '邮件', '微信', '上门', '催款函'].map(m => <option key={m}>{m}</option>)}</select></div>
                <div><label className="text-xs font-medium text-slate-500">催收结果</label><select value={fResult} onChange={e => setFResult(e.target.value)} className="erp-input">{['承诺付款', '需再跟进', '无回应', '已回款'].map(m => <option key={m}>{m}</option>)}</select></div>
              </div>
              <div><label className="text-xs font-medium text-slate-500">对方联系人</label><input value={fPerson} onChange={e => setFPerson(e.target.value)} placeholder="选填" className="erp-input"/></div>
              <div><label className="text-xs font-medium text-slate-500">沟通内容</label><textarea value={fContent} onChange={e => setFContent(e.target.value)} rows={3} placeholder="沟通要点、对方承诺、争议事项…" className="erp-input"/></div>
              <div><label className="text-xs font-medium text-slate-500">下次跟进日期</label><input type="date" value={fNext} onChange={e => setFNext(e.target.value)} className="erp-input"/></div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2 bg-slate-50/50 shrink-0">
              <button onClick={() => setTarget(null)} className="erp-btn erp-btn-ghost">取消</button>
              <button onClick={doAdd} disabled={busy} className="erp-btn erp-btn-primary">{busy ? '提交中…' : '确认登记'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 催款函弹窗（可编辑 + 打印） */}
      {letter && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 erp-modal-bg" onClick={() => setLetter(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-3 border-b flex items-center justify-between no-print shrink-0">
              <h3 className="font-bold text-slate-800">🧾 催款函 · {letter.receivable_no}</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium hover:bg-slate-700">🖨️ 打印</button>
                <button onClick={() => setLetter(null)} className="text-slate-400 hover:text-slate-600 px-1">✕</button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1 print-area">
              <textarea value={letterText} onChange={e => setLetterText(e.target.value)} rows={20} className="w-full erp-input font-mono text-xs leading-relaxed"/>
            </div>
          </div>
        </div>
      )}

      {/* 催收历史抽屉 */}
      {historyNo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4 erp-modal-bg" onClick={() => setHistoryNo('')}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col erp-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between shrink-0"><h3 className="font-bold text-slate-800">🗂️ 催收历史 · {historyNo}</h3><button onClick={() => setHistoryNo('')} className="text-slate-400">✕</button></div>
            <div className="p-5 overflow-y-auto flex-1 space-y-2">
              {history === null ? <p className="text-center text-sm text-slate-400 py-8"><span className="erp-spinner inline-block mr-2"></span>加载中…</p>
                : history.length === 0 ? <p className="text-center text-xs text-slate-400 py-8">暂无催收记录</p>
                : history.map((h: any) => (
                  <div key={h.id} className="border border-slate-100 rounded-xl p-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${h.result === '已回款' ? 'bg-emerald-50 text-emerald-600' : h.result === '承诺付款' ? 'bg-blue-50 text-blue-600' : h.result === '无回应' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>{h.result}</span>
                      <span className="text-slate-500">{h.method} · {h.collector}</span>
                      <span className="text-slate-400 ml-auto tabular-nums">{String(h.collect_date || '').slice(0, 10)}</span>
                    </div>
                    {h.content && <p className="text-slate-600">{h.content}</p>}
                    <p className="text-[10px] text-slate-400">{h.contact_person ? `联系人：${h.contact_person} · ` : ''}{h.next_follow_date ? `下次跟进 ${String(h.next_follow_date).slice(0, 10)}` : ''}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
