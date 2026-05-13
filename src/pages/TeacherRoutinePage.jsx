import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyRoutine } from "../services/routineService";

const DEFAULT_DAYS = ["Mon", "Tue", "Wed", "Thu"];

const DEFAULT_TIME_SLOTS = [
  { id: "slot_1", label: "08:15 AM to\n09:45 AM\n(Day)", start: "08:15 AM", end: "09:45 AM", shift: "Day" },
  { id: "slot_2", label: "11:15 AM to\n12:45 PM\n(Day)", start: "11:15 AM", end: "12:45 PM", shift: "Day" },
  { id: "slot_3", label: "01:15 PM to\n02:45 PM\n(Day)", start: "01:15 PM", end: "02:45 PM", shift: "Day" },
  { id: "slot_4", label: "04:15 PM to\n05:45 PM\n(Day)", start: "04:15 PM", end: "05:45 PM", shift: "Day" },
  { id: "slot_5", label: "05:45 PM to\n07:00 PM\n(EVE)", start: "05:45 PM", end: "07:00 PM", shift: "EVE" },
  { id: "slot_6", label: "07:00 PM to\n08:15 PM\n(EVE)", start: "07:00 PM", end: "08:15 PM", shift: "EVE" },
  { id: "slot_7", label: "08:15 PM to\n09:30 PM\n(EVE)", start: "08:15 PM", end: "09:30 PM", shift: "EVE" },
];

function createRoutineShell(overrides = {}) {
  const days =
    Array.isArray(overrides.days) && overrides.days.length
      ? overrides.days
      : DEFAULT_DAYS;

  const timeSlots =
    Array.isArray(overrides.timeSlots) && overrides.timeSlots.length
      ? overrides.timeSlots
      : DEFAULT_TIME_SLOTS;

  return {
    title: overrides.title || "Class Routine",
    universityName:
      overrides.universityName ||
      "Bangladesh University of Business and Technology (BUBT)",
    facultyName:
      overrides.facultyName || localStorage.getItem("marksPortalName") || "",
    facultyCode: overrides.facultyCode || "",
    department: overrides.department || "",
    buildingNote: overrides.buildingNote || "",
    revision: overrides.revision || "",
    lastModifiedText: overrides.lastModifiedText || "",
    days,
    timeSlots,
    cells: ensureCells(overrides.cells || {}, days, timeSlots),
    courses: Array.isArray(overrides.courses) ? overrides.courses : [],
    sourceFileName: overrides.sourceFileName || "",
    importedAt: overrides.importedAt || null,
  };
}

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

function TeacherRoutinePage() {
  const navigate = useNavigate();
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filledCells = useMemo(() => {
    if (!routine) return 0;

    return routine.days.reduce((count, day) => {
      return (
        count +
        routine.timeSlots.filter((slot) => routine.cells?.[day]?.[slot.id])
          .length
      );
    }, 0);
  }, [routine]);

  useEffect(() => {
    let ignore = false;

    const loadRoutine = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getMyRoutine();

        if (ignore) return;

        if (data?.routine) {
          setRoutine(createRoutineShell(data.routine));
        } else {
          setRoutine(null);
        }
      } catch (err) {
        console.error(err);
        if (!ignore) {
          setError(err?.response?.data?.message || "Could not load routine.");
        }
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
      <div className="flex min-h-[45vh] items-center justify-center text-base font-bold text-slate-500 dark:text-slate-400">
        Loading routine...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Routine
          </h1>

          {routine && (
            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {routine.days.length} days · {routine.timeSlots.length} slots ·{" "}
              {filledCells} classes
              {routine.sourceFileName ? ` · Source: ${routine.sourceFileName}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/teacher/routine/manage")}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-violet-700"
          >
            Create / Update
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={!routine}
            className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-black text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
          >
            Print
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-sm font-semibold text-rose-600 dark:text-rose-300 print:hidden">
          {error}
        </div>
      )}

      {!routine ? (
        <section className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700 print:hidden">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            No routine saved yet
          </h2>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Upload the routine PDF from the create/update page. After saving,
            only the final table will appear here.
          </p>

          <button
            type="button"
            onClick={() => navigate("/teacher/routine/manage")}
            className="mt-5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-violet-700"
          >
            Create Routine
          </button>
        </section>
      ) : (
        <section className="routine-print-area rounded-2xl border border-slate-800 bg-slate-950/30 p-2 shadow-sm print:border-0 print:bg-white print:p-0 print:shadow-none">
          <div className="overflow-x-auto rounded-xl border border-slate-700 print:overflow-visible print:rounded-none print:border-0">
            <table className="routine-table w-full min-w-[1120px] table-fixed border-collapse text-center text-slate-100 2xl:min-w-0 print:min-w-full print:text-slate-950">
              <colgroup>
                <col className="w-[8.5%]" />
                {routine.timeSlots.map((slot) => (
                  <col
                    key={slot.id}
                    style={{
                      width: `${91.5 / routine.timeSlots.length}%`,
                    }}
                  />
                ))}
              </colgroup>

              <thead>
                <tr>
                  <th className="border border-slate-700 bg-slate-900 px-3 py-3 text-base font-black text-white print:border-black print:bg-slate-100 print:text-black">
                    Day/Time
                  </th>

                  {routine.timeSlots.map((slot) => (
                    <th
                      key={slot.id}
                      className="whitespace-pre-line border border-slate-700 bg-slate-900 px-3 py-3 align-middle text-[14px] font-black leading-snug text-white xl:text-[15px] print:border-black print:bg-slate-100 print:text-black"
                    >
                      {slot.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {routine.days.map((day) => (
                  <tr key={day}>
                    <th className="border border-slate-700 bg-slate-900/80 px-3 py-4 text-xl font-black text-white print:border-black print:bg-slate-50 print:text-black">
                      {day}
                    </th>

                    {routine.timeSlots.map((slot) => {
                      const value = routine.cells?.[day]?.[slot.id] || "";

                      return (
                        <td
                          key={`${day}-${slot.id}`}
                          className="h-[90px] border border-slate-700 px-2 py-2 align-middle print:h-[86px] print:border-black print:bg-white"
                        >
                          <div className="whitespace-pre-line text-center text-[15px] font-black leading-snug text-slate-50 xl:text-[16px] print:text-black">
                            {value}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style>{`
        @media print {
          @page { 
            size: landscape; 
            margin: 10mm; 
          }

          body * { 
            visibility: hidden; 
          }

          .routine-print-area, 
          .routine-print-area * { 
            visibility: visible; 
          }

          .routine-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default TeacherRoutinePage;