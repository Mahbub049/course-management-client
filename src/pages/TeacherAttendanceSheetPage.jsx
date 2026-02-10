import { useEffect, useMemo, useState } from "react";
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
    const students = [...(data.students || [])].sort(sortByRollAsc); // ✅ sorted
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

    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    // ✅ Apply coloring to attendance cells in Excel (P=green, A=red)
    const startRow = 2; // 1=header, data starts from row 2
    const startCol = 3; // Roll=1, Name=2, attendance starts from 3

    for (let r = 0; r < body.length; r++) {
      for (let c = 0; c < sessions.length; c++) {
        const value = body[r][startCol - 1 + c]; // because array index
        const cellAddress = XLSX.utils.encode_cell({
          r: (startRow - 1) + r,
          c: (startCol - 1) + c,
        });

        const cell = ws[cellAddress];
        if (!cell) continue;

        if (value === "A") {
          cell.s = {
            fill: { fgColor: { rgb: "FEE2E2" } }, // soft red
            font: { color: { rgb: "991B1B" }, bold: true },
            alignment: { horizontal: "center", vertical: "center" },
          };
        } else {
          cell.s = {
            fill: { fgColor: { rgb: "DCFCE7" } }, // soft green
            font: { color: { rgb: "166534" }, bold: true },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      }
    }


    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Sheet");

    const filename = `${data.course.code}_Sec${data.course.section}_${data.course.semester}_${data.course.year}_Attendance.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="mx-auto">
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">
          Attendance Sheet (Period-wise)
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Select a course to generate the attendance sheet (date + period).
        </p>

        <form onSubmit={handleGenerate} className="grid md:grid-cols-4 gap-4 items-end mb-6">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Course (Code – Title – Section)
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
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

            {courseErr && <p className="text-xs text-red-600 mt-1">{courseErr}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || loadingCourses || !courses.length}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate Sheet"}
          </button>
        </form>

        {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

        {data && computed && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-slate-700">
                {data.course.code} – {data.course.title} (Sec {data.course.section}) –{" "}
                {data.course.semester} {data.course.year}
              </h2>

              <button
                onClick={exportExcel}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                Export Excel
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Roll</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Name</th>

                    {computed.sessions.map((s) => (
                      <th
                        key={s.key}
                        className="px-3 py-2 text-center font-medium text-slate-600 whitespace-nowrap"
                      >
                        {s.date}
                        <div className="text-[10px] text-slate-500">P{s.period}</div>
                      </th>
                    ))}

                    <th className="px-3 py-2 text-center font-medium text-slate-600">Total Present</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">Total Classes</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">%</th>
                  </tr>
                </thead>

                <tbody>
                  {computed.students.map((st) => {
                    const meta = computed.rows.find((r) => r.roll === st.roll);
                    return (
                      <tr key={st.roll} className="border-b last:border-0 border-slate-100">
                        <td className="px-3 py-2">{st.roll}</td>
                        <td className="px-3 py-2">{st.name}</td>

                        {computed.sessions.map((sess) => {
                          const present = !!computed.matrix?.[st.roll]?.[sess.key];

                          const cellClass = present
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-rose-50 text-rose-700 border border-rose-100"; // ✅ soothing red

                          return (
                            <td
                              key={sess.key}
                              className={`px-3 py-2 text-center font-semibold ${cellClass}`}
                            >
                              {present ? "P" : "A"}
                            </td>
                          );
                        })}


                        <td className="px-3 py-2 text-center">{meta?.presentCount ?? 0}</td>
                        <td className="px-3 py-2 text-center">{meta?.totalClasses ?? 0}</td>
                        <td className="px-3 py-2 text-center">{meta?.percentage ?? 0}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
