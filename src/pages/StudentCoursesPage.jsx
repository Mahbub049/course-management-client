// client/src/pages/StudentDashboard.jsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchStudentCourses } from "../services/studentService";

function isLabLike(c) {
  const ct = (c?.courseType || "").toLowerCase();
  if (ct === "lab") return true;
  const code = (c?.code || "").toLowerCase();
  const title = (c?.title || "").toLowerCase();
  return code.includes("lab") || title.includes("lab");
}

function getCourseTypeLabel(c) {
  const t = (c?.courseType || "").toLowerCase();
  if (t === "lab") return "Lab";
  if (t === "hybrid") return "Hybrid";
  if (t === "theory") return "Theory";
  return isLabLike(c) ? "Lab" : "Theory";
}

function getTypeBadgeClass(label) {
  if (label === "Lab")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (label === "Hybrid")
    return "bg-purple-50 text-purple-700 border-purple-200";
  return "bg-sky-50 text-sky-700 border-sky-200";
}

function StudentCoursesPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCourses = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchStudentCourses();
        setCourses(data || []);
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    };

    loadCourses();
  }, []);

  const openCourse = (course) => {
    const id = course?._id || course?.id;
    if (!id) return;
    navigate(`/student/courses/${id}`);
  };

  const stats = useMemo(() => {
    const total = courses.length;

    let theory = 0,
      lab = 0,
      hybrid = 0;

    courses.forEach((c) => {
      const label = getCourseTypeLabel(c);
      if (label === "Lab") lab += 1;
      else if (label === "Hybrid") hybrid += 1;
      else theory += 1;
    });

    return { total, theory, lab, hybrid };
  }, [courses]);

  return (
    <div className="mx-auto w-full space-y-5 px-4 pb-10 pt-4 sm:space-y-6 sm:px-6 sm:pt-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <CapIcon />
            Student Portal
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            My Courses
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Open any course to view your marks, running total, grade, and raise
            complaints if needed.
          </p>
        </div>

        {/* Quick stats */}
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 md:w-auto">
          <StatCard label="Total" value={stats.total} icon={<GridIcon />} />
          <StatCard label="Theory" value={stats.theory} icon={<BookIcon />} />
          <StatCard label="Lab" value={stats.lab} icon={<FlaskIcon />} />
          <StatCard label="Hybrid" value={stats.hybrid} icon={<MergeIcon />} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 sm:px-5">
          <div className="font-semibold">Could not load courses</div>
          <div className="opacity-90">{error}</div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 shadow-sm sm:px-5">
          Loading courses…
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm sm:px-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
            <EmptyIcon />
          </div>
          <div className="text-sm font-semibold text-slate-900">
            No courses found
          </div>
          <div className="mt-1 text-sm text-slate-500">
            You are not enrolled in any courses yet.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, idx) => {
            const key = c?._id || c?.id || idx;

            const typeLabel = getCourseTypeLabel(c);
            const badge = getTypeBadgeClass(typeLabel);

            return (
              <button
                key={key}
                onClick={() => openCourse(c)}
                className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition
                           hover:border-indigo-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 sm:p-5"
              >
                {/* top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        <HashIcon />
                        {c?.code || "—"}
                      </span>

                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badge}`}
                      >
                        {typeLabel}
                      </span>
                    </div>

                    <div className="mt-2 line-clamp-2 text-base font-bold text-slate-900 group-hover:text-indigo-700 sm:text-[17px]">
                      {c?.title || "Untitled Course"}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <TagIcon /> Section{" "}
                        <span className="font-semibold text-slate-700">
                          {c?.section || "—"}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarIcon /> {c?.semester || "—"} {c?.year || ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700
                                  group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-700">
                    <ChevronIcon />
                  </div>
                </div>

                {/* summary */}
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  {c.summaryStatus === "published" ? (
                    <div className="flex items-center justify-between gap-6">
                      <div className="text-xs text-slate-600">
                        Current Total
                        <div className="mt-0.5 text-sm font-extrabold text-slate-900">
                          {c.summary?.total}/100
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-600">
                        Grade
                        <div className="mt-0.5 text-sm font-extrabold text-emerald-700">
                          {c.summary?.grade}
                        </div>
                      </div>
                    </div>
                  ) : c.summaryStatus === "in_progress" ? (
                    <div className="text-xs text-amber-700">
                      Marks are being updated
                      <div className="mt-0.5 text-[11px] text-amber-600">
                        Some assessments are pending.
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600">
                      Marks not published yet
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        Assessment structure not finalized.
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StudentCoursesPage;

/* ---------------- Small components ---------------- */

function StatCard({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-500 sm:text-xs">
          {label}
        </div>
        <div className="text-slate-600">{icon}</div>
      </div>
      <div className="mt-1 text-lg font-extrabold text-slate-900 sm:text-xl">
        {value}
      </div>
    </div>
  );
}

/* ---------------- Icons ---------------- */

function ChevronIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
function CapIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1 3 2 6 2s6-1 6-2v-5" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 19a2 2 0 0 0 2 2h12" />
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function FlaskIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M10 2v6l-5 9a4 4 0 0 0 3.5 6h7A4 4 0 0 0 19 17l-5-9V2" />
      <path d="M8 12h8" />
    </svg>
  );
}
function MergeIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M7 7h10M7 17h10" />
      <path d="M12 7v10" />
      <path d="M12 12l3-3M12 12l-3 3" />
    </svg>
  );
}
function HashIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 9h16M4 15h16" />
      <path d="M10 3L8 21M16 3l-2 18" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20.59 13.41L11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z" />
      <path d="M7 7h.01" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M8 2v4M16 2v4" />
      <path d="M3 10h18" />
      <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
    </svg>
  );
}
function EmptyIcon() {
  return (
    <svg
      className="h-6 w-6 text-slate-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 19a2 2 0 0 0 2 2h12" />
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
      <path d="M9 9h6" />
    </svg>
  );
}

// optional named export (keep if you use it elsewhere)
export { StudentCoursesPage };
