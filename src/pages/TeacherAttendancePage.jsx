// client/src/pages/TeacherAttendancePage.jsx

import { useEffect, useMemo, useState } from "react";
import { fetchTeacherCourses } from "../services/courseService";
import { getCourseStudents } from "../services/enrollmentService";
import {
  createAttendanceRecord,
  createAttendanceBulk,
  fetchAttendanceDay,
  updateAttendanceDay,
} from "../services/attendanceService";
import Swal from "sweetalert2";


export default function TeacherAttendancePage() {
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseError, setCourseError] = useState("");

  const [mode, setMode] = useState("create"); // "create" | "update"

  // ✅ NEW: entryMode for create
  // "single" = create one period
  // "bulk"   = create multiple periods at once
  const [entryMode, setEntryMode] = useState("single");

  const [form, setForm] = useState({
    courseId: "",
    date: "",
    period: 1,
    numClasses: 1,     // used only when entryMode === "bulk"
    startPeriod: 1,    // used only when entryMode === "bulk"
  });

  const [students, setStudents] = useState([]);

  const [showSheet, setShowSheet] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState("");

  // roll -> true/false (checked = present)
  const [attendance, setAttendance] = useState({});

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    async function loadCourses() {
      setLoadingCourses(true);
      setCourseError("");
      try {
        const data = await fetchTeacherCourses();
        setCourses(data || []);
      } catch (err) {
        console.error(err);
        setCourseError(err?.response?.data?.message || "Failed to load your courses.");
      } finally {
        setLoadingCourses(false);
      }
    }
    loadCourses();
  }, []);

  const selectedCourse = useMemo(
    () => courses.find((c) => (c._id || c.id) === form.courseId),
    [courses, form.courseId]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const toggleStudent = (roll) => {
    setAttendance((prev) => ({
      ...prev,
      [roll]: !prev[roll],
    }));
  };

  const toggleAllStudents = () => {
    const newValue = !areAllChecked; // toggle
    const updated = {};
    students.forEach((s) => {
      updated[s.roll] = newValue;
    });
    setAttendance(updated);
  };

  const handleLoadStudents = async (e) => {
    e.preventDefault();
    setSaveMessage("");

    if (!form.courseId || !form.date) {
      setStudentsError("Please select course and date.");
      return;
    }

    if (mode === "update" && !form.period) {
      setStudentsError("Please select a period to update.");
      return;
    }

    setStudentsError("");
    setLoadingStudents(true);

    try {
      const data = await getCourseStudents(form.courseId);
      const list = data || [];
      setStudents(list);
      setShowSheet(list.length > 0);


      // default: everyone present ✅
      const initialAttendance = {};
      list.forEach((s) => (initialAttendance[s.roll] = true));

      if (mode === "create") {
        setAttendance(initialAttendance);
        return;
      }

      // ✅ update mode: load existing attendance for that date + period
      try {
        const day = await fetchAttendanceDay(form.courseId, form.date, Number(form.period));

        const map = {};
        list.forEach((s) => (map[s.roll] = false));
        (day.records || []).forEach((r) => {
          map[String(r.roll)] = !!r.present;
        });

        setAttendance(map);
      } catch (err) {
        console.error(err);
        setStudentsError(err?.response?.data?.message || "No attendance found for this date/period.");
        setAttendance({});
      }
    } catch (err) {
      console.error(err);
      setStudentsError(err?.response?.data?.message || "Failed to load students for this course.");
      setStudents([]);
      setAttendance({});
      setShowSheet(false);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleSubmitAttendance = async (e) => {
    e.preventDefault();
    if (!students.length) return;

    setSaving(true);
    setSaveMessage("");

    try {
      const baseRecords = students.map((s) => ({
        roll: s.roll,
        present: !!attendance[s.roll],
      }));

      if (mode === "create") {
        if (entryMode === "single") {
          const payload = {
            courseId: form.courseId,
            date: form.date,
            period: Number(form.period),
            records: baseRecords,
          };
          await createAttendanceRecord(payload);
          await Swal.fire({
            icon: "success",
            title: "Attendance Submitted",
            text: `Attendance saved for Period ${Number(form.period)}.`,
            confirmButtonText: "OK",
          });

          // ✅ After OK: hide sheet + reset view
          setShowSheet(false);
          setStudents([]);
          setAttendance({});

        } else {
          const payload = {
            courseId: form.courseId,
            date: form.date,
            numClasses: Number(form.numClasses),
            startPeriod: Number(form.startPeriod),
            records: baseRecords,
          };
          const res = await createAttendanceBulk(payload);

          const created = (res.createdPeriods || []).join(", ");
          const skipped = (res.skippedPeriods || []).join(", ");

          let msg = "Bulk attendance done. ";
          if (created) msg += `Created: [${created}]. `;
          if (skipped) msg += `Skipped (already existed): [${skipped}].`;

          await Swal.fire({
            icon: "success",
            title: "Attendance Submitted",
            text: msg.trim(),
            confirmButtonText: "OK",
          });

          // ✅ After OK: hide sheet + reset view
          setShowSheet(false);
          setStudents([]);
          setAttendance({});

        }
      } else {
        // update (period-wise)
        const payload = {
          courseId: form.courseId,
          date: form.date,
          period: Number(form.period),
          records: baseRecords,
        };
        await updateAttendanceDay(payload);
        await Swal.fire({
          icon: "success",
          title: "Attendance Updated",
          text: `Attendance updated for Period ${Number(form.period)}.`,
          confirmButtonText: "OK",
        });

        // ✅ After OK: hide sheet + reset view
        setShowSheet(false);
        setStudents([]);
        setAttendance({});

      }
    } catch (err) {
      console.error(err);
      await Swal.fire({
        icon: "error",
        title: "Failed",
        text: err?.response?.data?.message || "Failed to save attendance.",
        confirmButtonText: "OK",
      });

    } finally {
      setSaving(false);
    }
  };

  const areAllChecked = useMemo(() => {
    if (!students.length) return false;
    return students.every((s) => attendance[s.roll]);
  }, [students, attendance]);


  return (
    <div className="mx-auto">
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Attendance</h1>
        <p className="text-sm text-slate-500 mb-6">
          Select a course and date. You can take attendance period-wise, or take multiple periods at once.
          (Checked = Present)
        </p>

        {/* Create / Update */}
        <div className="mb-5 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`h-9 rounded-lg px-4 text-sm font-semibold border ${mode === "create"
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
          >
            Create
          </button>

          <button
            type="button"
            onClick={() => setMode("update")}
            className={`h-9 rounded-lg px-4 text-sm font-semibold border ${mode === "update"
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
          >
            Update
          </button>
        </div>

        {/* Entry Mode (only for create) */}
        {mode === "create" && (
          <div className="mb-5 grid md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Entry Type
              </label>
              <select
                value={entryMode}
                onChange={(e) => setEntryMode(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="single">Single Period (separately)</option>
                <option value="bulk">Multiple Periods at Once (bulk)</option>
              </select>
            </div>

            {entryMode === "single" ? (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Period
                </label>
                <select
                  name="period"
                  value={form.period}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
                    <option key={p} value={p}>
                      Period {p}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Start Period
                  </label>
                  <select
                    name="startPeriod"
                    value={form.startPeriod}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
                      <option key={p} value={p}>
                        Period {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    No. of Classes
                  </label>
                  <select
                    name="numClasses"
                    value={form.numClasses}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {/* Update mode needs period */}
        {mode === "update" && (
          <div className="mb-5 grid md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Period (for update)
              </label>
              <select
                name="period"
                value={form.period}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>
                    Period {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Course + Date */}
        <form onSubmit={handleLoadStudents} className="grid md:grid-cols-4 gap-4 items-end mb-6">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Course (Code – Title – Section)
            </label>
            <select
              name="courseId"
              value={form.courseId}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select course</option>
              {courses.map((c, i) => {
                const courseId = c._id || c.id;
                return (
                  <option key={courseId || `${c.code}-${c.section}-${i}`} value={courseId}>
                    {c.code} – {c.title} (Sec {c.section})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap gap-3 items-center">
            <button
              type="submit"
              disabled={loadingCourses || !courses.length}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {loadingStudents ? "Loading Students..." : "Load Students"}
            </button>
            {courseError && <span className="text-xs text-red-600">{courseError}</span>}
            {studentsError && <span className="text-xs text-red-600">{studentsError}</span>}
          </div>
        </form>

        {/* Header */}
        {selectedCourse && showSheet && (
          <div className="mt-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold text-slate-700">
                {selectedCourse.code} – {selectedCourse.title} (Sec {selectedCourse.section}) –{" "}
                {form.date || "No date selected"}
              </h2>

              <span className="text-xs text-slate-500">
                {mode === "update"
                  ? `Updating Period ${Number(form.period)}`
                  : entryMode === "single"
                    ? `Creating Period ${Number(form.period)}`
                    : `Bulk: Period ${Number(form.startPeriod)} to ${Number(form.startPeriod) + Number(form.numClasses) - 1
                    }`}
              </span>
            </div>

            {loadingStudents && <p className="text-sm text-slate-500">Loading students…</p>}

            {!loadingStudents && !students.length && form.courseId && (
              <p className="text-sm text-slate-500">No students enrolled in this course yet.</p>
            )}

            {!loadingStudents && students.length > 0 && (
              <form onSubmit={handleSubmitAttendance}>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={toggleAllStudents}
                    className="text-xs px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    {areAllChecked ? "Uncheck All" : "Check All"}
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="min-w-[520px] w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Roll</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Name</th>
                        <th className="px-3 py-2 text-center font-medium text-slate-600">Present</th>
                      </tr>
                    </thead>

                    <tbody>
                      {students.map((s) => (
                        <tr key={s.roll} className="border-b last:border-0 border-slate-100">
                          <td className="px-3 py-2">{s.roll}</td>
                          <td className="px-3 py-2">{s.name}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!attendance[s.roll]}
                              onChange={() => toggleStudent(s.roll)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {saving
                      ? "Saving..."
                      : mode === "create"
                        ? entryMode === "single"
                          ? "Submit Attendance (Period)"
                          : "Submit Attendance (Bulk)"
                        : "Update Attendance (Period)"}
                  </button>

                  {saveMessage && <span className="text-xs text-slate-600">{saveMessage}</span>}
                </div>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
