import { useEffect, useMemo, useState } from "react";
import { getCourseStudents } from "../../services/enrollmentService";
import {
  fetchAttendanceSummary,
  saveAttendanceSummary,
  fetchAttendanceSummaryFromSheet,
} from "../../services/attendanceSummaryService";
import Swal from "sweetalert2";

function calcPercentage(total, attended) {
  const t = Number(total || 0);
  const a = Number(attended || 0);
  if (t <= 0) return 0;
  const p = (a / t) * 100;
  return Math.max(0, Math.min(100, p));
}

function calcMarks(p) {
  const percentage = Number(p || 0);

  if (percentage >= 91 && percentage <= 100) return 5;
  if (percentage >= 86 && percentage < 91) return 4;
  if (percentage >= 81 && percentage < 86) return 3;
  if (percentage >= 76 && percentage < 81) return 2;
  if (percentage >= 70 && percentage < 76) return 1;
  return 0;
}

export default function TabAttendance({ courseId }) {
  const [students, setStudents] = useState([]);
  const [attMap, setAttMap] = useState({});
  const [globalTotal, setGlobalTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr("");

      try {
        const studentsData = await getCourseStudents(courseId);
        setStudents(studentsData || []);
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.message || "Failed to load students");
        setStudents([]);
        setLoading(false);
        return;
      }

      try {
        const summaryData = await fetchAttendanceSummary(courseId);

        const map = {};
        (summaryData || []).forEach((r) => {
          map[r.student] = { attendedClasses: r.attendedClasses ?? "" };
        });
        setAttMap(map);

        const firstTotal = (summaryData || []).find(
          (r) => Number(r.totalClasses || 0) > 0
        );
        if (firstTotal) setGlobalTotal(Number(firstTotal.totalClasses));
      } catch (e) {
        console.warn("Attendance summary not available yet:", e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [courseId]);

  const rows = useMemo(() => {
    return students.map((s) => {
      const row = attMap[s.id] || { attendedClasses: "" };
      const percentage = calcPercentage(globalTotal, row.attendedClasses);
      const marks = calcMarks(percentage);

      return {
        s,
        attendedClasses: row.attendedClasses ?? "",
        percentage,
        marks,
      };
    });
  }, [students, attMap, globalTotal]);

  const stats = useMemo(() => {
    if (!rows.length) {
      return { avgPercentage: 0, avgMarks: 0, topPercentage: 0 };
    }

    const totalPercentage = rows.reduce((sum, r) => sum + Number(r.percentage || 0), 0);
    const totalMarks = rows.reduce((sum, r) => sum + Number(r.marks || 0), 0);
    const topPercentage = Math.max(...rows.map((r) => Number(r.percentage || 0)));

    return {
      avgPercentage: totalPercentage / rows.length,
      avgMarks: totalMarks / rows.length,
      topPercentage,
    };
  }, [rows]);

  const updateField = (studentId, value) => {
    setAttMap((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        attendedClasses: value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setErr("");

    try {
      const records = students.map((s) => {
        const row = attMap[s.id] || {};
        return {
          studentId: s.id,
          totalClasses: Number(globalTotal || 0),
          attendedClasses: Number(row.attendedClasses || 0),
        };
      });

      await saveAttendanceSummary(courseId, records);

      Swal.fire({
        title: "Attendance Saved!",
        text: "Attendance saved successfully.",
        icon: "success",
        confirmButtonColor: "#4f46e5",
      });
    } catch (e) {
      console.error(e);
      setErr(e?.response?.data?.message || "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const handleFetchFromSheet = async () => {
    if (!courseId) return;

    setSyncing(true);
    setErr("");

    try {
      const data = await fetchAttendanceSummaryFromSheet(courseId);

      const total = Number(data?.totalClasses || 0);
      setGlobalTotal(total);

      const map = {};
      (data?.records || []).forEach((r) => {
        map[r.studentId] = { attendedClasses: String(r.attendedClasses ?? 0) };
      });

      students.forEach((s) => {
        if (!map[s.id]) map[s.id] = { attendedClasses: "0" };
      });

      setAttMap(map);

      Swal.fire({
        title: "Fetched!",
        text: "Attendance has been filled from daily attendance sheet. Now click Save Attendance.",
        icon: "success",
        confirmButtonColor: "#4f46e5",
      });
    } catch (e) {
      console.error(e);
      setErr(e?.response?.data?.message || "Failed to fetch from attendance sheet");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-6 py-5 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Attendance
                </span>
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                  Auto Marks /5
                </span>
              </div>

              <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Attendance Summary & Marks
              </h3>

              <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                Marks rule: 91–100 = 5, 86–90 = 4, 81–85 = 3, 76–80 = 2, 70–75 = 1, below 70 = 0.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <StatPill label="Students" value={students.length} />
                <StatPill label="Avg %" value={stats.avgPercentage.toFixed(1)} />
                <StatPill label="Avg Marks" value={stats.avgMarks.toFixed(1)} />
                <StatPill label="Top %" value={stats.topPercentage.toFixed(1)} />
              </div>
            </div>

            <div className="w-full rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80 xl:w-auto xl:min-w-[360px]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Total Classes
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:w-44"
                    value={globalTotal}
                    onChange={(e) => setGlobalTotal(Number(e.target.value || 0))}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleFetchFromSheet}
                  disabled={syncing || loading || students.length === 0}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {syncing ? "Fetching..." : "Fetch from Sheet"}
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Pull attended classes automatically from the daily attendance sheet.
              </p>
            </div>
          </div>
        </div>

        {err && (
          <div className="border-t border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {err}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Attendance Grid
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Enter attended classes. Percentage and marks are calculated automatically.
            </p>
          </div>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Students: {students.length}
          </span>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-400" />
              Loading attendance...
            </div>
          ) : students.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              No students enrolled.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Roll
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Total Classes
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Attended
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Percentage
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Marks
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r) => (
                      <tr
                        key={r.s.enrollmentId}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {r.s.roll}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-slate-800 dark:text-slate-300">
                          {r.s.name}
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                            {globalTotal}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            className="h-11 w-28 rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            value={r.attendedClasses}
                            onChange={(e) => updateField(r.s.id, e.target.value)}
                          />
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {r.percentage.toFixed(2)}%
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <MarksBadge value={r.marks} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Attendance"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function MarksBadge({ value }) {
  const cls =
    value >= 5
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : value >= 4
        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
        : value >= 3
          ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
          : value >= 2
            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            : value >= 1
              ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${cls}`}
    >
      {value}
    </span>
  );
}