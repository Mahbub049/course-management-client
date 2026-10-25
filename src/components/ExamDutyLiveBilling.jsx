import { useCallback, useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { listExamDutySessions } from '../services/examDutyService';
import { getLiveExamDutyBill, syncLiveExamDutyBill } from '../services/calculationService';

const amount = value => `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
const errorText = err => err?.response?.data?.message || err?.message || 'Please try again.';
const box = 'rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950';
const selectCss = 'rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white';

export default function ExamDutyLiveBilling({ onSynced }) {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [bill, setBill] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let mounted = true;
    listExamDutySessions().then(data => {
      if (!mounted) return;
      const all = data.sessions || [];
      setSessions(all);
      setSessionId(String((all.find(s => s.myOfficial || s.myProxies) || all[0])?._id || ''));
      if (!all.length) setLoading(false);
    }).catch(err => { if (mounted) { setError(errorText(err)); setLoading(false); } });
    return () => { mounted = false; };
  }, []);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!sessionId) { setBill(null); setLoading(false); return; }
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const response = await getLiveExamDutyBill(sessionId);
      setBill(response); setError('');
    } catch (err) { setBill(null); setError(errorText(err)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [sessionId]);
  useEffect(() => { refresh(); }, [refresh]);

  const sync = async (replaceManual = false) => {
    if (!sessionId || !bill || saving) return;
    setSaving(true);
    try {
      await syncLiveExamDutyBill(sessionId, replaceManual);
      await refresh({ quiet: true });
      await onSynced?.();
      Swal.fire({ title: 'Saved to billing history', text: 'Your current active examination duties were saved.', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (err) {
      if (err?.response?.data?.code === 'MANUAL_BILL_EXISTS') {
        const agree = await Swal.fire({ title:'Replace the pending manual bill?', text:'This exam already has a manually imported calculation. Replace its duty rows with your current Exam Duties schedule? Other sessions and received bills will not be affected.', icon:'warning', showCancelButton:true, confirmButtonText:'Replace with live duties', confirmButtonColor:'#7c3aed' });
        if (agree.isConfirmed) { setSaving(false); return sync(true); }
      } else Swal.fire('Could not save calculation', errorText(err), 'error');
    } finally { setSaving(false); }
  };

  const summary = bill?.billing;
  const grouped = useMemo(() => ({
    official: bill?.duties.filter(r => r.assignment === 'official').length || 0,
    proxy: bill?.proxyCount || 0,
    incoming: bill?.incomingCount || 0,
    reserved: bill?.reservedCount || 0,
    outgoing: bill?.outgoingCount || 0,
  }), [bill]);

  return <section className="overflow-hidden rounded-[24px] border border-violet-200 bg-violet-50/30 shadow-sm dark:border-violet-500/20 dark:bg-violet-500/[0.035]">
    <div className="flex flex-col gap-3 border-b border-violet-100 px-5 py-4 dark:border-violet-500/15 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><h2 className="text-base font-bold text-slate-900 dark:text-white">Live billing from Exam Duties</h2><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Connected</span></div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Automatically reads your latest official, proxy, exchange and transfer assignments. This preview does not change saved bills.</p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
        <select aria-label="Examination to calculate" className={`${selectCss} w-full sm:w-[245px]`} value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Select examination</option>{sessions.map(s=><option key={s._id} value={s._id}>{s.season} {s.year} · {s.examType}</option>)}</select>
        <button type="button" disabled={!sessionId || refreshing || loading} onClick={()=>refresh({ quiet:true })} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{refreshing?'Refreshing…':'Refresh bill'}</button>
      </div>
    </div>
    <div className="space-y-4 p-3 sm:p-5">
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700/30 dark:bg-rose-900/10 dark:text-rose-300">{error}</div>}
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Calculating current examination duties…</p> : !sessionId ? <p className="py-5 text-center text-sm text-slate-500">Once an examination routine is uploaded, its billing appears here automatically.</p> : bill && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className={box}><p className="text-[11px] font-semibold uppercase text-slate-500">Day duties</p><p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">{summary.dayDuties}</p><p className="text-xs text-slate-500">{amount(summary.dayDutyRate)} each · {amount(summary.dayAmount)}</p></div>
          <div className={box}><p className="text-[11px] font-semibold uppercase text-slate-500">Evening duties</p><p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">{summary.eveningDuties}</p><p className="text-xs text-slate-500">{amount(summary.eveningDutyRate)} each · {amount(summary.eveningAmount)}</p></div>
          <div className={box}><p className="text-[11px] font-semibold uppercase text-slate-500">Gross · tax</p><p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">{amount(summary.gross)}</p><p className="text-xs text-slate-500">{summary.taxRate}% ({amount(summary.taxAmount)})</p></div>
          <div className={`${box} border-violet-200 dark:border-violet-500/30`}><p className="text-[11px] font-semibold uppercase text-violet-600 dark:text-violet-300">Net payable</p><p className="mt-1 text-xl font-extrabold text-violet-700 dark:text-violet-300">{amount(summary.total)}</p><p className="text-xs text-slate-500">Current rates from Billing Settings</p></div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400"><span><b>{grouped.official}</b> official</span><span><b>{grouped.proxy}</b> proxy</span><span><b>{grouped.incoming}</b> received in exchange/transfer</span><span><b>{grouped.reserved}</b> reserved</span><span><b>{grouped.outgoing}</b> given away (not billed)</span></div>
        <p className="text-xs leading-5 text-slate-500">Friday and Saturday: evening rate at any time. Other days: day through 5:00 PM; evening from 5:45 PM. Times in between require review. Active reserved/support duties are included. Exchanged or transferred-out duties are excluded.</p>
        {bill.reviewCount > 0 && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">{bill.reviewCount} active duty time(s) require classification review. These are not included in the payable total, and saving is disabled until corrected.</div>}
        {bill.conflictCount > 0 && <div role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-300">{bill.conflictCount} overlapping active duty assignment(s). Review these before claiming the bill.</div>}
        {bill.saved?.status === 'received' && <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">This session has a received bill in history. Its saved snapshot is protected, but the live amount above is always recalculated.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-violet-100 pt-3 dark:border-violet-500/15">
          <button onClick={()=>setShowDetails(v=>!v)} type="button" className="text-xs font-bold text-violet-700 hover:underline dark:text-violet-300">{showDetails?'Hide':'Show'} duty-by-duty breakdown ({bill.activeCount})</button>
          <button type="button" onClick={()=>sync()} disabled={saving || !bill.activeCount || !!bill.reviewCount || bill.saved?.status === 'received'} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">{saving?'Saving…':bill.saved?.sourceType === 'exam_duties'?'Update billing history':'Save to billing history'}</button>
        </div>
        {showDetails&&<><div className="space-y-2 sm:hidden">{bill.duties.map((d,i)=><article key={`${d.sourceRecordId}-${d.assignment}-${i}`} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/50"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold text-slate-900 dark:text-white">{d.date}</div><div className="text-xs text-slate-500">{d.startTime} – {d.endTime}</div></div><div className="text-right"><div className="text-sm font-extrabold text-violet-700 dark:text-violet-300">{d.dutyType==='review'?'—':amount(d.dutyType==='evening'?summary.eveningDutyRate:summary.dayDutyRate)}</div><div className="text-[10px] capitalize text-slate-500">{d.dutyType}</div></div></div><div className="mt-2 text-xs font-bold text-slate-800 dark:text-slate-200">{d.course||d.category} · Room {d.room}</div><p className="mt-1 text-xs text-slate-500">{d.assignment}{d.counterpartyCode?` · ${d.counterpartyCode}`:''}{d.category==='reserved'?' · Reserved':''}</p></article>)}</div><div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 sm:block"><table className="w-full min-w-[810px] text-left text-xs"><thead className="bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"><tr>{['Date','Time','Course / Room','Assignment','Rate type','Bill'].map(x=><th key={x} className="px-3 py-2.5">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{bill.duties.map((d,i)=><tr key={`${d.sourceRecordId}-${d.assignment}-${i}`} className="text-slate-700 dark:text-slate-300"><td className="whitespace-nowrap px-3 py-2.5">{d.date}</td><td className="whitespace-nowrap px-3 py-2.5">{d.startTime}–{d.endTime}</td><td className="px-3 py-2.5">{d.course || d.category} · {d.room}</td><td className="px-3 py-2.5">{d.assignment}{d.counterpartyCode?` · ${d.counterpartyCode}`:''}{d.category==='reserved'?' · Reserved':''}</td><td className="px-3 py-2.5 capitalize">{d.dutyType==='review'?'Needs review':d.dutyType}</td><td className="px-3 py-2.5 font-bold">{d.dutyType==='review'?'—':amount(d.dutyType==='evening'?summary.eveningDutyRate:summary.dayDutyRate)}</td></tr>)}</tbody></table></div></>}
      </>}
    </div>
  </section>;
}
