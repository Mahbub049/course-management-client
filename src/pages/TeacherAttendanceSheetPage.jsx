import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTeacherCourses } from "../services/courseService";
import { fetchAttendanceSheet } from "../services/attendanceService";
import * as XLSX from "xlsx-js-style";
import { exportAttendancePdf } from "../utils/attendancePdfExport";
import { getAuthItem } from "../utils/authStorage";

const sortByRollAsc = (a, b) => {
  const ar = Number(a?.roll);
  const br = Number(b?.roll);
  if (!Number.isNaN(ar) && !Number.isNaN(br)) return ar - br;
  return String(a?.roll || "").localeCompare(String(b?.roll || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const parsePercentage = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return number;
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
  const [exportingPdf, setExportingPdf] = useState(false);

  const [percentageMode, setPercentageMode] = useState("all");
  const [percentageValue, setPercentageValue] = useState("60");

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
        if (matrix?.[s.roll]?.[sess.key]) presentCount += 1;
      });
      const percentage = totalClassesAll > 0 ? (presentCount / totalClassesAll) * 100 : 0;
      return {
        roll: s.roll,
        name: s.name,
        presentCount,
        totalClasses: totalClassesAll,
        percentage: Number(percentage.toFixed(2)),
      };
    });

    return { sessions, students, matrix, rows };
  }, [data]);

  const threshold = useMemo(() => parsePercentage(percentageValue), [percentageValue]);
  const filterInvalid = percentageMode !== "all" && threshold === null;
  const filterActive = percentageMode !== "all" && threshold !== null;

  const reportComputed = useMemo(() => {
    if (!computed) return null;
    if (!filterActive) return computed;

    const filteredRows = computed.rows.filter((row) => {
      if (percentageMode === "below") return row.percentage <= threshold;
      if (percentageMode === "above") return row.percentage >= threshold;
      if (percentageMode === "exact") return Math.abs(row.percentage - threshold) < 0.001;
      return true;
    });
    const allowedRolls = new Set(filteredRows.map((row) => String(row.roll)));
    const filteredStudents = computed.students.filter((student) =>
      allowedRolls.has(String(student.roll))
    );

    return {
      ...computed,
      students: filteredStudents,
      rows: filteredRows,
    };
  }, [computed, filterActive, percentageMode, threshold]);

  const filterLabel = useMemo(() => {
    if (!filterActive) return "";
    if (percentageMode === "below") return `Attendance <= ${threshold}%`;
    if (percentageMode === "above") return `Attendance >= ${threshold}%`;
    return `Attendance = ${threshold}%`;
  }, [filterActive, percentageMode, threshold]);

  const totals = useMemo(() => {
    if (!reportComputed) return null;
    const studentsCount = reportComputed.students.length;
    const sessionsCount = reportComputed.sessions.length;
    const totalPresentMarks = reportComputed.rows.reduce(
      (sum, row) => sum + row.presentCount,
      0
    );
    const avgAttendance = studentsCount
      ? (
          reportComputed.rows.reduce((sum, row) => sum + row.percentage, 0) /
          studentsCount
        ).toFixed(2)
      : "0.00";
    return { studentsCount, sessionsCount, totalPresentMarks, avgAttendance };
  }, [reportComputed]);

  const handleExportPdf = () => {
    if (!reportComputed || !data || filterInvalid) return;
    setErr("");
    try {
      setExportingPdf(true);
      exportAttendancePdf({
        data,
        computed: reportComputed,
        filterLabel,
        teacherFallback: {
          name: getAuthItem("marksPortalName"),
          shortCode: getAuthItem("marksPortalShortCode"),
          designation: getAuthItem("marksPortalDesignation"),
          department: getAuthItem("marksPortalDepartment"),
        },
      });
    } catch (error) {
      console.error("PDF export failed:", error);
      setErr(error?.message || "Failed to export attendance PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  const exportExcel = () => {
    if (!reportComputed || !data || filterInvalid) return;
    const { sessions, students, matrix, rows } = reportComputed;
    const rowMap = new Map(rows.map((row) => [String(row.roll), row]));
    const header = [
      "Roll",
      "Name",
      ...sessions.map((s) => s.label),
      "Total Present",
      "Total Classes",
      "Percentage",
    ];
    const body = students.map((st) => {
      const meta = rowMap.get(String(st.roll));
      return [
        st.roll,
        st.name,
        ...sessions.map((sess) => (matrix?.[st.roll]?.[sess.key] ? "P" : "A")),
        meta?.presentCount ?? 0,
        meta?.totalClasses ?? 0,
        meta?.percentage ?? 0,
      ];
    });

    const titleRows = [
      [`${data.course.code} - ${data.course.title}`],
      [`Section ${data.course.section} | ${data.course.semester} ${data.course.year}`],
      ...(filterLabel ? [[`Filtered Students: ${filterLabel}`]] : []),
      [],
    ];
    const headerRowIndex = titleRows.length;
    const ws = XLSX.utils.aoa_to_sheet([...titleRows, header, ...body]);

    if (ws.A1) {
      ws.A1.s = {
        font: { bold: true, sz: 14, color: { rgb: "0F172A" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }
    if (ws.A2) {
      ws.A2.s = {
        font: { sz: 10, color: { rgb: "64748B" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }
    if (filterLabel && ws.A3) {
      ws.A3.s = {
        font: { bold: true, color: { rgb: "9A3412" } },
        fill: { fgColor: { rgb: "FFF7ED" } },
      };
    }

    header.forEach((_, colIndex) => {
      const address = XLSX.utils.encode_cell({ r: headerRowIndex, c: colIndex });
      if (!ws[address]) return;
      ws[address].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "334155" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "CBD5E1" } },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left: { style: "thin", color: { rgb: "CBD5E1" } },
          right: { style: "thin", color: { rgb: "CBD5E1" } },
        },
      };
    });

    body.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        const address = XLSX.utils.encode_cell({ r: headerRowIndex + 1 + rowIndex, c: colIndex });
        const cell = ws[address];
        if (!cell) return;
        const attendanceStart = 2;
        const attendanceEnd = 2 + sessions.length;
        const isAttendance = colIndex >= attendanceStart && colIndex < attendanceEnd;
        const isPresent = isAttendance && value === "P";
        const isAbsent = isAttendance && value === "A";
        cell.s = {
          fill: {
            fgColor: {
              rgb: isPresent
                ? "DCFCE7"
                : isAbsent
                  ? "FEE2E2"
                  : rowIndex % 2 === 0
                    ? "F8FAFC"
                    : "FFFFFF",
            },
          },
          font: {
            bold: isAttendance || colIndex >= header.length - 3,
            color: { rgb: isPresent ? "166534" : isAbsent ? "991B1B" : "0F172A" },
          },
          alignment: {
            horizontal: colIndex < 2 ? "left" : "center",
            vertical: "center",
          },
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } },
          },
        };
      });
    });

    ws["!cols"] = header.map((_, i) => {
      if (i === 0) return { wch: 15 };
      if (i === 1) return { wch: 24 };
      if (i >= 2 && i < header.length - 3) return { wch: 8 };
      return { wch: 12 };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Sheet");
    const suffix = filterActive ? `_Filtered_${percentageMode}_${threshold}` : "";
    XLSX.writeFile(
      wb,
      `${data.course.code}_Sec${data.course.section}_${data.course.semester}_${data.course.year}_Attendance${suffix}.xlsx`
    );
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
        if (table) innerWidthRef.current.style.width = `${table.scrollWidth}px`;
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [reportComputed]);

  const commonInputClass =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/10";

  return (
    <div className="mx-auto">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-blue-50 px-4 py-5 sm:px-6 lg:px-8 dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                Teacher Attendance Analytics
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Attendance Sheet</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                Generate the full attendance sheet, isolate students by attendance percentage, and download the same filtered result as PDF or Excel.
              </p>
            </div>

            <div className="hidden grid-cols-2 gap-3 sm:grid sm:grid-cols-4">
              <SummaryMini label="Courses" value={courses.length} />
              <SummaryMini label="Students" value={totals?.studentsCount ?? 0} />
              <SummaryMini label="Sessions" value={totals?.sessionsCount ?? 0} />
              <SummaryMini label="Average %" value={`${totals?.avgAttendance ?? 0}%`} />
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 lg:p-6 dark:border-slate-800 dark:bg-slate-900/60">
            <form onSubmit={handleGenerate} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-9">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Course</label>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={commonInputClass}>
                  <option value="">Select course</option>
                  {courses.map((c, i) => {
                    const id = c._id || c.id;
                    return <option key={id || i} value={id}>{c.code} - {c.title} (Sec {c.section})</option>;
                  })}
                </select>
                {courseErr && <Alert>{courseErr}</Alert>}
              </div>
              <div className="flex items-end lg:col-span-3">
                <button type="submit" disabled={loading || loadingCourses || !courses.length} className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "Generating..." : "Generate Sheet"}
                </button>
              </div>
            </form>
            {err && <Alert>{err}</Alert>}
          </div>

          {data && computed && reportComputed && (
            <div className="mt-8">
              <div className="mb-4 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">{data.course.code} - {data.course.title} (Sec {data.course.section})</h2>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Showing {reportComputed.students.length} of {computed.students.length} students
                    {filterLabel ? ` · ${filterLabel}` : ""}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <button type="button" onClick={handleExportPdf} disabled={exportingPdf || filterInvalid} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                    {exportingPdf ? "Preparing PDF..." : "Export PDF"}
                  </button>
                  <button type="button" onClick={exportExcel} disabled={filterInvalid} className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">Export Excel</button>
                </div>
              </div>

              <div className="mb-5 rounded-3xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Attendance Percentage Filter</h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Use “Below or equal” for shortage/at-risk lists. The table, PDF and Excel exports all follow the active filter.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[210px_150px_auto]">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Show Students</label>
                      <select value={percentageMode} onChange={(e) => setPercentageMode(e.target.value)} className={commonInputClass}>
                        <option value="all">All students</option>
                        <option value="below">Below or equal to</option>
                        <option value="above">Above or equal to</option>
                        <option value="exact">Exactly</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Percentage</label>
                      <div className="relative">
                        <input type="number" min="0" max="100" step="0.01" value={percentageValue} onChange={(e) => setPercentageValue(e.target.value)} disabled={percentageMode === "all"} className={`${commonInputClass} pr-9 disabled:cursor-not-allowed disabled:opacity-50`} />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setPercentageMode("all"); setPercentageValue("60"); }} className="self-end rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900">Clear Filter</button>
                  </div>
                </div>
                {percentageMode !== "all" && threshold === null && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">Enter a percentage between 0 and 100.</div>
                )}
              </div>

              <div className="mb-5 hidden grid-cols-2 gap-3 sm:grid lg:grid-cols-4">
                <SummaryCard label="Students Shown" value={totals?.studentsCount ?? 0} tone="blue" />
                <SummaryCard label="Sessions" value={totals?.sessionsCount ?? 0} tone="violet" />
                <SummaryCard label="Total Present Marks" value={totals?.totalPresentMarks ?? 0} tone="emerald" />
                <SummaryCard label="Average %" value={`${totals?.avgAttendance ?? 0}%`} tone="amber" />
              </div>

              {reportComputed.students.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="text-base font-bold text-slate-900 dark:text-white">No students match this percentage filter</div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Change the condition or percentage to see another attendance group.</p>
                </div>
              ) : (
                <>
                  <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 md:hidden">Swipe horizontally to view all attendance columns.</p>
                  <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div ref={topScrollRef} onScroll={syncTopToTable} className="touch-pan-x overflow-x-auto overflow-y-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60">
                      <div ref={innerWidthRef} className="h-4" />
                    </div>
                    <div ref={tableScrollRef} onScroll={syncTableToTop} className="touch-pan-x overflow-x-auto overflow-y-visible [-webkit-overflow-scrolling:touch]">
                      <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: reportComputed.sessions.length > 0 ? `${120 + 240 + 120 + 115 + 95 + reportComputed.sessions.length * 88}px` : "100%" }}>
                        <thead className="bg-slate-50 dark:bg-slate-950/60">
                          <tr>
                            <th className="md:sticky md:left-0 md:z-30 min-w-[120px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">Roll</th>
                            <th className="md:sticky md:left-[120px] md:z-30 min-w-[240px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">Name</th>
                            {reportComputed.sessions.map((s) => <th key={s.key} className="min-w-[88px] whitespace-nowrap border-b border-slate-200 px-3 py-3 text-center font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200"><div>{s.date}</div><div className="mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">P{s.period}</div></th>)}
                            <th className="md:sticky md:right-[210px] md:z-30 min-w-[120px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-center font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">Total Present</th>
                            <th className="md:sticky md:right-[95px] md:z-30 min-w-[115px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-center font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">Total Classes</th>
                            <th className="md:sticky md:right-0 md:z-30 min-w-[95px] whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-center font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportComputed.students.map((st, index) => {
                            const meta = reportComputed.rows.find((row) => String(row.roll) === String(st.roll));
                            const rowBg = index % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-800";
                            return (
                              <tr key={st.roll} className="transition hover:bg-slate-100 dark:hover:bg-slate-800/80">
                                <td className={`md:sticky md:left-0 md:z-20 min-w-[120px] border-b border-slate-200 px-4 py-3 font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100 ${rowBg}`}>{st.roll}</td>
                                <td className={`md:sticky md:left-[120px] md:z-20 min-w-[240px] whitespace-nowrap border-b border-slate-200 px-4 py-3 text-slate-800 dark:border-slate-800 dark:text-slate-100 ${rowBg}`}>{st.name}</td>
                                {reportComputed.sessions.map((sess) => {
                                  const present = Boolean(reportComputed.matrix?.[st.roll]?.[sess.key]);
                                  return <td key={sess.key} className="border-b border-slate-200 px-3 py-3 text-center dark:border-slate-800"><span className={`inline-flex min-w-[34px] justify-center rounded-full px-2.5 py-1 text-xs font-bold ${present ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"}`}>{present ? "P" : "A"}</span></td>;
                                })}
                                <td className={`md:sticky md:right-[210px] md:z-20 border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100 ${rowBg}`}>{meta?.presentCount ?? 0}</td>
                                <td className={`md:sticky md:right-[95px] md:z-20 border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100 ${rowBg}`}>{meta?.totalClasses ?? 0}</td>
                                <td className={`md:sticky md:right-0 md:z-20 border-b border-slate-200 px-4 py-3 text-center font-black dark:border-slate-800 ${rowBg} ${filterActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-800 dark:text-slate-100"}`}>{meta?.percentage ?? 0}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Alert({ children }) {
  return <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{children}</div>;
}

function SummaryMini({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80"><div className="text-xs text-slate-500 dark:text-slate-400">{label}</div><div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{value}</div></div>;
}

function SummaryCard({ label, value, tone }) {
  const tones = {
    blue: "bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200",
    violet: "bg-violet-50 text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200",
    emerald: "bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
    amber: "bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
  };
  return <div className={`rounded-2xl border border-slate-200 px-4 py-4 ${tones[tone] || tones.blue}`}><div className="text-xs opacity-80">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}
