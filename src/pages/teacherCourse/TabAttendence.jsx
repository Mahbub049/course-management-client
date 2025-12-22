import { useEffect, useMemo, useState } from "react";
import { getCourseStudents } from "../../services/enrollmentService";
import {
  fetchAttendanceSummary,
  saveAttendanceSummary,
  fetchAttendanceSummaryFromSheet
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
  if (p > 90) return 5;
  if (p > 80) return 4;
  if (p > 70) return 3;
  if (p > 60) return 2;
  if (p > 50) return 1;
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

      // ✅ always load students first
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

      // ✅ summary is optional; even if it fails, page should still work
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
        // don't block students view
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

      // ✅ ensure every student has a row (missing ones become 0)
      students.forEach((s) => {
        if (!map[s.id]) map[s.id] = { attendedClasses: "0" };
      });

      setAttMap(map);

      Swal.fire({
        title: "Fetched!",
        text: "Attendance has been filled from daily attendance sheet. Now click Save Attendance.",
        icon: "success",
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
      {/* Header / Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  Attendance
                </span>
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  Auto Marks /5
                </span>
              </div>

              <h3 className="mt-2 text-lg font-semibold text-slate-900">
                Attendance Summary & Marks
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Marks rule: &gt;90=5, &gt;80=4, &gt;70=3, &gt;60=2, &gt;50=1, else 0
              </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              {/* Total Classes */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">
                  Total Classes
                </label>
                <input
                  type="number"
                  min="0"
                  className="h-10 w-40 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  value={globalTotal}
                  onChange={(e) => setGlobalTotal(Number(e.target.value || 0))}
                />
              </div>

              {/* Action */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFetchFromSheet}
                  disabled={syncing || loading || students.length === 0}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                >
                  {syncing ? "Fetching..." : "Fetch from Sheet"}
                </button>

                {/* <span className="hidden sm:block text-xs text-slate-500">
                  Auto-fills from daily attendance
                </span> */}
              </div>
            </div>


          </div>
        </div>

        {err && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Attendance Grid
            </h4>
            <p className="text-xs text-slate-500">
              Enter attended classes; percentage + marks are calculated automatically.
            </p>
          </div>

          <span className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            Students: {students.length}
          </span>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 animate-pulse" />
              Loading...
            </div>
          ) : students.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No students enrolled.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                        Roll
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                        Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                        Total Classes
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                        Attended
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                        Percentage
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                        Marks
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.s.enrollmentId}
                        className="border-b border-slate-100 hover:bg-slate-50/60"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="font-medium text-slate-800">
                            {r.s.roll}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-800">
                          {r.s.name}
                        </td>

                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                            {globalTotal}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                            value={r.attendedClasses}
                            onChange={(e) => updateField(r.s.id, e.target.value)}
                          />
                        </td>

                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                            {r.percentage.toFixed(2)}%
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
                            {r.marks}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
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
