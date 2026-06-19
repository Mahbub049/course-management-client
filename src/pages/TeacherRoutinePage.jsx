import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getMyRoutine } from "../services/routineService";

const DEFAULT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

const DEFAULT_TIME_SLOTS = [
  { id: "slot_1", label: "08:15 AM to\n09:45 AM\n(Day)", start: "08:15 AM", end: "09:45 AM", shift: "Day" },
  { id: "slot_2", label: "09:45 AM to\n11:15 AM\n(Day)", start: "09:45 AM", end: "11:15 AM", shift: "Day" },
  { id: "slot_3", label: "11:15 AM to\n12:45 PM\n(Day)", start: "11:15 AM", end: "12:45 PM", shift: "Day" },
  { id: "slot_4", label: "01:15 PM to\n02:45 PM\n(Day)", start: "01:15 PM", end: "02:45 PM", shift: "Day" },
  { id: "slot_5", label: "02:45 PM to\n04:15 PM\n(Day)", start: "02:45 PM", end: "04:15 PM", shift: "Day" },
  { id: "slot_6", label: "04:15 PM to\n05:45 PM\n(Day)", start: "04:15 PM", end: "05:45 PM", shift: "Day" },
  { id: "slot_7", label: "08:00 AM to\n09:15 AM\n(EVE)", start: "08:00 AM", end: "09:15 AM", shift: "EVE" },
  { id: "slot_8", label: "09:15 AM to\n10:30 AM\n(EVE)", start: "09:15 AM", end: "10:30 AM", shift: "EVE" },
  { id: "slot_9", label: "03:15 PM to\n04:30 PM\n(EVE)", start: "03:15 PM", end: "04:30 PM", shift: "EVE" },
  { id: "slot_10", label: "04:30 PM to\n05:45 PM\n(EVE)", start: "04:30 PM", end: "05:45 PM", shift: "EVE" },
  { id: "slot_11", label: "05:45 PM to\n07:00 PM\n(EVE)", start: "05:45 PM", end: "07:00 PM", shift: "EVE" },
  { id: "slot_12", label: "07:00 PM to\n08:15 PM\n(EVE)", start: "07:00 PM", end: "08:15 PM", shift: "EVE" },
  { id: "slot_13", label: "08:15 PM to\n09:30 PM\n(EVE)", start: "08:15 PM", end: "09:30 PM", shift: "EVE" },
];

function ensureCells(cells = {}, days = DEFAULT_DAYS, timeSlots = DEFAULT_TIME_SLOTS) {
  const next = {};

  days.forEach((day) => {
    next[day] = {};
    timeSlots.forEach((slot) => {
      next[day][slot.id] = String(cells?.[day]?.[slot.id] || "").trim();
    });
  });

  return next;
}

function createRoutineShell(overrides = {}) {
  const days = Array.isArray(overrides.days) && overrides.days.length ? overrides.days : DEFAULT_DAYS;
  const timeSlots =
    Array.isArray(overrides.timeSlots) && overrides.timeSlots.length
      ? overrides.timeSlots
      : DEFAULT_TIME_SLOTS;

  return {
    title: overrides.title || "Class Routine",
    universityName:
      overrides.universityName || "Bangladesh University of Business and Technology (BUBT)",
    facultyName: overrides.facultyName || localStorage.getItem("marksPortalName") || "",
    facultyCode: overrides.facultyCode || "",
    department: overrides.department || "",
    buildingNote: overrides.buildingNote || "",
    revision: overrides.revision || "",
    lastModifiedText: overrides.lastModifiedText || "",
    days,
    timeSlots,
    cells: ensureCells(overrides.cells || {}, days, timeSlots),
    courses: Array.isArray(overrides.courses) ? overrides.courses : [],
    counsellingSlots: Array.isArray(overrides.counsellingSlots) ? overrides.counsellingSlots : [],
    sourceFileName: overrides.sourceFileName || "",
    importedAt: overrides.importedAt || null,
  };
}

function getCellLines(value = "") {
  return String(value)
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSlotTime(slot) {
  if (slot?.start && slot?.end) return `${slot.start} - ${slot.end}`;
  return String(slot?.label || "").replace(/\n/g, " ");
}

function getSlotShift(slot) {
  return slot?.shift || (String(slot?.label || "").toLowerCase().includes("eve") ? "EVE" : "Day");
}

function RoutineTabs() {
  const linkClass = ({ isActive }) =>
    [
      "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
      isActive
        ? "bg-violet-600 text-white shadow-sm shadow-violet-500/25"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80",
    ].join(" ");

  return (
    <div className="print:hidden">
      <div className="inline-flex rounded-full border border-slate-200 bg-white/85 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <NavLink to="/teacher/routine" className={linkClass} end>
          Routine
        </NavLink>
        <NavLink to="/teacher/counselling" className={linkClass}>
          Counselling
        </NavLink>
      </div>
    </div>
  );
}

function RoutineCell({ value }) {
  const lines = getCellLines(value);

  if (!lines.length) {
    return <div className="routine-empty-cell h-full min-h-[54px] rounded-xl border border-dashed border-transparent" />;
  }

  const [course, section, ...details] = lines;

  return (
    <div className="routine-cell-card mx-auto flex min-h-[64px] max-w-[170px] flex-col items-center justify-center rounded-2xl border border-violet-400/25 bg-violet-500/[0.08] px-2.5 py-2 text-center shadow-sm shadow-violet-950/5 dark:border-violet-400/20 dark:bg-violet-500/10">
      <p className="routine-course w-full truncate text-[13px] font-bold leading-tight text-slate-950 dark:text-white">
        {course}
      </p>
      {section && (
        <p className="routine-section mt-0.5 text-[12px] font-semibold leading-tight text-slate-700 dark:text-slate-200">
          {section}
        </p>
      )}
      {details.length > 0 && (
        <p className="routine-room mt-1 rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] font-semibold leading-tight text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {details.join(" · ")}
        </p>
      )}
    </div>
  );
}

function TeacherRoutinePage() {
  const navigate = useNavigate();
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const visibleTimeSlots = useMemo(() => {
    if (!routine) return [];

    return routine.timeSlots.filter((slot) =>
      routine.days.some((day) => String(routine.cells?.[day]?.[slot.id] || "").trim())
    );
  }, [routine]);

  const daySummaries = useMemo(() => {
    if (!routine) return [];

    return routine.days.map((day) => {
      const classCount = routine.timeSlots.filter((slot) =>
        String(routine.cells?.[day]?.[slot.id] || "").trim()
      ).length;

      return { day, classCount };
    });
  }, [routine]);

  const filledCells = useMemo(() => {
    if (!routine) return 0;

    return routine.days.reduce((count, day) => {
      return (
        count +
        routine.timeSlots.filter((slot) =>
          String(routine.cells?.[day]?.[slot.id] || "").trim()
        ).length
      );
    }, 0);
  }, [routine]);

  const teachingDays = useMemo(
    () => daySummaries.filter((item) => item.classCount > 0).length,
    [daySummaries]
  );



  useEffect(() => {
    let ignore = false;

    const loadRoutine = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getMyRoutine();
        if (ignore) return;

        setRoutine(data?.routine ? createRoutineShell(data.routine) : null);
      } catch (err) {
        console.error(err);
        if (!ignore) setError(err?.response?.data?.message || "Could not load routine.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadRoutine();

    return () => {
      ignore = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-sm font-semibold text-slate-500 dark:text-slate-400">
        Loading routine...
      </div>
    );
  }

  return (
    <div className="space-y-5 routine-page-root">
      <RoutineTabs />

      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/85 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/70 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 bg-gradient-to-r from-violet-500/12 via-indigo-500/8 to-sky-500/10 p-5 dark:border-slate-800">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-200">
              <span>Weekly Class Schedule</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Routine
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              View your uploaded routine in a cleaner table and print a polished copy for official use.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/teacher/routine/manage")}
              className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-600/20 transition hover:bg-violet-700"
            >
              Create / Update
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={!routine || visibleTimeSlots.length === 0}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Print Routine
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-sm font-semibold text-rose-600 dark:text-rose-300 print:hidden">
          {error}
        </div>
      )}

      {!routine ? (
        <section className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-950/40 print:hidden">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">No routine saved yet</h2>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Upload the routine PDF from the create/update page. After saving, the clean routine table will appear here.
          </p>

          <button
            type="button"
            onClick={() => navigate("/teacher/routine/manage")}
            className="mt-5 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            Create Routine
          </button>
        </section>
      ) : visibleTimeSlots.length === 0 ? (
        <section className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-950/40 print:hidden">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">No class found in this routine</h2>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            The routine is saved, but all time slots are empty. Upload again or update the routine manually.
          </p>

          <button
            type="button"
            onClick={() => navigate("/teacher/routine/manage")}
            className="mt-5 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            Update Routine
          </button>
        </section>
      ) : (
        <>
          <section className="routine-print-area overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white/85 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/45 print:block print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
            <div className="routine-print-header hidden print:block">
              <h1>{routine.universityName}</h1>
              <h2>{routine.title || "Class Routine"}</h2>
              <div className="routine-print-meta">
                <span>Faculty: {routine.facultyName || "—"}</span>
                {routine.department && <span>Department: {routine.department}</span>}
                {routine.facultyCode && <span>Code: {routine.facultyCode}</span>}
                {routine.sourceFileName && <span>Source: {routine.sourceFileName}</span>}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">Class Routine Table</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Only active time slots are shown to keep the view focused.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                {filledCells} saved classes
              </span>
            </div>

            <div className="routine-table-scroll overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 print:overflow-visible print:rounded-none print:border-0">
              <table className="routine-table w-full min-w-[1120px] table-fixed border-separate border-spacing-0 text-center text-slate-900 2xl:min-w-0 dark:text-slate-100 print:min-w-full print:border-collapse print:text-slate-950">
                <colgroup>
                  <col className="w-[8.5%]" />
                  {visibleTimeSlots.map((slot) => (
                    <col key={slot.id} style={{ width: `${91.5 / visibleTimeSlots.length}%` }} />
                  ))}
                </colgroup>

                <thead>
                  <tr>
                    <th className="routine-head-cell rounded-tl-2xl border-b border-r border-slate-200 bg-slate-100/90 px-3 py-3 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white print:rounded-none print:border print:border-black print:bg-slate-100 print:text-black">
                      Day / Time
                    </th>

                    {visibleTimeSlots.map((slot, index) => (
                      <th
                        key={slot.id}
                        className={[
                          "routine-head-cell border-b border-r border-slate-200 bg-slate-100/90 px-2.5 py-3 align-middle text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white print:border print:border-black print:bg-slate-100 print:text-black",
                          index === visibleTimeSlots.length - 1 ? "rounded-tr-2xl print:rounded-none" : "",
                        ].join(" ")}
                      >
                        <span className="block text-[13px] font-bold leading-tight">{getSlotTime(slot)}</span>
                        <span className="mt-1 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:bg-white/10 dark:text-slate-400 print:bg-transparent print:text-black">
                          {getSlotShift(slot)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {routine.days.map((day, dayIndex) => (
                    <tr key={day}>
                      <th
                        className={[
                          "routine-day-cell border-b border-r border-slate-200 bg-slate-50/90 px-3 py-4 text-base font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white print:border print:border-black print:bg-slate-50 print:text-black",
                          dayIndex === routine.days.length - 1 ? "rounded-bl-2xl print:rounded-none" : "",
                        ].join(" ")}
                      >
                        {day}
                      </th>

                      {visibleTimeSlots.map((slot, slotIndex) => {
                        const value = routine.cells?.[day]?.[slot.id] || "";
                        const isLastRow = dayIndex === routine.days.length - 1;
                        const isLastCol = slotIndex === visibleTimeSlots.length - 1;

                        return (
                          <td
                            key={`${day}-${slot.id}`}
                            className={[
                              "routine-body-cell h-[78px] border-b border-r border-slate-200 bg-white/40 px-2 py-2 align-middle dark:border-slate-700 dark:bg-slate-950/20 print:h-auto print:border print:border-black print:bg-white print:px-1.5 print:py-1.5",
                              isLastRow && isLastCol ? "rounded-br-2xl print:rounded-none" : "",
                            ].join(" ")}
                          >
                            <RoutineCell value={value} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="routine-print-footer hidden print:flex">
              <span>Total classes: {filledCells}</span>
              <span>Teaching days: {teachingDays}</span>
              <span>Printed from BUBT Marks Portal</span>
            </div>
          </section>
        </>
      )}

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          html, body { background: #ffffff !important; }
          body * { visibility: hidden; }
          .routine-print-area, .routine-print-area * { visibility: visible; }
          .routine-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            color: #000 !important;
            font-family: Arial, Helvetica, sans-serif !important;
          }
          .routine-print-header {
            display: block !important;
            margin-bottom: 8px;
            text-align: center;
          }
          .routine-print-header h1 {
            margin: 0;
            font-size: 15px;
            font-weight: 800;
            line-height: 1.2;
          }
          .routine-print-header h2 {
            margin: 3px 0 4px;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.2;
          }
          .routine-print-meta {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 8px;
            font-size: 8.5px;
            color: #111 !important;
          }
          .routine-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            page-break-inside: avoid;
          }
          .routine-head-cell,
          .routine-day-cell,
          .routine-body-cell {
            border: 1px solid #111 !important;
            box-shadow: none !important;
          }
          .routine-head-cell {
            padding: 4px 3px !important;
            background: #f1f5f9 !important;
            font-size: 8.5px !important;
            line-height: 1.15 !important;
          }
          .routine-head-cell span:first-child {
            font-size: 8px !important;
            line-height: 1.15 !important;
          }
          .routine-head-cell span:last-child {
            display: block !important;
            margin-top: 1px !important;
            padding: 0 !important;
            font-size: 6.8px !important;
            letter-spacing: 0 !important;
            background: transparent !important;
          }
          .routine-day-cell {
            padding: 5px 3px !important;
            background: #f8fafc !important;
            font-size: 10px !important;
            line-height: 1.2 !important;
          }
          .routine-body-cell {
            height: 41px !important;
            padding: 2px !important;
            vertical-align: middle !important;
          }
          .routine-cell-card {
            min-height: 0 !important;
            max-width: none !important;
            border: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 0 !important;
            color: #000 !important;
          }
          .routine-course {
            font-size: 8.7px !important;
            line-height: 1.1 !important;
            font-weight: 800 !important;
            color: #000 !important;
          }
          .routine-section {
            margin-top: 1px !important;
            font-size: 8.2px !important;
            line-height: 1.1 !important;
            font-weight: 700 !important;
            color: #000 !important;
          }
          .routine-room {
            margin-top: 1px !important;
            padding: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            font-size: 7.8px !important;
            line-height: 1.1 !important;
            font-weight: 700 !important;
            color: #000 !important;
          }
          .routine-empty-cell { display: none !important; }
          .routine-print-footer {
            display: flex !important;
            justify-content: space-between;
            gap: 8px;
            margin-top: 5px;
            border-top: 1px solid #111;
            padding-top: 4px;
            font-size: 7.5px;
            color: #111 !important;
          }
        }
      `}</style>
    </div>
  );
}

export default TeacherRoutinePage;
