// client/src/pages/StudentAttendanceSheetPage.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchStudentCourses } from "../services/studentCourseService";
import { fetchStudentAttendanceSheet } from "../services/attendanceService";

export default function StudentAttendanceSheetPage() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");

  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadingCourses(true);
        const list = await fetchStudentCourses();
        const safeList = list || [];
        setCourses(safeList);

        if (safeList.length > 0 && !courseId) {
          setCourseId(safeList[0]._id || safeList[0].id || "");
        }
      } catch (e) {
        setErr(e?.response?.data?.message || "Failed to load courses");
      } finally {
        setLoadingCourses(false);
      }
    })();
  }, []);

  const handleView = async () => {
    if (!courseId) return setErr("Please select a course");
    setErr("");
    setData(null);

    try {
      setLoading(true);
      const res = await fetchStudentAttendanceSheet(courseId);
      setData(res);
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to fetch attendance");
    } finally {
      setLoading(false);
    }
  };

  const computed = useMemo(() => {
    if (!data) return null;

    const rows = Array.isArray(data.rows)
      ? [...data.rows].sort(sortAttendanceRowsLatestFirst)
      : [];
    const totalClasses = Number(data.totalClasses || rows.length || 0);
    const totalPresent = Number(data.totalPresent || 0);
    const percentage = Number(data.percentage || 0);

    return { rows, totalClasses, totalPresent, percentage };
  }, [data]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 sm:p-6 lg:p-7">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-600/20" />
        <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-600/20" />

        <div className="relative">
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 sm:inline-flex">
            <CalendarIcon />
            Attendance
          </div>

          <h1 className="mt-0 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:mt-3 sm:text-3xl">
            Attendance Sheet
          </h1>
          <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400 sm:block">
            Select a course to view your period-wise attendance records.
            Attendance reports can be submitted separately from the Issues Center.
          </p>
        </div>
      </section>

      {/* Filter / action */}
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr),auto] xl:items-end">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Course
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:px-4"
              disabled={loadingCourses}
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c._id || c.id} value={c._id || c.id}>
                  {c.code} – {c.title} (Sec {c.section}) – {c.semester} {c.year}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleView}
            disabled={loading || loadingCourses}
            className="h-12 rounded-2xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading..." : "View Attendance"}
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {err}
          </div>
        )}


      </section>

      {/* Summary */}
      {data && computed && (
        <>
          <section className="hidden gap-4 md:grid md:grid-cols-3">
            <SummaryCard
              label="Total Present"
              value={computed.totalPresent}
              sub={`${computed.totalClasses} total classes`}
            />
            <SummaryCard
              label="Attendance Percentage"
              value={`${computed.percentage}%`}
              sub="Current attendance rate"
            />
            <SummaryCard
              label="Course"
              value={data.course.code}
              sub={`${data.course.title} • Sec ${data.course.section}`}
            />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Attendance Records
                  </h2>
                  <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
                    {data.course.code} – {data.course.title} (Sec {data.course.section}) –{" "}
                    {data.course.semester} {data.course.year}
                  </p>
                </div>

                <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Present: {computed.totalPresent} / {computed.totalClasses}
                  <span className="mx-1 text-slate-300 dark:text-slate-600">•</span>
                  Percentage: {computed.percentage}%
                </div>
              </div>
            </div>

            {!computed.rows.length ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <EmptyIcon />
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  No attendance records found
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  No attendance has been taken yet for this course.
                </div>
              </div>
            ) : (
              <>
                {/* desktop table */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/70">
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Date
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Period
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {computed.rows.map((r) => (
                        <tr
                          key={`${r.date}-P${r.period}`}
                          className={[
                            "transition",
                            isAbsentStatus(r.status)
                              ? "bg-rose-100/95 hover:bg-rose-100 dark:bg-rose-950/45 dark:hover:bg-rose-950/55"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                          ].join(" ")}
                        >
                          <td className="px-6 py-4 text-slate-700 dark:text-slate-200">
                            {r.date}
                          </td>
                          <td className="px-6 py-4 text-center text-slate-700 dark:text-slate-200">
                            {r.period}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <AttendanceBadge status={r.status} />
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* mobile compact list */}
                <div className="grid gap-2.5 p-3 lg:hidden">
                  {computed.rows.map((r) => (
                    <div
                      key={`${r.date}-P${r.period}`}
                      className={[
                        "rounded-2xl border px-3.5 py-3",
                        isAbsentStatus(r.status)
                          ? "border-rose-300 bg-rose-100/95 dark:border-rose-500/35 dark:bg-rose-950/45"
                          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{r.date}</span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Period {r.period}</span>
                          </div>
                        </div>
                        <AttendanceBadge status={r.status} />
                      </div>


                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}


    </div>
  );
}

function getAttendanceSortTime(row) {
  const rawDate = row?.date || row?.attendanceDate || row?.createdAt || "";
  const text = String(rawDate).trim();

  if (!text) return 0;

  const parsed = new Date(text).getTime();
  if (!Number.isNaN(parsed)) return parsed;

  const ddMmYyyy = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]);
    const year = Number(ddMmYyyy[3]);
    const localDate = new Date(year, month - 1, day).getTime();
    return Number.isNaN(localDate) ? 0 : localDate;
  }

  return 0;
}

function sortAttendanceRowsLatestFirst(a, b) {
  const dateDiff = getAttendanceSortTime(b) - getAttendanceSortTime(a);
  if (dateDiff !== 0) return dateDiff;

  return Number(b?.period || 0) - Number(a?.period || 0);
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
  );
}

function normalizeAttendanceStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (["a", "absent", "absence"].includes(value)) return "absent";
  if (["p", "present"].includes(value)) return "present";
  if (["l", "late"].includes(value)) return "late";
  return value;
}

function isAbsentStatus(status) {
  return normalizeAttendanceStatus(status) === "absent";
}

function AttendanceBadge({ status }) {
  const normalized = normalizeAttendanceStatus(status);

  const cls =
    normalized === "present"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : normalized === "absent"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
      : normalized === "late"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
      : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300";

  return (
    <span
      className={`inline-flex min-w-20 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {normalized === "present" ? "Present" : normalized === "absent" ? "Absent" : normalized === "late" ? "Late" : status}
    </span>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 2v4M16 2v4" />
      <path d="M3 10h18" />
      <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg className="h-6 w-6 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 2v4M16 2v4" />
      <path d="M3 10h18" />
      <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M9 14h6" />
    </svg>
  );
}

