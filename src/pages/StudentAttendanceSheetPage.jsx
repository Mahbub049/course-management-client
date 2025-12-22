import { useEffect, useState } from "react";
import { fetchStudentCourses, fetchStudentAttendanceSheet } from "../services/studentCourseService";

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
        setCourses(list || []);
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

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Attendance</h1>
      <p className="text-sm text-slate-500 mb-6">
        Select a course to view your attendance (only your own).
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[320px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">Course</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
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
          className="h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "Loading..." : "View Attendance"}
        </button>
      </div>

      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="text-sm font-semibold text-slate-700">
              {data.course.code} – {data.course.title} (Sec {data.course.section}) –{" "}
              {data.course.semester} {data.course.year}
            </div>

            <div className="text-sm text-slate-700">
              <span className="font-semibold">Present:</span> {data.totalPresent} / {data.totalClasses}{" "}
              <span className="ml-2 font-semibold">({data.percentage}%)</span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Date</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-600">Classes</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.date} className="border-b last:border-0 border-slate-100">
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2 text-center">{r.numClasses}</td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
