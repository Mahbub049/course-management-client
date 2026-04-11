import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTeacherCourses } from "../services/courseService";
import { fetchAttendanceSheet } from "../services/attendanceService";
import * as XLSX from "xlsx-js-style";

// Sort helper: roll small -> big (numeric-safe)
const sortByRollAsc = (a, b) => {
  const ar = Number(a?.roll);
  const br = Number(b?.roll);

  if (!Number.isNaN(ar) && !Number.isNaN(br)) return ar - br;
  return String(a?.roll || "").localeCompare(String(b?.roll || ""));
};

export default function TeacherAttendanceSheetPage() {
  const topScrollRef = useRef(null);
  const tableScrollRef = useRef(null);
  const innerWidthRef = useRef(null);

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseErr, setCourseErr] = useState("");

  const [courseId, setCourseId] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    async function loadCourses() {
      try {
        setLoadingCourses(true);
        const res = await fetchTeacherCourses();
        setCourses(res || []);
      } catch (e) {
        console.error(e);
        setCourseErr(e?.response?.data?.message || "Failed to load courses");
      } finally {
        setLoadingCourses(false);
      }
    }
    loadCourses();
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setErr("");
    setData(null);

    if (!courseId) {
      setErr("Please select a course.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetchAttendanceSheet(courseId);
      setData(res);
    } catch (error) {
      console.error(error);
      setErr(error?.response?.data?.message || "Failed to generate sheet");
    } finally {
      setLoading(false);
    }
  };

  const computed = useMemo(() => {
    if (!data) return null;

    const sessions = data.sessions || [];
    const students = [...(data.students || [])].sort(sortByRollAsc);
    const matrix = data.matrix || {};
    const totalClassesAll = sessions.length;

    const rows = students.map((s) => {
      let presentCount = 0;

      sessions.forEach((sess) => {
        const isPresent = !!matrix?.[s.roll]?.[sess.key];
        if (isPresent) presentCount += 1;
      });

      const totalClasses = totalClassesAll;
      const percentage = totalClasses > 0 ? (presentCount / totalClasses) * 100 : 0;

      return {
        roll: s.roll,
        name: s.name,
        presentCount,
        totalClasses,
        percentage: Number(percentage.toFixed(2)),
      };
    });

    return { sessions, students, matrix, rows };
  }, [data]);

  const totals = useMemo(() => {
    if (!computed) return null;

    const studentsCount = computed.students.length;
    const sessionsCount = computed.sessions.length;
    const totalPresentMarks = computed.rows.reduce((sum, row) => sum + row.presentCount, 0);
    const avgAttendance =
      studentsCount > 0
        ? (
          computed.rows.reduce((sum, row) => sum + row.percentage, 0) / studentsCount
        ).toFixed(2)
        : "0.00";

    return {
      studentsCount,
      sessionsCount,
      totalPresentMarks,
      avgAttendance,
    };
  }, [computed]);

  const exportExcel = () => {
    if (!computed || !data) return;

    const { sessions, students, matrix, rows } = computed;

    const header = [
      "Roll",
      "Name",
      ...sessions.map((s) => s.label),
      "Total Present",
      "Total Classes",
      "Percentage",
    ];

    const body = students.map((st) => {
      const meta = rows.find((r) => r.roll === st.roll);
      const sessionCells = sessions.map((sess) => (!!matrix?.[st.roll]?.[sess.key] ? "P" : "A"));

      return [
        st.roll,
        st.name,
        ...sessionCells,
        meta?.presentCount ?? 0,
        meta?.totalClasses ?? 0,
        meta?.percentage ?? 0,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([]);

    // ✅ Title section
    XLSX.utils.sheet_add_aoa(
      ws,
      [
        [`${data.course.code} - ${data.course.title}`],
        [`Section ${data.course.section} | ${data.course.semester} ${data.course.year}`],
        [],
        header,
        ...body,
      ],
      { origin: "A1" }
    );

    // ================= HEADER STYLE =================
    header.forEach((_, colIndex) => {
      const cell = XLSX.utils.encode_cell({ r: 3, c: colIndex });

      ws[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "334155" } }, // dark blue-gray
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        },
      };
    });

    // Title row style
    ws["A1"].s = {
      font: { bold: true, sz: 14, color: { rgb: "0F172A" } },
      alignment: { horizontal: "left", vertical: "center" },
    };

    ws["A2"].s = {
      font: { sz: 10, color: { rgb: "64748B" } },
      alignment: { horizontal: "left", vertical: "center" },
    };

    // ================= BODY STYLE =================
    for (let r = 0; r < body.length; r++) {
      for (let c = 0; c < header.length; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r: r + 4, c });
        const cell = ws[cellAddress];
        if (!cell) continue;

        // Zebra row effect
        const isEven = r % 2 === 0;

        let baseFill = isEven ? "F8FAFC" : "FFFFFF";

        cell.s = {
          fill: { fgColor: { rgb: baseFill } },
          alignment: {
            horizontal: c < 2 ? "left" : "center",
            vertical: "center",
          },
          font:
            c >= header.length - 3
              ? { bold: true, color: { rgb: "0F172A" } }
              : { color: { rgb: "0F172A" } },
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } },
          },
        };
      }
    }

    const startRow = 2;
    const startCol = 3;

    // ✅ Improved P/A styling
    for (let r = 0; r < body.length; r++) {
      for (let c = 0; c < sessions.length; c++) {

        const value = body[r][2 + c]; // Roll=0, Name=1 → attendance starts from index 2

        const cellAddress = XLSX.utils.encode_cell({
          r: r + 4,
          c: 2 + c,     // attendance column starts from 2
        });

        const cell = ws[cellAddress];
        if (!cell) continue;

        if (value === "P") {
          cell.s.fill = { fgColor: { rgb: "DCFCE7" } }; // green
          cell.s.font = { bold: true, color: { rgb: "166534" } };
        } else {
          cell.s.fill = { fgColor: { rgb: "FEE2E2" } }; // red
          cell.s.font = { bold: true, color: { rgb: "991B1B" } };
        }
      }
    }

    ws["!cols"] = header.map((col, i) => {
      if (i === 0) return { wch: 15 }; // Roll
      if (i === 1) return { wch: 24 }; // Name
      if (i >= 2 && i < header.length - 3) return { wch: 8 }; // attendance columns
      return { wch: 12 }; // totals
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Sheet");

    const filename = `${data.course.code}_Sec${data.course.section}_${data.course.semester}_${data.course.year}_Attendance.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const syncTopToTable = () => {
    if (tableScrollRef.current && topScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const syncTableToTop = () => {
    if (tableScrollRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    const updateWidth = () => {
      if (innerWidthRef.current && tableScrollRef.current) {
        const table = tableScrollRef.current.querySelector("table");
        if (table) {
          innerWidthRef.current.style.width = `${table.scrollWidth}px`;
        }
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);

    return () => window.removeEventListener("resize", updateWidth);
  }, [computed]);

  const commonInputClass =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/10";

  return (
    <div className="mx-auto">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {/* Header */}
        <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-blue-50 px-4 py-5 sm:px-6 lg:px-8 dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                Teacher Attendance Analytics
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Attendance Sheet
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                Generate a full period-wise attendance sheet, review performance,
                and export the result in a cleaner and more professional layout.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">Courses</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {courses.length}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">Students</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {totals?.studentsCount ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">Sessions</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {totals?.sessionsCount ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">Average %</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {totals?.avgAttendance ?? 0}%
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {/* Filter card */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 lg:p-6 dark:border-slate-800 dark:bg-slate-900/60">
            <form
              onSubmit={handleGenerate}
              className="grid grid-cols-1 gap-4 lg:grid-cols-12"
            >
              <div className="lg:col-span-9">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Course
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className={commonInputClass}
                >
                  <option value="">Select course</option>
                  {courses.map((c, i) => {
                    const id = c._id || c.id;
                    return (
                      <option key={id || i} value={id}>
                        {c.code} – {c.title} (Sec {c.section}) – {c.semester} {c.year}
                      </option>
                    );
                  })}
                </select>
                {courseErr && (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                    {courseErr}
                  </div>
                )}
              </div>

              <div className="flex items-end lg:col-span-3">
                <button
                  type="submit"
                  disabled={loading || loadingCourses || !courses.length}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Generating..." : "Generate Sheet"}
                </button>
              </div>
            </form>

            {err && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {err}
              </div>
            )}
          </div>

          {data && computed && (
            <div className="mt-8">
              {/* Course summary */}
              <div className="mb-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                    {data.course.code} – {data.course.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Section {data.course.section} • {data.course.semester} {data.course.year}
                  </p>
                </div>

                <button
                  onClick={exportExcel}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 sm:w-auto"
                >
                  Export Excel
                </button>
              </div>

              {/* Summary cards */}
              <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-blue-50 px-4 py-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                  <div className="text-xs text-blue-700 dark:text-blue-300">Students</div>
                  <div className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">
                    {totals?.studentsCount ?? 0}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-violet-50 px-4 py-4 dark:border-violet-500/20 dark:bg-violet-500/10">
                  <div className="text-xs text-violet-700 dark:text-violet-300">Sessions</div>
                  <div className="mt-1 text-2xl font-bold text-violet-800 dark:text-violet-200">
                    {totals?.sessionsCount ?? 0}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-emerald-50 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <div className="text-xs text-emerald-700 dark:text-emerald-300">
                    Total Present Marks
                  </div>
                  <div className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                    {totals?.totalPresentMarks ?? 0}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-amber-50 px-4 py-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <div className="text-xs text-amber-700 dark:text-amber-300">Average %</div>
                  <div className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">
                    {totals?.avgAttendance ?? 0}%
                  </div>
                </div>
              </div>

              {/* Table wrapper */}
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* Top horizontal scrollbar */}
                <div
                  ref={topScrollRef}
                  onScroll={syncTopToTable}
                  className="overflow-x-auto overflow-y-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div ref={innerWidthRef} className="h-4" />
                </div>

                {/* Actual table scroll area */}
                <div
                  ref={tableScrollRef}
                  onScroll={syncTableToTop}
                  className="overflow-x-auto overflow-y-visible"
                >
                  <table className="min-w-max border-separate border-spacing-0 text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950/60">
                      <tr>
                        <th className="sticky left-0 z-30 min-w-[120px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700 shadow-[6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          Roll
                        </th>
                        <th className="sticky left-[120px] z-30 min-w-[240px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700 shadow-[6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          Name
                        </th>

                        {computed.sessions.map((s) => (
                          <th
                            key={s.key}
                            className="min-w-[88px] whitespace-nowrap border-b border-slate-200 px-3 py-3 text-center font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200"
                          >
                            <div>{s.date}</div>
                            <div className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                              P{s.period}
                            </div>
                          </th>
                        ))}

                        <th className="sticky right-[210px] z-30 min-w-[120px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-center font-semibold text-slate-700 shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          Total Present
                        </th>
                        <th className="sticky right-[95px] z-30 min-w-[115px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-center font-semibold text-slate-700 shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          Total Classes
                        </th>
                        <th className="sticky right-0 z-30 min-w-[95px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-center font-semibold text-slate-700 shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                          %
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {computed.students.map((st, index) => {
                        const meta = computed.rows.find((r) => r.roll === st.roll);

                        return (
                          <tr
                            key={st.roll}
                            className={`transition ${index % 2 === 0
                              ? "bg-white dark:bg-slate-900"
                              : "bg-slate-50/60 dark:bg-slate-900/70"
                              } hover:bg-slate-100 dark:hover:bg-slate-800/80`}
                          >
                            <td
                              className={`sticky left-0 z-20 min-w-[120px] border-b border-slate-200 px-4 py-3 font-semibold text-slate-800 shadow-[6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:text-slate-100 ${index % 2 === 0
                                ? "bg-white dark:bg-slate-900"
                                : "bg-slate-50 dark:bg-slate-800"
                                }`}
                            >
                              {st.roll}
                            </td>

                            <td
                              className={`sticky left-[120px] z-20 min-w-[240px] whitespace-nowrap border-b border-slate-200 px-4 py-3 text-slate-800 shadow-[6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:text-slate-100 ${index % 2 === 0
                                ? "bg-white dark:bg-slate-900"
                                : "bg-slate-50 dark:bg-slate-800"
                                }`}
                            >
                              {st.name}
                            </td>

                            {computed.sessions.map((sess) => {
                              const present = !!computed.matrix?.[st.roll]?.[sess.key];

                              return (
                                <td
                                  key={sess.key}
                                  className="border-b border-slate-200 px-3 py-3 text-center dark:border-slate-800"
                                >
                                  <span
                                    className={`inline-flex min-w-[34px] justify-center rounded-full px-2.5 py-1 text-xs font-bold ${present
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                                      }`}
                                  >
                                    {present ? "P" : "A"}
                                  </span>
                                </td>
                              );
                            })}
                            <td
                              className={`sticky right-[210px] z-20 whitespace-nowrap border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-800 shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:text-slate-100 ${index % 2 === 0
                                ? "bg-white dark:bg-slate-900"
                                : "bg-slate-50 dark:bg-slate-800"
                                }`}
                            >
                              {meta?.presentCount ?? 0}
                            </td>
                            <td
                              className={`sticky right-[95px] z-20 whitespace-nowrap border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-800 shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:text-slate-100 ${index % 2 === 0
                                ? "bg-white dark:bg-slate-900"
                                : "bg-slate-50 dark:bg-slate-800"
                                }`}
                            >
                              {meta?.totalClasses ?? 0}
                            </td>
                            <td
                              className={`sticky right-0 z-20 whitespace-nowrap border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-800 shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.35)] dark:border-slate-800 dark:text-slate-100 ${index % 2 === 0
                                ? "bg-white dark:bg-slate-900"
                                : "bg-slate-50 dark:bg-slate-800"
                                }`}
                            >
                              {meta?.percentage ?? 0}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}