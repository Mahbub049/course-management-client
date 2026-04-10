// client/src/pages/TeacherCreateCoursePage.jsx

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCourseRequest } from "../services/courseService";
import Swal from "sweetalert2";

function TeacherCreateCoursePage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    code: "",
    title: "",
    section: "",
    semester: "Spring",
    year: new Date().getFullYear(),
    courseType: "theory",
  });

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const start = current - 10;
    const end = current + 10;
    const arr = [];
    for (let y = end; y >= start; y--) arr.push(y);
    return arr;
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "year" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setCreating(true);

      const payload = {
        code: form.code.trim(),
        title: form.title.trim(),
        section: form.section.trim(),
        semester: form.semester,
        year: form.year,
        courseType: form.courseType,
      };

      await createCourseRequest(payload);

      const result = await Swal.fire({
        icon: "success",
        title: "Course Created!",
        text: "The course has been successfully created.",
        showConfirmButton: true,
        showCancelButton: true,
        showCloseButton: true,
        confirmButtonText: "Go to Dashboard",
        cancelButtonText: "Add Another Course",
        confirmButtonColor: "#4f46e5",
        cancelButtonColor: "#64748b",
      });

      if (result.isConfirmed) {
        navigate("/teacher/dashboard");
      }

      if (result.dismiss === Swal.DismissReason.cancel) {
        setForm({
          code: "",
          title: "",
          section: "",
          semester: form.semester,
          year: form.year,
          courseType: form.courseType,
        });
      }
    } catch (err) {
      console.error(err);

      Swal.fire({
        icon: "error",
        title: "Creation Failed",
        text:
          err?.response?.data?.message ||
          "Failed to create course. Please try again.",
      });

      setError(err?.response?.data?.message || "Failed to create course.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950/30 sm:p-6 lg:p-7">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-200/40 blur-3xl dark:bg-violet-600/20" />
        <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-fuchsia-200/40 blur-3xl dark:bg-fuchsia-600/20" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
              <PlusIcon />
              Course Setup
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Create New Course
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Add the basic academic information first. After creation, you can
              manage students, assessments, marks, attendance, and complaints.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/teacher/dashboard")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeftIcon />
            Back to Dashboard
          </button>
        </div>
      </section>

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10">
              <CourseIcon />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Course Information
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fill in the basic academic details for this course.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Field label="Course Code" hint="Example: CSE-207">
              <input
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                placeholder="CSE-207"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                required
              />
            </Field>

            <Field label="Course Title" hint="Example: Database Systems">
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Database Systems"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                required
              />
            </Field>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Course Type">
              <select
                name="courseType"
                value={form.courseType}
                onChange={handleChange}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
              >
                <option value="theory">Theory Course</option>
                <option value="lab">Lab Course</option>
                <option value="hybrid">Hybrid Course</option>
              </select>
            </Field>

            <Field label="Section" hint="Example: 54/5">
              <input
                type="text"
                name="section"
                value={form.section}
                onChange={handleChange}
                placeholder="54/5"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                required
              />
            </Field>

            <Field label="Semester">
              <select
                name="semester"
                value={form.semester}
                onChange={handleChange}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                required
              >
                <option value="Summer">Summer</option>
                <option value="Spring">Spring</option>
                <option value="Fall">Fall</option>
              </select>
            </Field>

            <Field label="Year">
              <select
                name="year"
                value={form.year}
                onChange={handleChange}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                required
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Preview strip */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/80">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Live Preview
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                {form.code || "Course Code"}
              </span>
              <span className="text-slate-700 dark:text-slate-200">
                {form.title || "Course Title"}
              </span>
              <span className="text-slate-400 dark:text-slate-500">•</span>
              <span className="text-slate-600 dark:text-slate-300">
                Section {form.section || "—"}
              </span>
              <span className="text-slate-400 dark:text-slate-500">•</span>
              <span className="text-slate-600 dark:text-slate-300">
                {form.semester} {form.year}
              </span>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You can edit students, assessments, and other course data after creation.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate("/teacher/dashboard")}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <>
                  <SpinnerIcon />
                  Creating...
                </>
              ) : (
                <>
                  <PlusIcon />
                  Create Course
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default TeacherCreateCoursePage;

/* ---------------- Small UI Helpers ---------------- */

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ---------------- Icons ---------------- */

function CourseIcon() {
  return (
    <svg
      className="h-5 w-5 text-violet-700 dark:text-violet-300"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 6v12m6-6H6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
      />
    </svg>
  );
}