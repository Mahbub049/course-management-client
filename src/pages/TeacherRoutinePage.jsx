import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { downloadRoutineDocument, getMyRoutine } from "../services/routineService";
import {
  DAY_LABELS,
  PRAYER_LUNCH,
  SLOT_MAP,
  createRoutineShell,
  getDocumentColumns,
} from "../utils/routineConfig";

function RoutineTabs() {
  const linkClass = ({ isActive }) =>
    [
      "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
      isActive
        ? "bg-violet-600 text-white shadow-sm shadow-violet-500/25"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80",
    ].join(" ");

  return (
    <div>
      <div className="inline-flex rounded-full border border-slate-200 bg-white/85 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <NavLink to="/teacher/routine" className={linkClass} end>Routine</NavLink>
        <NavLink to="/teacher/counselling" className={linkClass}>Counselling</NavLink>
      </div>
    </div>
  );
}

function entryLines(entry) {
  if (!entry) return [];
  if (entry.type !== "CLASS") return [entry.label || entry.type];
  return [
    entry.courseCode,
    entry.room,
    [entry.intake, entry.section].filter(Boolean).join("/"),
  ].filter(Boolean);
}

function TeacherRoutinePage() {
  const navigate = useNavigate();
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getMyRoutine();
        if (!active) return;
        setRoutine(data?.routine ? createRoutineShell(data.routine, data.defaults, data.profile, data.courses) : null);
      } catch (error) {
        console.error(error);
        Swal.fire("Failed", error?.response?.data?.message || "Could not load routine.", "error");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo(() => (routine ? getDocumentColumns(routine) : []), [routine]);

  const download = async (kind) => {
    try {
      setDownloading(kind);
      await downloadRoutineDocument(kind);
    } catch (error) {
      Swal.fire("Download failed", error?.response?.data?.message || "Create and save a valid routine first.", "error");
    } finally {
      setDownloading("");
    }
  };

  if (loading) {
    return <div className="flex min-h-[45vh] items-center justify-center text-sm font-semibold text-slate-500">Loading routine...</div>;
  }

  return (
    <div className="space-y-5 pb-10">
      <RoutineTabs />

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <span className="rounded-full border border-violet-300/40 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-700 dark:text-violet-300">Class Routine</span>
            <h1 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">Routine & Weekly Activities</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The Word downloads follow the two supplied university templates and omit unused time-slot columns.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button type="button" onClick={() => navigate("/teacher/routine/manage")} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Create / Update</button>
            <button type="button" onClick={() => window.open("/routine-reference", "_blank", "noopener,noreferrer")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold dark:border-slate-700">Schedule & Rooms</button>
            <button type="button" onClick={() => download("class-routine")} disabled={Boolean(downloading)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 disabled:opacity-60 dark:bg-emerald-500/10 dark:text-emerald-300">{downloading === "class-routine" ? "Preparing..." : "Download Routine"}</button>
            <button type="button" onClick={() => download("faculty-nameplate")} disabled={Boolean(downloading)} className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 disabled:opacity-60 dark:bg-sky-500/10 dark:text-sky-300">{downloading === "faculty-nameplate" ? "Preparing..." : "Download Nameplate"}</button>
          </div>
        </div>
      </section>

      {!routine ? (
        <section className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-950">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">No routine saved yet</h2>
          <p className="mt-2 text-sm text-slate-500">Create the weekly routine using the one-click activity builder.</p>
          <button type="button" onClick={() => navigate("/teacher/routine/manage")} className="mt-5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white">Create Routine</button>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Summary label="Semester" value={`${routine.semester} ${routine.year}`} />
            <Summary label="Working Days" value={`${routine.workingDays.length}`} />
            <Summary label="Working Hours" value={`${routine.totalWorkingHours || routine.validation?.summary?.totalWorkingHours || 0}`} />
            <Summary label="Status" value={routine.validation?.isValid ? "Ready" : "Needs Update"} good={routine.validation?.isValid} />
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-4">
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Saved Routine</h2>
              <p className="text-xs text-slate-500">Only time slots containing at least one class or weekly activity are shown.</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-[900px] border-collapse text-center">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-900">
                    <th className="sticky left-0 z-20 min-w-32 border-b border-r border-slate-200 bg-slate-100 p-3 text-xs font-black dark:border-slate-700 dark:bg-slate-900">Day / Time</th>
                    {columns.map((column) => column.kind === "lunch" ? (
                      <th key={column.id} className="min-w-24 border-b border-r border-slate-200 bg-amber-100 p-3 text-xs font-black text-amber-800 dark:border-slate-700 dark:bg-amber-500/10 dark:text-amber-300">P&L<br /><span className="font-medium">12:45-01:15</span></th>
                    ) : (
                      <th key={column.id} className="min-w-40 border-b border-r border-slate-200 p-3 text-xs font-black dark:border-slate-700"><span className="block">{SLOT_MAP[column.id].label}</span><span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">{SLOT_MAP[column.id].shift}</span></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {routine.days.map((day) => {
                    const working = routine.workingDays.includes(day);
                    return (
                      <tr key={day}>
                        <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white p-3 text-sm font-black dark:border-slate-700 dark:bg-slate-950">{DAY_LABELS[day]}</th>
                        {columns.map((column) => {
                          if (column.kind === "lunch") {
                            return <td key={column.id} className="border-b border-r border-slate-200 bg-amber-50 p-2 text-sm font-black text-amber-700 dark:border-slate-700 dark:bg-amber-500/5 dark:text-amber-300">{PRAYER_LUNCH.shortLabel}</td>;
                          }
                          const entry = routine.entries?.[day]?.[column.id];
                          const lines = entryLines(entry);
                          return (
                            <td key={column.id} className={`h-20 border-b border-r border-slate-200 p-2 text-xs dark:border-slate-700 ${working ? "bg-white dark:bg-slate-950" : "bg-slate-200 font-black text-slate-500 dark:bg-slate-900"}`}>
                              {working ? (lines.length ? lines.map((line, index) => <div key={`${line}-${index}`} className={index === 1 && entry?.type === "CLASS" ? "font-black" : "font-bold"}>{line}</div>) : null) : "OFF"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {!routine.validation?.isValid && routine.validation?.errors?.length > 0 && (
            <section className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-5 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
              <h2 className="font-black">Routine needs correction</h2>
              <div className="mt-2 space-y-1 text-sm">{routine.validation.errors.map((error) => <p key={error}>• {error}</p>)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ label, value, good }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-2 text-xl font-black ${good === false ? "text-rose-600" : good === true ? "text-emerald-600" : "text-slate-950 dark:text-white"}`}>{value}</p></div>;
}

export default TeacherRoutinePage;
