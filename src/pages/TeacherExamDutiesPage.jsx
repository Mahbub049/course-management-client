import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import TeacherCalculationsPage from './TeacherCalculationsPage';
import { extractExamDutyPdfs, facultyCodeMatches } from '../utils/examDutyPdf';
import { listExamDutySessions, importExamDutyRows, getMyExamDutySchedule, findFacultyExamDuties, acceptExamDutyProxy, removeExamDutyProxy, deleteExamDutySession, applyExamDutyChange, revertExamDutyChange } from '../services/examDutyService';

const cls = 'rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-400/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const danger = 'inline-flex items-center justify-center gap-2 rounded-xl border border-rose-600 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-rose-900/10 transition hover:border-rose-700 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50';
const fmtDate = (v) => { if (!/^\d{4}-\d\d-\d\d$/.test(v || '')) return v || '—'; const [y,m,d] = v.split('-'); return new Date(Date.UTC(+y,+m-1,+d)).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}); };
const apiError = (e) => e?.response?.data?.message || e?.message || 'Please try again.';
const initialMeta = { name: `Fall ${new Date().getFullYear()} Mid Term Examination`, season:'Fall', year: new Date().getFullYear(), examType:'Mid Term' };
const examOptions = ['Mid Term','Final','Supplementary Mid','Supplementary Final','Improvement','Other'];
const seasonOptions = ['Spring','Summer','Fall'];
const sessionName = s => `${s.season} ${s.year} · ${s.examType}`;
const dayOf = iso => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB',{weekday:'short', timeZone:'UTC'}) : '';
const short = (v) => String(v || '').trim().toUpperCase();
const getMinutes=(v)=> { const m=String(v||'').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);return m?(+m[1]%12+(m[3].toUpperCase()==='PM'?12:0))*60+(+m[2]):9999; };
const classified = r => { const day = dayOf(r.date); if (day === 'Fri' || day === 'Sat') return 'evening'; const time = getMinutes(r.startTime); if (time === 9999) return 'review'; return time <= 1020 ? 'day' : time >= 1065 ? 'evening' : 'review'; };
const ordered = (a,b) => a.date.localeCompare(b.date) || getMinutes(a.startTime)-getMinutes(b.startTime) || String(a.room).localeCompare(String(b.room));

function Glyph({name,size=18}) {
  const paths = {
    calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    calculator:<><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8v3H8zM8 13h1M12 13h1M16 13h1M8 17h1M12 17h1M16 17h1"/></>,
    upload:<><path d="M12 16V3m0 0-5 5m5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
    printer:<><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 15h12v6H6z"/></>,
    users:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M20 20v-2a5 5 0 0 0-3-4.6"/></>,
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    alert:<><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
    close:<path d="M5 5 19 19M19 5 5 19"/>,
    check:<path d="m4 12 5 5L20 6"/>,
    doc:<><path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7M9 16h7"/></>,
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
    filter:<><path d="M4 6h16M7 12h10M10 18h4"/></>,
    swap:<><path d="M4 7h16m-5-4 5 4-5 4M20 17H4m5-4-5 4 5 4"/></>,
    send:<><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></>,
    undo:<><path d="M3 10V4m0 6h6M3 10a9 9 0 1 1-1 6"/></>,
    trash:<><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.doc}</svg>;
}
function Pill({children,tone='neutral'}) { const toneCls=tone==='violet'?'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300':tone==='red'?'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300':'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'; return <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${toneCls}`}>{children}</span>; }
function SmallStat({label,value,detail}) { return <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</div>{detail && <div className="mt-0.5 text-xs text-slate-500">{detail}</div>}</div>; }
function Overlay({title,subtitle,onClose,children,large=false}) { return <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 ${large?'max-w-[1180px]':'max-w-[900px]'}`}><header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p></div><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Glyph name="close"/></button></header>{children}</section></div>; }
function Field({label,children}) { return <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>{label}</span>{children}</label>; }

function ImportModal({sessions,current,faculty,onClose,onDone}) {
  const currentData=sessions.find(s=>String(s._id)===String(current));
  const [meta,setMeta]=useState(currentData?{name:currentData.name,season:currentData.season,year:currentData.year,examType:currentData.examType}:initialMeta);
  const [files,setFiles]=useState([]);
  const [parsed,setParsed]=useState(null);
  const [working,setWorking]=useState(false);
  const [status,setStatus]=useState('');
  const [showAll,setShowAll]=useState(false);
  const [showOnlyMine,setShowOnlyMine]=useState(false);
  const [saving,setSaving]=useState(false);
  const updateMeta=(key,value)=>setMeta(m=>({...m,[key]:value}));
  const read=async()=>{
    setWorking(true);setParsed(null);
    try {
      const data=await extractExamDutyPdfs(files,(s)=>setStatus(s));
      if(!data.rows.length) throw Error('No exam rows were recognized. Please check the PDF layout or use a higher-quality export.');
      const emptyDates=data.rows.filter(r=>!r.date||!r.startTime||!r.endTime).length;
      if(emptyDates) throw Error(`${emptyDates} duty rows are missing date/time details. Please review the document.`);
      setParsed(data);setStatus('');
    } catch(e) {Swal.fire('Could not read the routine', apiError(e), 'error');}
    finally {setWorking(false);}
  };
  const mutateRow=(i,key,value)=>setParsed(old=>({...old,rows:old.rows.map((r,j)=>j===i?{...r,[key]:value}:r)}));
  const save=async()=>{
    if(!meta.name.trim()) return Swal.fire('List name required','Give this examination duty list a name.','warning');
    if(!parsed?.rows.length) return;
    if(parsed.documents.some(d=>d.missingPages?.length||d.warnings?.length)){
      const confirmed=await Swal.fire({title:'Review incomplete extraction',text:'At least one PDF page has no recognized rows or contains faculty codes not matched to the saved table. Check the highlighted warnings before importing.',icon:'warning',showCancelButton:true,confirmButtonText:'Save reviewed rows'});
      if(!confirmed.isConfirmed)return;
    }
    setSaving(true);
    try{
      const result=await importExamDutyRows({...meta,year:Number(meta.year),rows:parsed.rows,sources:parsed.documents});
      onDone(result);
      Swal.fire({title:'Routine saved',text:`${result.imported} unique records imported. ${result.totalRows} records now stored for this examination.`,icon:'success',confirmButtonColor:'#7c3aed'});
    }catch(e){Swal.fire('Import failed',apiError(e),'error');}
    finally{setSaving(false);}
  };
  const mine=parsed?.rows.filter(r=>facultyCodeMatches(r.invigilators,faculty.shortCode))||[];
  const shown=parsed?.rows.map((r,i)=>({...r,_index:i})).filter(r=>!showOnlyMine||facultyCodeMatches(r.invigilators,faculty.shortCode))||[];
  return <Overlay title="Import official examination routine" subtitle="Upload all Day, Evening, BBA and MBA/EMBA PDFs together — review recognition before saving." large onClose={onClose}>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-5 dark:border-violet-500/30 dark:bg-violet-500/5">
            <div className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-white"><Glyph name="upload"/> Routine PDFs</div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-slate-900 dark:text-violet-300"><Glyph name="doc"/> {files.length?`${files.length} PDF file${files.length===1?'':'s'} selected`:'Choose PDFs'}<input type="file" className="sr-only" multiple accept=".pdf,application/pdf" onChange={e=>{setFiles(Array.from(e.target.files||[]));setParsed(null);}} /></label>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">Text-layer extraction first, OCR for scanned pages. Original documents remain on your device.</p>
            {files.length>0 && <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">{files.map((f,i)=><li key={`${f.name}-${i}`} className="truncate">{i+1}. {f.name}</li>)}</ul>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Semester"><select className={cls} value={meta.season} onChange={e=>updateMeta('season',e.target.value)}>{seasonOptions.map(o=><option key={o}>{o}</option>)}</select></Field>
            <Field label="Year"><input className={cls} type="number" min="2020" max="2100" value={meta.year} onChange={e=>updateMeta('year',e.target.value)} /></Field>
            <Field label="Exam type"><select className={cls} value={meta.examType} onChange={e=>updateMeta('examType',e.target.value)}>{examOptions.map(o=><option key={o}>{o}</option>)}</select></Field>
            <Field label="Display name"><input className={cls} value={meta.name} placeholder="Fall 2026 Mid Term" onChange={e=>updateMeta('name',e.target.value)} /></Field>
          </div>
          <button type="button" className={`${secondary} w-full`} disabled={!files.length||working||saving} onClick={read}>{working?<span className="animate-pulse">{status||'Reading PDFs…'}</span>:<><Glyph name="search"/> Read & preview all PDFs</>}</button>
          <p className="text-xs leading-5 text-slate-500">One official routine is shared with every teacher for each semester and exam type. Existing sessions are managed by their original uploader. To completely replace an older import, delete its routine first, then upload the corrected PDFs.</p>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Recognition review</h3>{parsed && <div className="flex gap-1.5"><Pill>{parsed.rows.length} unique records</Pill><Pill tone="violet">{mine.length} for {faculty.shortCode}</Pill></div>}</div>
          {!parsed ? <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 text-center dark:border-slate-800 dark:bg-slate-900/30"><div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-400 dark:border-slate-800 dark:bg-slate-900"><Glyph name="doc" size={28}/></div><div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recognized rows will appear here</div><p className="max-w-[270px] text-xs leading-5 text-slate-500">You can inspect your entries before storing the complete routine.</p></div>:
            <><div className="space-y-1.5 rounded-xl border border-slate-200 p-3 dark:border-slate-800">{parsed.documents.map(d=><div key={d.name} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{d.name}</span><span className="shrink-0 font-semibold text-slate-500">{d.rows} rows · {d.pages} pg{d.pages===1?'':'s'}</span></div>)}{parsed.documents.some(d=>d.missingPages.length>0)&&<p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><Glyph name="alert"/> No records found on page(s): {parsed.documents.filter(d=>d.missingPages.length).map(d=>`${d.name} (${d.missingPages.join(', ')})`).join('; ')}. Please verify the PDF.</p>}{parsed.documents.some(d=>d.warnings?.length>0)&&<p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300"><Glyph name="alert"/> Potentially unmatched invigilator codes: {parsed.documents.flatMap(d=>(d.warnings||[]).map(w=>`${d.name}, page ${w.page} (${w.codes.join(', ')})`)).slice(0,12).join('; ')}. Review these pages before saving.</p>}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={showOnlyMine} onChange={e=>setShowOnlyMine(e.target.checked)} /> Only {faculty.shortCode}</label><label className="ml-auto flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} /> Review all rows</label></div>
              <div className="max-h-[315px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[820px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-900"><tr>{['Date','Start','End','Program','Intake','Sec.','Course','Teacher','Invigilators','Room'].map(x=><th className="px-2.5 py-2" key={x}>{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{shown.slice(0,showAll?shown.length:80).map(r=><tr key={r._index} className={facultyCodeMatches(r.invigilators,faculty.shortCode)?'bg-violet-50/40 dark:bg-violet-500/5':''}>{[['date',110],['startTime',104],['endTime',104],['program',160],['intake',65],['section',55],['course',120],['courseTeacher',70],['invigilators',140],['room',75]].map(([k,w])=><td key={k} className="px-1 py-1"><input aria-label={`${k} row ${r._index+1}`} style={{width:w}} value={r[k]||''} onChange={e=>mutateRow(r._index,k,e.target.value)} className="rounded-md border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-slate-300 focus:border-violet-400 dark:text-slate-100" /></td>)}</tr>)}</tbody></table></div>
              {!showAll&&shown.length>80&&<p className="text-xs text-slate-500">Showing the first 80 of {shown.length} rows. Select “Review all rows” to inspect more.</p>}
              <p className="text-[11px] leading-5 text-slate-500">Edit a cell directly if recognition needs correction. Every row (including other faculty members’ duties) will be stored so proxy search works later.</p>
            </>}
        </div>
      </div>
    </div>
    <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800"><button type="button" className={secondary} onClick={onClose}>Cancel</button><button type="button" className={primary} disabled={!parsed?.rows.length||working||saving} onClick={save}>{saving?'Saving…':`Save ${parsed?.rows.length||''} recognized duties`}</button></footer>
  </Overlay>;
}

function ProxyModal({sessionId,faculty,myRows,onClose,onAdded}){
  const [code,setCode]=useState('');const [searched,setSearched]=useState(null);const [busy,setBusy]=useState(false);const [adding,setAdding]=useState('');
  const search=async(e)=>{e?.preventDefault();const term=short(code);if(term===short(faculty.shortCode))return Swal.fire('Different short code needed','Search another faculty member to take a proxy duty.','warning');setBusy(true);setSearched(null);try{setSearched(await findFacultyExamDuties(sessionId,term));}catch(err){Swal.fire('Search failed',apiError(err),'error');}finally{setBusy(false);}};
  const add=async(row)=>{
    setAdding(String(row._id));
    try {
      if(row.conflicts.length){
        const confirmed=await Swal.fire({title:'Overlapping duty',html:`<div class="text-left text-sm">You already have ${row.conflicts.length} duty/duties at this time. You may be expected in two places simultaneously.<br/><br/><strong>Continue anyway?</strong></div>`,icon:'warning',showCancelButton:true,confirmButtonText:'Add with conflict',confirmButtonColor:'#b45309'});
        if(!confirmed.isConfirmed)return;
      }
      await acceptExamDutyProxy(sessionId,{recordId:row._id,originalCode:searched.code,allowConflict:row.conflicts.length>0});
      await onAdded();
      setSearched(old=>({...old,rows:old.rows.map(x=>x._id===row._id?{...x,alreadyAdded:true}:x)}));
      Swal.fire({title:'Proxy added',icon:'success',timer:1100,showConfirmButton:false});
    }catch(err){
      if(err.response?.data?.code==='DUTY_CONFLICT') {
        const confirm=await Swal.fire({title:'Scheduling conflict',text:err.response.data.message,icon:'warning',showCancelButton:true,confirmButtonText:'Add anyway'});
        if(confirm.isConfirmed){await acceptExamDutyProxy(sessionId,{recordId:row._id,originalCode:searched.code,allowConflict:true});await onAdded();setSearched(old=>({...old,rows:old.rows.map(x=>x._id===row._id?{...x,alreadyAdded:true}:x)}));}
      } else Swal.fire('Could not add proxy',apiError(err),'error');
    }finally{setAdding('');}
  };
  return <Overlay title="Take a proxy duty" subtitle="Search another faculty member by shortcode, then add the specific duty to your schedule." onClose={onClose}>
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <form onSubmit={search} className="flex gap-2"><input autoFocus placeholder="Faculty shortcode, e.g. JFM" className={`${cls} min-w-0 flex-1 uppercase`} value={code} onChange={e=>setCode(e.target.value)} maxLength={20} /><button type="submit" disabled={busy||short(code).length<2} className={primary}><Glyph name="search"/> {busy?'Searching…':'Search duties'}</button></form>
      <p className="mt-2 text-xs text-slate-500">You have {myRows.length} listed duties. We will warn you if the chosen proxy overlaps an existing assignment.</p>
      {searched && <div className="mt-5 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900 dark:text-white">{searched.rows.length} duties for {searched.code}</h3><Pill>Same examination session</Pill></div>
        {searched.rows.length===0?<div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800">No official duties found under this shortcode in the imported documents.</div>:<div className="space-y-2">{searched.rows.map(row=><div key={row._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="min-w-[125px]"><div className="text-sm font-bold text-slate-900 dark:text-white">{fmtDate(row.date)}</div><div className="text-xs text-slate-500">{row.time}</div></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.course} <span className="font-normal text-slate-500">· {row.room}</span></div><p className="mt-0.5 text-xs text-slate-500">{row.program} · Intake {row.intake||'—'} · Sec {row.section||'—'} · {row.invigilators}</p>{row.conflicts.length>0&&!row.alreadyAdded&&<span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300"><Glyph name="alert" size={13}/> Overlaps {row.conflicts.length} existing duty/duties</span>}</div><button type="button" className={row.alreadyAdded?`${secondary} cursor-default opacity-60`:primary} disabled={row.alreadyAdded||Boolean(adding)} onClick={()=>add(row)}>{row.alreadyAdded?<><Glyph name="check"/> Added</>:adding===String(row._id)?'Adding…':'Take proxy'}</button></div>)}</div>}
      </div>}
    </div>
  </Overlay>;
}

const overlapsLocal = (a,b) => a.date === b.date && getMinutes(a.startTime) < getMinutes(b.endTime) && getMinutes(b.startTime) < getMinutes(a.endTime);
const activeDuty = row => !['exchanged_out','transferred_out'].includes(row.assignment);

function DutyChangeModal({sessionId, source, myRows, faculty, initialMode='exchange', onClose, onDone}) {
  const [mode,setMode] = useState(initialMode);
  const [code,setCode] = useState('');
  const [result,setResult] = useState(null);
  const [busy,setBusy] = useState(false);
  const [acting,setActing] = useState('');
  const peerEntries = result?.peerSchedule || [];
  const allMine = myRows.filter(x => activeDuty(x) && !(x._id === source._id && x.assignment === 'official'));
  const others = (candidate) => peerEntries.filter(x => activeDuty(x) && (!candidate || x._id !== candidate._id));
  const conflictsFor = candidate => ({
    mine: candidate ? allMine.filter(x => overlapsLocal(x,candidate)) : [],
    theirs: others(candidate).filter(x => overlapsLocal(x,source)),
  });
  const search = async (e) => {
    e?.preventDefault();
    const query = short(code);
    if(query === short(faculty.shortCode)) return Swal.fire('Different faculty required','Enter another teacher’s shortcode.','warning');
    setBusy(true); setResult(null);
    try { setResult(await findFacultyExamDuties(sessionId,query)); }
    catch(err) { Swal.fire('Faculty search failed',apiError(err),'error'); }
    finally { setBusy(false); }
  };
  const apply = async (candidate=null) => {
    if (!result?.code) return Swal.fire('Faculty shortcode required','Search a faculty shortcode before continuing.','warning');
    if (mode==='exchange' && !candidate) return Swal.fire('Select a duty','Choose one official duty from the other faculty shortcode.','warning');
    if (candidate?.unavailable) return Swal.fire('Duty already reassigned','This faculty duty has already been exchanged or transferred. Refresh the search.','warning');
    const {mine,theirs} = conflictsFor(candidate);
    const hasConflict = Boolean(mine.length || theirs.length);
    const summary = mode === 'exchange'
      ? `Exchange ${source.course || 'reserved duty'} on ${fmtDate(source.date)} with ${result.code}'s ${candidate?.course} on ${fmtDate(candidate?.date)}? Both schedules will change immediately.`
      : `Give ${source.course || 'reserved duty'} on ${fmtDate(source.date)} to ${result.code}? This will be removed from your active duties and added to theirs immediately.`;
    const warning = hasConflict ? `\n\nScheduling warning: ${mine.length} overlap(s) in your new schedule; ${theirs.length} overlap(s) for ${result.code}.` : '';
    const noAccountNote = !result.faculty ? `\n\n${result.code} does not have a portal account. The arrangement will be stored against the faculty shortcode and will appear automatically if they register later. Verify the shortcode before confirming.` : '';
    const noPublishedDutyNote = mode==='transfer' && !peerEntries.length ? `\n\nNo existing assignments were found for ${result.code} in this imported exam session, so a complete availability check is not possible.` : '';
    const dialog=await Swal.fire({title: mode==='exchange'?'Confirm duty exchange':'Confirm duty transfer',text:summary+warning+noAccountNote+noPublishedDutyNote+'\n\nThe initiating teacher can revert this change; the recipient can also revert after signing into a matching faculty profile.',icon:hasConflict||!result.faculty?'warning':'question',showCancelButton:true,confirmButtonText:hasConflict?'Proceed despite overlap':mode==='exchange'?'Exchange duties':'Transfer duty',confirmButtonColor:hasConflict?'#b45309':'#7c3aed'});
    if(!dialog.isConfirmed)return;
    setActing(String(candidate?._id || 'transfer'));
    try {
      await applyExamDutyChange(sessionId, {kind:mode,sourceRecordId:source._id,targetRecordId:candidate?._id,targetCode:result.code,allowConflict:hasConflict});
      await onDone();
      Swal.fire({title:mode==='exchange'?'Duties exchanged':'Duty transferred',text:result.faculty?`Saved for ${faculty.shortCode} and ${result.code}.`:`Saved under ${faculty.shortCode} and ${result.code}. The recipient can access it after registering with that shortcode.`,icon:'success',timer:2300,showConfirmButton:false});
    } catch(err) {
      if(err.response?.data?.code==='DUTY_CONFLICT') Swal.fire('Schedule changed', 'Another duty now overlaps. Refresh and search again to review the current conflict.', 'warning');
      else Swal.fire('Could not update duty',apiError(err),'error');
    } finally { setActing(''); }
  };
  return <Overlay title="Exchange or transfer a duty" subtitle="Search by faculty shortcode — no portal account required. Changes are saved and reversible." onClose={onClose}>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 text-sm dark:border-violet-500/20 dark:bg-violet-500/5"><div className="text-[11px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">Your selected official duty</div><div className="mt-1 font-bold text-slate-900 dark:text-white">{source.course || 'Reserved / special assignment'} · {fmtDate(source.date)} · {source.time}</div><div className="mt-1 text-xs text-slate-500">{source.program} · Intake {source.intake || '—'} · Section {source.section || '—'} · Room {source.room}</div></div>
      <div role="tablist" aria-label="Duty arrangement" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900"><button type="button" role="tab" aria-selected={mode==='exchange'} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${mode==='exchange'?'bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300':'text-slate-500'}`} onClick={()=>setMode('exchange')}><span className="inline-flex items-center gap-2"><Glyph name="swap" size={15}/> Exchange duty</span></button><button type="button" role="tab" aria-selected={mode==='transfer'} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${mode==='transfer'?'bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300':'text-slate-500'}`} onClick={()=>setMode('transfer')}><span className="inline-flex items-center gap-2"><Glyph name="send" size={15}/> Give away duty</span></button></div>
      <form className="flex gap-2" onSubmit={search}><input autoFocus className={`${cls} min-w-0 flex-1 uppercase`} placeholder="Search faculty shortcode, e.g. JFM" value={code} maxLength={20} onChange={e=>{setCode(e.target.value);setResult(null);}}/><button type="submit" className={primary} disabled={busy||short(code).length<2}><Glyph name="search"/>{busy?'Searching…':'Find faculty'}</button></form>
      {result&& <div className="space-y-3">
        <div className="flex items-center justify-between gap-2"><div><div className="text-sm font-bold text-slate-900 dark:text-white">{result.faculty?.name || 'Faculty'} <span className="text-violet-600 dark:text-violet-300">({result.code})</span></div><p className="text-xs text-slate-500">{result.faculty?'Registered faculty account':'Faculty shortcode · no account needed'} · {peerEntries.filter(activeDuty).length} active duty/duties</p></div><Pill>Same exam session</Pill></div>
        {!result.faculty&&<div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200">No portal account is required. This arrangement will be saved under <strong>{result.code}</strong> and will become visible to that faculty when an account with this shortcode is created. Please verify the shortcode.</div>}
        {mode==='transfer' ? <div className="space-y-3"><div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><p className="text-sm font-semibold text-slate-900 dark:text-white">Give this duty to {result.code}</p><p className="mt-1 text-xs text-slate-500">The original routine stays unchanged. Your assignment will show “Transferred to {result.code}” with a Revert option. The recipient can see it if they have an account, or when they register later.</p>{conflictsFor(null).theirs.length>0&&<p className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-600"><Glyph name="alert" size={15}/> {result.code} already has {conflictsFor(null).theirs.length} overlapping assignment(s).</p>}<button type="button" className={`${primary} mt-3`} disabled={Boolean(acting)} onClick={()=>apply(null)}><Glyph name="send"/>{acting?'Transferring…':'Transfer selected duty'}</button></div><div className="text-xs font-semibold text-slate-500">Current duties for {result.code}</div>{peerEntries.filter(activeDuty).length ? peerEntries.filter(activeDuty).map(x=><div key={x._id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"><span>{fmtDate(x.date)} · {x.time} · {x.course} · Room {x.room}</span>{overlapsLocal(x,source)&&<span className="font-bold text-amber-600">Overlaps</span>}</div>):<p className="text-xs text-slate-500">No existing duties. The transfer can still be made.</p>}</div> : <div className="space-y-2"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Select one of {result.code}’s official duties to exchange</h3>{result.rows.length ? result.rows.map(candidate => { const conflicts=conflictsFor(candidate);return <div key={candidate._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="min-w-[126px]"><div className="text-sm font-bold text-slate-900 dark:text-white">{fmtDate(candidate.date)}</div><div className="text-xs text-slate-500">{candidate.time}</div></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{candidate.course || 'Reserved duty'} <span className="font-normal text-slate-500">· Room {candidate.room}</span></div><p className="text-xs text-slate-500">{candidate.program} · Intake {candidate.intake||'—'} · Sec {candidate.section||'—'} · {candidate.invigilators}</p>{candidate.unavailable&&<p className="mt-1 text-xs font-semibold text-rose-600">Already exchanged / transferred</p>}{!candidate.unavailable&&(conflicts.mine.length>0||conflicts.theirs.length>0)&&<p className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-600"><Glyph name="alert" size={14}/> Overlap: You {conflicts.mine.length}, {result.code} {conflicts.theirs.length}</p>}</div><button type="button" className={primary} disabled={Boolean(acting)||candidate.unavailable||candidate.alreadyAdded} onClick={()=>apply(candidate)}><Glyph name="swap" size={16}/>{candidate.unavailable?'Unavailable':candidate.alreadyAdded?'Already assigned':acting===String(candidate._id)?'Exchanging…':'Exchange'}</button></div>; }):<div className="rounded-xl border border-slate-200 p-5 text-center text-sm text-slate-500 dark:border-slate-800">No official assignments found for this faculty in the selected examination.</div>}</div>}
      </div>}
    </div>
  </Overlay>;
}

function DutyTable({rows,onRemoveProxy,onChangeDuty,onRevert}) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[1110px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">{['Date & day','Time','Program','Intake','Sec.','Course No.','Course teacher','Invigilators','Room','Assignment'].map(h=><th key={h} className="whitespace-nowrap px-3.5 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map(r=><tr key={r._id} className={`transition hover:bg-slate-50 dark:hover:bg-slate-800/40 ${r.changeSide==='outgoing'?'bg-slate-50/70 dark:bg-slate-900/35':''}`}><td className="whitespace-nowrap px-3.5 py-3.5"><strong className="font-bold text-slate-900 dark:text-white">{fmtDate(r.date)}</strong><div className="text-xs text-slate-500">{r.day||dayOf(r.date)}</div></td><td className="whitespace-nowrap px-3.5 py-3.5"><div className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{r.startTime}</div><div className="text-xs tabular-nums text-slate-500">to {r.endTime}</div></td><td className="max-w-[180px] px-3.5 py-3.5 text-xs font-medium text-slate-600 dark:text-slate-300">{r.program||'—'}</td><td className="px-3.5 py-3.5 text-slate-700 dark:text-slate-200">{r.intake||'—'}</td><td className="px-3.5 py-3.5 text-slate-700 dark:text-slate-200">{r.section||'—'}</td><td className="whitespace-nowrap px-3.5 py-3.5 font-bold text-slate-900 dark:text-white">{r.course||'—'}</td><td className="px-3.5 py-3.5 text-slate-600 dark:text-slate-300">{r.courseTeacher||'—'}</td><td className="px-3.5 py-3.5 text-xs text-slate-600 dark:text-slate-300">{r.invigilators||'—'}</td><td className="px-3.5 py-3.5 font-semibold text-slate-700 dark:text-slate-200">{r.room||'—'}</td><td className="px-3.5 py-3.5"><div className="flex min-w-[106px] flex-col items-start gap-1.5"><Pill tone={r.changeSide==='outgoing'?'red':r.changeId||r.assignment==='proxy'||r.category==='reserved'?'violet':'neutral'}>{r.assignment==='exchanged_out'?`Exchanged with ${r.counterpartyCode}`:r.assignment==='transferred_out'?`Transferred to ${r.counterpartyCode}`:r.assignment==='exchange'?`Exchange · ${r.counterpartyCode}`:r.assignment==='transfer'?`From ${r.counterpartyCode}`:r.assignment==='proxy'?`Proxy · ${r.originalCode||''}`:r.category==='reserved'?'Reserved':r.category==='support'?'IT support':'Official'}</Pill>{r.changeSide==='outgoing'&&<span className="text-[10px] text-slate-500">Not an active duty</span>}{r.conflicts?.length>0&&<span title="Overlapping duties" className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"><Glyph name="alert" size={12}/> Time overlap</span>}{r.assignment==='proxy'&&<button type="button" onClick={()=>onRemoveProxy(r)} className="text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400">Remove proxy</button>}{r.changeId&&<button type="button" onClick={()=>onRevert(r)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline dark:text-rose-400"><Glyph name="undo" size={12}/> Revert</button>}{r.assignment==='official'&&<><button type="button" onClick={()=>onChangeDuty(r,'exchange')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:underline dark:text-violet-400"><Glyph name="swap" size={12}/> Exchange duty</button><button type="button" onClick={()=>onChangeDuty(r,'transfer')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:underline dark:text-slate-300"><Glyph name="send" size={12}/> Give away</button></>}</div></td></tr>)}</tbody></table></div>;
}

function PrintableRoutine({session,faculty,rows,mode='current'}) { if(!session) return null; return <section className={`exam-duty-print-only exam-duty-print-${mode}`}><header className="duty-print-top"><div className="duty-print-brand">BUBT <span>· Faculty Examination Duty Routine</span></div><h1>{session.season} {session.year} — {session.examType} Examination</h1><p>{faculty.name} ({faculty.shortCode}) · {mode==='complete'?'Complete duty history (including reassigned-out entries)':'Current active assignments'}</p><div className="duty-print-info"><span>{rows.length} assigned duties</span><span>{new Date().toLocaleDateString('en-GB')}</span></div></header><table className="duty-print-table"><thead><tr><th>#</th><th>Date / Day</th><th>Time</th><th>Program</th><th>Intake</th><th>Sec.</th><th>Course</th><th>Teacher</th><th>Invigilators</th><th>Room</th><th>Type</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r._id}><td>{i+1}</td><td>{fmtDate(r.date)}<div>{r.day||dayOf(r.date)}</div></td><td>{r.startTime}<div>{r.endTime}</div></td><td>{r.program}</td><td>{r.intake}</td><td>{r.section}</td><td>{r.course}</td><td>{r.courseTeacher}</td><td>{r.invigilators}</td><td>{r.room}</td><td>{r.assignment==='exchanged_out'?`Exchanged with ${r.counterpartyCode} (given away)`:r.assignment==='transferred_out'?`Transferred to ${r.counterpartyCode} (given away)`:r.assignment==='exchange'?`Exchanged from ${r.counterpartyCode}`:r.assignment==='transfer'?`Transferred from ${r.counterpartyCode}`:r.assignment==='proxy'?`Proxy for ${r.originalCode||'faculty'}`:r.category==='reserved'?'Reserved':r.category==='support'?'IT support':'Official'}</td></tr>)}</tbody></table><footer>Generated from Faculty Exam Duties · BUBT Marks Portal</footer></section>; }

function DutyList() {
  const [sessions,setSessions]=useState([]),[selected,setSelected]=useState(''),[faculty,setFaculty]=useState({name:'Faculty',shortCode:''});
  const [schedule,setSchedule]=useState(null),[loading,setLoading]=useState(true),[loadRows,setLoadRows]=useState(false),[error,setError]=useState('');
  const [printOpen,setPrintOpen]=useState(false),[importOpen,setImportOpen]=useState(false),[proxyOpen,setProxyOpen]=useState(false),[changeTarget,setChangeTarget]=useState(null),[search,setSearch]=useState(''),[type,setType]=useState('all'),[assignment,setAssignment]=useState('all');
  const reloadSessions=useCallback(async(preferred)=>{
    setLoading(true);setError('');try{
      const data=await listExamDutySessions();setSessions(data.sessions||[]);setFaculty(data.faculty||{name:'Faculty',shortCode:''});
      setSelected(old => {
        const all = data.sessions || [];
        if (preferred && all.some(s => String(s._id) === String(preferred))) return String(preferred);
        if (old && all.some(s => String(s._id) === String(old))) return String(old);
        // A newly signed-in teacher immediately sees the shared session with
        // duties matching their own profile shortcode, without importing PDFs.
        return String((all.find(s => s.myOfficial > 0 || s.myProxies > 0) || all[0])?._id || '');
      });
    }catch(e){setError(apiError(e));}finally{setLoading(false);}
  },[]);
  useEffect(()=>{reloadSessions();},[reloadSessions]);
  const reloadRows=useCallback(async()=>{if(!selected){setSchedule(null);return;}setLoadRows(true);try{setSchedule(await getMyExamDutySchedule(selected));setError('');}catch(e){setError(apiError(e));setSchedule(null);}finally{setLoadRows(false);}},[selected]);
  useEffect(()=>{reloadRows();},[reloadRows]);
  const active=sessions.find(s=>String(s._id)===String(selected));
  const rows=useMemo(()=>(schedule?.rows||[]).slice().sort(ordered),[schedule]);
  const visible=useMemo(()=>rows.filter(r=>{
    if(type!=='all'&&classified(r)!==type)return false;
    if(assignment==='reserved'&&r.category!=='reserved')return false;
    if(assignment==='support'&&r.category!=='support')return false;
    if(assignment==='official'&&(r.assignment!=='official'||r.category!=='exam'))return false;
    if(assignment==='proxy'&&r.assignment!=='proxy')return false;
    if(assignment==='changed'&&!r.changeId)return false;
    if(!search.trim())return true;
    const q=search.trim().toLowerCase();return [r.date,r.day,r.program,r.course,r.intake,r.section,r.courseTeacher,r.invigilators,r.room].some(x=>String(x||'').toLowerCase().includes(q));
  }),[rows,type,assignment,search]);
  const activeRows=rows.filter(activeDuty);
  const official=activeRows.filter(r=>r.category==='exam'&&r.assignment==='official').length,reserved=activeRows.filter(r=>r.category==='reserved').length,proxies=activeRows.filter(r=>r.assignment==='proxy').length,overlapping=activeRows.filter(r=>r.conflicts?.length).length;
  const moved=activeRows.filter(r=>r.changeSide==='incoming').length;
  const printRoutine=(mode)=>{
    setPrintOpen(false);
    document.documentElement.dataset.examDutyPrintMode=mode;
    window.print();
  };
  const deleteRoutine=async()=>{
    if (!active?.canDelete) return;
    const label = `${active.season} ${active.year} ${active.examType}`;
    const response = await Swal.fire({
      title:'Delete shared examination routine?',
      html:`<div class="text-left text-sm leading-6">This deletes <strong>${active.totalRows || 0} stored records</strong> from <strong>${label}</strong>, including the uploaded routine data and <strong>everyone’s proxy, exchange and transfer assignments for this exam</strong>.<br/><br/>This affects every faculty account. Billing history and other exam sessions are not changed.<br/><br/>Type <strong>DELETE</strong> to confirm.</div>`,
      icon:'warning', input:'text', inputPlaceholder:'Type DELETE', showCancelButton:true,
      confirmButtonText:'Permanently delete routine', confirmButtonColor:'#dc2626',
      preConfirm:(value)=> { if(String(value||'').trim().toUpperCase() !== 'DELETE') { Swal.showValidationMessage('Type DELETE to confirm.'); return false; } return true; },
    });
    if(!response.isConfirmed)return;
    setLoading(true);
    try {
      const result = await deleteExamDutySession(active._id, label);
      setSchedule(null); setSelected(''); setSearch('');
      await reloadSessions();
      await Swal.fire({title:'Routine deleted',text:`${result.deletedRecords} records removed. Faculty will no longer see this examination until a corrected routine is uploaded.`,icon:'success'});
    } catch(e) { await Swal.fire('Could not delete routine',apiError(e),'error'); }
    finally { setLoading(false); }
  };
  const remove=async(row)=>{const result=await Swal.fire({title:'Remove this proxy duty?',text:`${fmtDate(row.date)} · ${row.course} · Room ${row.room}`,icon:'question',showCancelButton:true,confirmButtonText:'Remove proxy',confirmButtonColor:'#dc2626'});if(!result.isConfirmed)return;try{await removeExamDutyProxy(selected,row._id);await reloadRows();await reloadSessions(selected);}catch(e){Swal.fire('Could not remove proxy',apiError(e),'error');}};
  const revert=async(row)=>{
    const response=await Swal.fire({title:'Revert this duty arrangement?',text:`Restore the original official assignments for you and ${row.counterpartyCode}? This updates both faculty schedules immediately.`,icon:'warning',showCancelButton:true,confirmButtonText:'Revert arrangement',confirmButtonColor:'#dc2626'});
    if(!response.isConfirmed)return;
    try{await revertExamDutyChange(selected,row.changeId);await reloadRows();await reloadSessions(selected);Swal.fire({title:'Original duties restored',icon:'success',timer:1400,showConfirmButton:false});}
    catch(e){Swal.fire('Could not revert',apiError(e),'error');}
  };
  return <div className="space-y-5">
    <section className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 lg:flex-row lg:items-center lg:justify-between sm:p-6"><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-600/15"><Glyph name="calendar" size={24}/></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">My invigilation schedule</h2><Pill tone="violet">{faculty.shortCode||'Faculty'}</Pill></div><div className="mt-3"><label htmlFor="exam-duty-session" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Examination session</label><select id="exam-duty-session" className={`${cls} w-full min-w-[230px] max-w-[440px] sm:min-w-[340px]`} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{loading?'Loading examinations…':'Choose an examination'}</option>{sessions.map(s=><option key={s._id} value={s._id}>{sessionName(s)} ({s.totalRows||0} stored)</option>)}</select></div></div></div><div className="flex flex-wrap gap-2"><div className="relative"><button type="button" aria-expanded={printOpen} aria-haspopup="menu" className={secondary} onClick={()=>setPrintOpen(v=>!v)} disabled={!rows.length}><Glyph name="printer"/> Print routine <span className="text-slate-400">⌄</span></button>{printOpen&&<div role="menu" aria-label="Print routine options" className="absolute right-0 z-30 mt-2 w-[290px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"><button role="menuitem" type="button" onClick={()=>printRoutine('complete')} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-violet-50 dark:hover:bg-slate-800"><span className="block text-sm font-semibold text-slate-900 dark:text-white">Complete duty record</span><span className="mt-0.5 block text-xs text-slate-500">Official, proxies, exchanges, transfers and given-away duties</span></button><button role="menuitem" type="button" onClick={()=>printRoutine('current')} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-violet-50 dark:hover:bg-slate-800"><span className="block text-sm font-semibold text-slate-900 dark:text-white">Current active routine</span><span className="mt-0.5 block text-xs text-slate-500">Only duties you are currently assigned to perform</span></button></div>}</div><button type="button" className={secondary} onClick={()=>setProxyOpen(true)} disabled={!selected}><Glyph name="users"/> Proxy duty</button><button type="button" className={primary} onClick={()=>setImportOpen(true)}><Glyph name="upload"/> {active&&!active.canDelete?"Import different exam":"Import PDFs"}</button>{active?.canDelete&&<button type="button" className={danger} onClick={deleteRoutine} disabled={loading}><Glyph name="trash"/> Delete routine</button>}</div></section>
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
    {active&&<p className="text-right text-xs text-slate-500">{active.totalRows} shared records · {new Set((active.sourceFiles||[]).map(f=>f.name)).size} PDF source(s)</p>}
    {active&&<div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><SmallStat label="My total duties" value={activeRows.length} detail={`${official} official · ${reserved} reserved · ${moved} received`}/><SmallStat label="Official duties" value={official} detail="Original invigilation remaining"/><SmallStat label="Proxy duties" value={proxies} detail="Added manually"/><SmallStat label="Overlapping slots" value={overlapping} detail="Review scheduling conflicts"/></div>}
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70"><div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-base font-bold text-slate-900 dark:text-white">Faculty duty list</h3><p className="mt-0.5 text-xs text-slate-500">Sorted by examination date and start time. Day duties appear before evening duties on the same date.</p></div>{active&&<div className="flex flex-wrap items-center gap-2"><div className="relative flex items-center"><span className="pointer-events-none absolute left-3 text-slate-400"><Glyph name="search" size={16}/></span><input className={`${cls} w-full pl-9 sm:w-[210px]`} placeholder="Search the routine" value={search} onChange={e=>setSearch(e.target.value)} /></div><select aria-label="Duty time" value={type} onChange={e=>setType(e.target.value)} className={cls}><option value="all">All times</option><option value="day">Day</option><option value="evening">Evening</option><option value="review">Needs review</option></select><select aria-label="Assignment type" value={assignment} onChange={e=>setAssignment(e.target.value)} className={cls}><option value="all">All duties</option><option value="official">Invigilation</option><option value="reserved">Reserved</option><option value="support">IT support</option><option value="proxy">Proxy</option><option value="changed">Exchanged / transferred</option></select></div>}</div>
      {loading||loadRows?<div className="flex min-h-[250px] items-center justify-center text-sm font-medium text-slate-500">Loading your examination duties…</div>:!active?<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-5 text-center"><div className="rounded-2xl bg-violet-50 p-4 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"><Glyph name="upload" size={28}/></div><h4 className="text-lg font-bold text-slate-900 dark:text-white">No exam routine uploaded yet</h4><p className="max-w-md text-sm text-slate-500">Upload the official PDF routines together to build the shared examination schedule. Only duties matching your profile shortcode will appear in your list.</p><button type="button" className={primary} onClick={()=>setImportOpen(true)}>Import official PDFs <Glyph name="arrow"/></button></div>:visible.length?<DutyTable rows={visible} onRemoveProxy={remove} onChangeDuty={(row,mode)=>setChangeTarget({row,mode})} onRevert={revert}/>:<div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-6 text-center"><h4 className="font-bold text-slate-900 dark:text-white">No matching duties</h4><p className="max-w-md text-sm text-slate-500">{rows.length?'Clear the search or filters to see your assignments.':'No duties for your shortcode in this examination yet. You can still search and take proxy duties.'}</p></div>}
      {active&&visible.length>0&&<div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800">Showing {visible.length} rows · {activeRows.length} active duties. Reassigned-out rows appear in the complete print record, but not in the current active routine.</div>}
    </section>
    {active&&<><PrintableRoutine session={active} faculty={faculty} rows={activeRows} mode="current"/><PrintableRoutine session={active} faculty={faculty} rows={rows} mode="complete"/></>}
    {importOpen&&<ImportModal current={active?.canDelete ? selected : ""} sessions={sessions} faculty={faculty} onClose={()=>setImportOpen(false)} onDone={async(data)=>{setImportOpen(false);await reloadSessions(String(data.sessionId));if(String(data.sessionId)===String(selected))await reloadRows();}}/>}
    {changeTarget&&selected&&<DutyChangeModal sessionId={selected} source={changeTarget.row} initialMode={changeTarget.mode} faculty={faculty} myRows={rows} onClose={()=>setChangeTarget(null)} onDone={async()=>{setChangeTarget(null);await reloadRows();await reloadSessions(selected);}}/>}
    {proxyOpen&&selected&&<ProxyModal sessionId={selected} faculty={faculty} myRows={rows} onClose={()=>setProxyOpen(false)} onAdded={async()=>{await reloadRows();await reloadSessions(selected);}}/>}
  </div>;
}

export default function TeacherExamDutiesPage(){
  const [params,setParams]=useSearchParams();const current=params.get('tab')==='calculations'?'calculations':'list';
  return <div className="mx-auto w-full max-w-[1680px] space-y-5 pb-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Faculty workspace</div><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Exam Duties</h1></div><div className="inline-flex w-full gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900 sm:w-auto" role="tablist" aria-label="Exam duties sections"><button role="tab" aria-selected={current==='list'} type="button" onClick={()=>setParams({tab:'list'})} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${current==='list'?'bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300':'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}><Glyph name="calendar"/> Duty list</button><button role="tab" aria-selected={current==='calculations'} type="button" onClick={()=>setParams({tab:'calculations'})} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${current==='calculations'?'bg-white text-violet-700 shadow-sm dark:bg-slate-800 dark:text-violet-300':'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}><Glyph name="calculator"/> Calculations</button></div></div>{current==='list'?<DutyList/>:<TeacherCalculationsPage/>}</div>;
}
