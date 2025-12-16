// client/src/pages/TeacherAttendancePage.jsx

import { useEffect, useState } from "react";
import { fetchTeacherCourses } from "../services/courseService";
import { getCourseStudents } from "../services/enrollmentService";
import { createAttendanceRecord } from "../services/attendanceService";

export default function TeacherAttendancePage() {
    const [courses, setCourses] = useState([]);
    const [loadingCourses, setLoadingCourses] = useState(true);
    const [courseError, setCourseError] = useState("");

    const [form, setForm] = useState({
        courseId: "",
        date: "",
        numClasses: 1,
    });

    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [studentsError, setStudentsError] = useState("");

    // roll -> true/false (checked = present)
    const [attendance, setAttendance] = useState({});

    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");

    // Load teacher courses on first load
    useEffect(() => {
        async function loadCourses() {
            setLoadingCourses(true);
            setCourseError("");
            try {
                const data = await fetchTeacherCourses();
                setCourses(data || []);
            } catch (err) {
                console.error(err);
                setCourseError(
                    err?.response?.data?.message || "Failed to load your courses."
                );
            } finally {
                setLoadingCourses(false);
            }
        }

        loadCourses();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleLoadStudents = async (e) => {
        e.preventDefault();
        setSaveMessage("");

        if (!form.courseId || !form.date || !form.numClasses) {
            setStudentsError("Please select course, date and number of classes.");
            return;
        }

        setStudentsError("");
        setLoadingStudents(true);
        try {
            const data = await getCourseStudents(form.courseId);
            const list = data || [];
            setStudents(list);

            // default: everyone present ✅
            const initialAttendance = {};
            list.forEach((s) => {
                initialAttendance[s.roll] = true;
            });
            setAttendance(initialAttendance);
        } catch (err) {
            console.error(err);
            setStudentsError(
                err?.response?.data?.message || "Failed to load students for this course."
            );
            setStudents([]);
            setAttendance({});
        } finally {
            setLoadingStudents(false);
        }
    };

    const toggleStudent = (roll) => {
        setAttendance((prev) => ({
            ...prev,
            [roll]: !prev[roll],
        }));
    };

    const handleSubmitAttendance = async (e) => {
        e.preventDefault();
        if (!students.length) return;

        setSaving(true);
        setSaveMessage("");
        try {
            const payload = {
                courseId: form.courseId,
                date: form.date,          // "YYYY-MM-DD"
                numClasses: Number(form.numClasses),
                records: students.map((s) => ({
                    roll: s.roll,
                    present: !!attendance[s.roll],
                })),
            };

            await createAttendanceRecord(payload);
            setSaveMessage("Attendance saved successfully.");
        } catch (err) {
            console.error(err);
            setSaveMessage(
                err?.response?.data?.message || "Failed to save attendance."
            );
        } finally {
            setSaving(false);
        }
    };

    const selectedCourse = courses.find((c) => (c._id || c.id) === form.courseId);




    return (
        <div className="mx-auto">
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h1 className="text-xl font-semibold text-slate-800 mb-1">
                    Attendance
                </h1>
                <p className="text-sm text-slate-500 mb-6">
                    Select a course, date and number of classes, then mark present students.
                    (Checked = Present)
                </p>

                {/* Course + Date + Classes form */}
                <form
                    onSubmit={handleLoadStudents}
                    className="grid md:grid-cols-4 gap-4 items-end mb-6"
                >
                    {/* Course */}
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
                                const courseId = c._id || c.id; // ✅ fallback
                                return (
                                    <option key={courseId || `${c.code}-${c.section}-${i}`} value={courseId}>
                                        {c.code} – {c.title} (Sec {c.section})
                                    </option>
                                );
                            })}

                        </select>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                            Date
                        </label>
                        <input
                            type="date"
                            name="date"
                            value={form.date}
                            onChange={handleChange}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Number of classes */}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                            No. of Classes
                        </label>
                        <select
                            name="numClasses"
                            value={form.numClasses}
                            onChange={handleChange}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                        </select>
                    </div>

                    <div className="md:col-span-4 flex flex-wrap gap-3 items-center">
                        <button
                            type="submit"
                            disabled={loadingCourses || !courses.length}
                            className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                        >
                            {loadingStudents ? "Loading Students..." : "Load Students"}
                        </button>
                        {courseError && (
                            <span className="text-xs text-red-600">{courseError}</span>
                        )}
                        {studentsError && (
                            <span className="text-xs text-red-600">{studentsError}</span>
                        )}
                    </div>
                </form>

                {/* Sheet */}
                {selectedCourse && (
                    <div className="mt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-sm font-semibold text-slate-700">
                                {selectedCourse.code} – {selectedCourse.title} (Sec{" "}
                                {selectedCourse.section}) –{" "}
                                {form.date || "No date selected"}
                            </h2>
                            <span className="text-xs text-slate-500">
                                Classes: {form.numClasses}
                            </span>
                        </div>

                        {loadingStudents && (
                            <p className="text-sm text-slate-500">Loading students…</p>
                        )}

                        {!loadingStudents && !students.length && form.courseId && (
                            <p className="text-sm text-slate-500">
                                No students enrolled in this course yet.
                            </p>
                        )}

                        {!loadingStudents && students.length > 0 && (
                            <form onSubmit={handleSubmitAttendance}>
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium text-slate-600">
                                                    Roll
                                                </th>
                                                <th className="px-3 py-2 text-left font-medium text-slate-600">
                                                    Name
                                                </th>
                                                <th className="px-3 py-2 text-center font-medium text-slate-600">
                                                    Present
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {students.map((s) => (
                                                <tr
                                                    key={s.roll}
                                                    className="border-b last:border-0 border-slate-100"
                                                >
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
                                        {saving ? "Saving..." : "Submit Attendance"}
                                    </button>
                                    {saveMessage && (
                                        <span className="text-xs text-slate-600">
                                            {saveMessage}
                                        </span>
                                    )}
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
