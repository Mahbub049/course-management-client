// client/src/pages/TeacherAttendancePage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTeacherCourses } from "../services/courseService";
import { getCourseStudents } from "../services/enrollmentService";
import {
  createAttendanceRecord,
  createAttendanceBulk,
  fetchAttendanceDay,
  updateAttendanceDay,
  deleteAttendanceDay,
} from "../services/attendanceService";
import Swal from "sweetalert2";

export default function TeacherAttendancePage() {
  const dateInputRef = useRef(null);

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseError, setCourseError] = useState("");

  const [mode, setMode] = useState("create"); // "create" | "update" | "delete"
  const [entryMode, setEntryMode] = useState("single"); // "single" | "bulk"

  const [form, setForm] = useState({
    courseId: "",
    date: "",
    period: 1,
    numClasses: 1,
    startPeriod: 1,
  });

  const [students, setStudents] = useState([]);
  const [showSheet, setShowSheet] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState("");

  // roll -> present
  const [attendance, setAttendance] = useState({});
  const [saving, setSaving] = useState(false);

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

  const areAllChecked = useMemo(() => {
    if (!students.length) return false;
    return students.every((s) => attendance[s.roll]);
  }, [students, attendance]);

  const presentCount = useMemo(() => {
    return students.filter((s) => !!attendance[s.roll]).length;
  }, [students, attendance]);

  const absentCount = useMemo(() => {
    return students.length - presentCount;
  }, [students, presentCount]);

  const toggleAllStudents = () => {
    const newValue = !areAllChecked;
    const updated = {};
    students.forEach((s) => {
      updated[s.roll] = newValue;
    });
    setAttendance(updated);
  };

  const resetSheet = () => {
    setShowSheet(false);
    setStudents([]);
    setAttendance({});
  };

  const handleLoadStudents = async (e) => {
    e.preventDefault();

    if (!form.courseId || !form.date) {
      setStudentsError("Please select both course and date.");
      return;
    }

    if ((mode === "update" || mode === "delete") && !form.period) {
      setStudentsError(
        mode === "delete"
          ? "Please select a period to delete."
          : "Please select a period to update."
      );
      return;
    }

    setStudentsError("");
    setLoadingStudents(true);

    try {
      const data = await getCourseStudents(form.courseId);
      const list = data || [];
      setStudents(list);
      setShowSheet(list.length > 0);

      const initialAttendance = {};
      list.forEach((s) => {
        initialAttendance[s.roll] = true;
      });

      if (mode === "create") {
        setAttendance(initialAttendance);
        return;
      }

      try {
        const day = await fetchAttendanceDay(
          form.courseId,
          form.date,
          Number(form.period)
        );

        const map = {};
        list.forEach((s) => {
          map[s.roll] = false;
        });

        (day.records || []).forEach((r) => {
          map[String(r.roll)] = !!r.present;
        });

        setAttendance(map);
      } catch (err) {
        console.error(err);
        setStudentsError(
          err?.response?.data?.message ||
          "No attendance found for this date and period."
        );
        setAttendance({});
      }
    } catch (err) {
      console.error(err);
      setStudentsError(
        err?.response?.data?.message ||
        "Failed to load students for this course."
      );
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

          resetSheet();
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

          let msg = "Bulk attendance completed. ";
          if (created) msg += `Created: [${created}]. `;
          if (skipped) msg += `Skipped: [${skipped}].`;

          await Swal.fire({
            icon: "success",
            title: "Attendance Submitted",
            text: msg.trim(),
            confirmButtonText: "OK",
          });

          resetSheet();
        }
      } else {
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

        resetSheet();
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

  const handleDeleteAttendance = async (e) => {
    e.preventDefault();

    if (!form.courseId || !form.date || !form.period) {
      await Swal.fire({
        icon: "warning",
        title: "Missing Information",
        text: "Please select course, date, and period.",
        confirmButtonText: "OK",
      });
      return;
    }

    const confirm = await Swal.fire({
      icon: "warning",
      title: "Delete Attendance?",
      text: `This will permanently delete attendance for Period ${Number(
        form.period
      )} on ${form.date}.`,
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (!confirm.isConfirmed) return;

    try {
      await deleteAttendanceDay(form.courseId, form.date, Number(form.period));

      await Swal.fire({
        icon: "success",
        title: "Attendance Deleted",
        text: `Attendance deleted for Period ${Number(form.period)}.`,
        confirmButtonText: "OK",
      });

      resetSheet();
    } catch (err) {
      console.error(err);
      await Swal.fire({
        icon: "error",
        title: "Delete Failed",
        text:
          err?.response?.data?.message || "Failed to delete attendance record.",
        confirmButtonText: "OK",
      });
    }
  };

  const sectionTitle =
    mode === "update"
      ? `Updating Period ${Number(form.period)}`
      : mode === "delete"
        ? `Deleting Period ${Number(form.period)}`
        : entryMode === "single"
          ? `Creating Period ${Number(form.period)}`
          : `Bulk: Period ${Number(form.startPeriod)} to ${Number(form.startPeriod) + Number(form.numClasses) - 1
          }`;

  const commonInputClass =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/10";

  return (
    <div className="mx-auto ">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {/* Header */}
        <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-blue-50 px-4 py-5 sm:px-6 lg:px-8 dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                Teacher Attendance Panel
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Attendance Management
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                Select course, date, and period. Mark attendance quickly with a
                cleaner layout, better visibility, and dark mode support.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Courses
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {courses.length}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Mode
                </div>
                <div className="mt-1 text-sm font-semibold capitalize text-slate-900 dark:text-white">
                  {mode === "create" ? "Create" : mode === "update" ? "Update" : "Delete"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Entry
                </div>
                <div className="mt-1 text-sm font-semibold capitalize text-slate-900 dark:text-white">
                  {entryMode}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Students
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {students.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {/* Mode Toggle */}
          <div className="mb-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setMode("create")}
              className={`inline-flex items-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${mode === "create"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
            >
              Create Attendance
            </button>

            <button
              type="button"
              onClick={() => setMode("update")}
              className={`inline-flex items-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${mode === "update"
                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
            >
              Update Attendance
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("delete");
                setShowSheet(false);
                setStudents([]);
                setAttendance({});
                setStudentsError("");
              }}
              className={`inline-flex items-center rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${mode === "delete"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
            >
              Delete Attendance
            </button>
          </div>

          {/* Form card */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 lg:p-6 dark:border-slate-800 dark:bg-slate-900/60">
            {mode === "create" && (
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Entry Type
                  </label>
                  <select
                    value={entryMode}
                    onChange={(e) => setEntryMode(e.target.value)}
                    className={commonInputClass}
                  >
                    <option value="single">Single Period (separately)</option>
                    <option value="bulk">Multiple Periods at Once (bulk)</option>
                  </select>
                </div>

                {entryMode === "single" ? (
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Period
                    </label>
                    <select
                      name="period"
                      value={form.period}
                      onChange={handleChange}
                      className={commonInputClass}
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
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Start Period
                      </label>
                      <select
                        name="startPeriod"
                        value={form.startPeriod}
                        onChange={handleChange}
                        className={commonInputClass}
                      >
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
                          <option key={p} value={p}>
                            Period {p}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        No. of Classes
                      </label>
                      <select
                        name="numClasses"
                        value={form.numClasses}
                        onChange={handleChange}
                        className={commonInputClass}
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

            {(mode === "update" || mode === "delete") && (
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {mode === "delete" ? "Period for Delete" : "Period for Update"}
                  </label>
                  <select
                    name="period"
                    value={form.period}
                    onChange={handleChange}
                    className={commonInputClass}
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

            <form
              onSubmit={handleLoadStudents}
              className="grid grid-cols-1 gap-4 lg:grid-cols-12"
            >
              <div className="lg:col-span-6">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Course
                </label>
                <select
                  name="courseId"
                  value={form.courseId}
                  onChange={handleChange}
                  className={commonInputClass}
                >
                  <option value="">Select course</option>
                  {courses.map((c, i) => {
                    const courseId = c._id || c.id;
                    return (
                      <option
                        key={courseId || `${c.code}-${c.section}-${i}`}
                        value={courseId}
                      >
                        {c.code} – {c.title} (Sec {c.section})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="lg:col-span-3">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Date
                </label>
                <input
                  ref={dateInputRef}
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  onClick={() => dateInputRef.current?.showPicker?.()}
                  onFocus={() => dateInputRef.current?.showPicker?.()}
                  className={`${commonInputClass} cursor-pointer`}
                />
              </div>

              <div className="flex items-end lg:col-span-3">
                <button
                  type="submit"
                  disabled={loadingCourses || !courses.length || loadingStudents}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingStudents
                    ? mode === "delete"
                      ? "Loading Attendance..."
                      : "Loading Students..."
                    : mode === "delete"
                      ? "Load Attendance"
                      : "Load Students"}
                </button>
              </div>
            </form>

            {(courseError || studentsError) && (
              <div className="mt-4 space-y-2">
                {courseError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                    {courseError}
                  </div>
                )}
                {studentsError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                    {studentsError}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sheet */}
          {selectedCourse && showSheet && (
            <div className="mt-8">
              <div className="mb-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                    {selectedCourse.code} – {selectedCourse.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Section {selectedCourse.section} • {form.date}
                  </p>
                </div>

                <div className="inline-flex w-fit items-center rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                  {sectionTitle}
                </div>
              </div>

              {loadingStudents && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  Loading students...
                </div>
              )}

              {!loadingStudents && !students.length && form.courseId && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  No students enrolled in this course yet.
                </div>
              )}

              {!loadingStudents && students.length > 0 && (
                <form onSubmit={handleSubmitAttendance}>
                  {/* Summary bar */}
                  {mode !== "delete" && (
                    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-emerald-50 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <div className="text-xs text-emerald-700 dark:text-emerald-300">
                          Present
                        </div>
                        <div className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                          {presentCount}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-rose-50 px-4 py-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                        <div className="text-xs text-rose-700 dark:text-rose-300">
                          Absent
                        </div>
                        <div className="mt-1 text-2xl font-bold text-rose-800 dark:text-rose-200">
                          {absentCount}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-blue-50 px-4 py-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                        <div className="text-xs text-blue-700 dark:text-blue-300">
                          Total Students
                        </div>
                        <div className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">
                          {students.length}
                        </div>
                      </div>

                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={toggleAllStudents}
                          className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {areAllChecked ? "Uncheck All" : "Check All"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mobile cards */}
                  <div className="space-y-3 md:hidden">
                    {students.map((s, index) => (
                      <button
                        key={s.roll}
                        type="button"
                        onClick={() => {
                          if (mode !== "delete") toggleStudent(s.roll);
                        }}
                        className={`w-full rounded-2xl border p-4 text-left transition ${mode !== "delete" ? "cursor-pointer" : "cursor-default"
                          } ${attendance[s.roll]
                            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Student {index + 1}
                            </div>
                            <div className="mt-1 break-words text-base font-semibold text-slate-900 dark:text-white">
                              {s.name}
                            </div>
                            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                              Roll: {s.roll}
                            </div>
                          </div>

                          <div className="shrink-0">
                            <div
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${attendance[s.roll]
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                }`}
                            >
                              {attendance[s.roll] ? "Present" : "Absent"}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:block">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-950/60">
                          <tr className="border-b border-slate-200 dark:border-slate-800">
                            <th className="px-5 py-4 text-left font-semibold text-slate-600 dark:text-slate-300">
                              #
                            </th>
                            <th className="px-5 py-4 text-center font-semibold text-slate-600 dark:text-slate-300">
                              Mark
                            </th>
                            <th className="px-5 py-4 text-left font-semibold text-slate-600 dark:text-slate-300">
                              Roll
                            </th>
                            <th className="px-5 py-4 text-left font-semibold text-slate-600 dark:text-slate-300">
                              Student Name
                            </th>
                            <th className="px-5 py-4 text-center font-semibold text-slate-600 dark:text-slate-300">
                              Status
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {students.map((s, index) => {
                            const isPresent = !!attendance[s.roll];

                            return (
                              <tr
                                key={s.roll}
                                onClick={() => {
                                  if (mode !== "delete") toggleStudent(s.roll);
                                }}
                                className={`border-b transition last:border-0 dark:border-slate-800 ${mode !== "delete" ? "cursor-pointer" : "cursor-default"
                                  } ${isPresent
                                    ? "bg-emerald-50/60 hover:bg-emerald-50 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10"
                                    : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                  }`}
                              >
                                <td className="px-5 py-4 font-medium text-slate-500 dark:text-slate-400">
                                  {index + 1}
                                </td>

                                <td className="px-5 py-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isPresent}
                                    disabled={mode === "delete"}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      if (mode !== "delete") toggleStudent(s.roll);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-5 w-5 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800"
                                  />
                                </td>

                                <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-100">
                                  {s.roll}
                                </td>

                                <td className="px-5 py-4 text-slate-800 dark:text-slate-100">
                                  {s.name}
                                </td>

                                <td className="px-5 py-4 text-center">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${isPresent
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                                      }`}
                                  >
                                    {isPresent ? "Present" : "Absent"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Bottom action bar */}
                  <div className="sticky bottom-3 mt-6">
                    <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950/95">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {mode === "delete" ? "Ready to delete attendance?" : "Ready to save attendance?"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {mode === "delete"
                            ? "Review the loaded attendance carefully before deleting."
                            : "Review the student status and submit when finished."}
                        </div>
                      </div>

                      {mode === "delete" ? (
                        <button
                          type="button"
                          onClick={handleDeleteAttendance}
                          className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700"
                        >
                          Delete Attendance
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={saving}
                          className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {saving
                            ? "Saving..."
                            : mode === "create"
                              ? entryMode === "single"
                                ? "Submit Attendance"
                                : "Submit Bulk Attendance"
                              : "Update Attendance"}
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}