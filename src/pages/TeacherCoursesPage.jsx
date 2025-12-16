import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTeacherCourses, deleteCourseRequest } from "../services/courseService";

export default function TeacherCoursesPage() {
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseError, setCourseError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // ✅ UI states (premium)
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // all | theory | lab | hybrid

  useEffect(() => {
    const loadCourses = async () => {
      setLoadingCourses(true);
      setCourseError("");
      try {
        const data = await fetchTeacherCourses();
        setCourses(data || []);
      } catch (err) {
        console.error(err);
        setCourseError(err?.response?.data?.message || "Server error");
      } finally {
        setLoadingCourses(false);
      }
    };
    loadCourses();
  }, []);

  const openCourse = (course) => {
    if (!course?.id) return;
    navigate(`/teacher/courses/${course.id}`);
  };

  const handleDelete = async (course) => {
    if (!course?.id) return;

    const confirmed = window.confirm(
      `Delete course ${course.code} – ${course.title}?\n\nThis will permanently delete all students, assessments, marks, and complaints under this course.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(course.id);
      await deleteCourseRequest(course.id);
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to delete course.");
    } finally {
      setDeletingId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { all: courses.length, theory: 0, lab: 0, hybrid: 0 };
    courses.forEach((x) => {
      const t = (x.courseType || "theory").toLowerCase();
      if (t === "lab") c.lab += 1;
      else if (t === "hybrid") c.hybrid += 1;
      else c.theory += 1;
    });
    return c;
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const q = query.trim().toLowerCase();

    return courses.filter((c) => {
      const t = (c.courseType || "theory").toLowerCase();
      const matchesType = typeFilter === "all" ? true : t === typeFilter;

      const matchesQuery =
        !q ||
        (c.code || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.section || "").toLowerCase().includes(q) ||
        (c.semester || "").toLowerCase().includes(q) ||
        String(c.year || "").toLowerCase().includes(q);

      return matchesType && matchesQuery;
    });
  }, [courses, query, typeFilter]);

  return (
    <div className="space-y-6">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-purple-100 blur-3xl" />
        <div className="absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-sky-100 blur-3xl" />

        <div className="relative p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                <BookIcon />
                Courses
              </div>
              <h1 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                Manage Your Courses
              </h1>
              <p className="mt-1 text-sm text-slate-500 max-w-2xl">
                Create courses, open course dashboards, and manage assessments, students, and marks.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Pill label={`Total: ${counts.all}`} />
                <Pill label={`Theory: ${counts.theory}`} />
                <Pill label={`Lab: ${counts.lab}`} />
                <Pill label={`Hybrid: ${counts.hybrid}`} />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate("/teacher/create-course")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
              >
                <PlusIcon />
                Create Course
              </button>

              <button
                type="button"
                onClick={() => navigate("/teacher/dashboard")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowLeftIcon />
                Dashboard
              </button>
            </div>
          </div>

          {/* Search + Filter Bar */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <SearchIcon />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by code, title, section, semester, year..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              >
                <option value="all">All Types</option>
                <option value="theory">Theory</option>
                <option value="lab">Lab</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {courseError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-semibold">Could not load courses</div>
          <div className="mt-0.5 opacity-90">{courseError}</div>
        </div>
      )}

      {/* Courses Table Card */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Your Courses</h2>
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold">{filteredCourses.length}</span> of{" "}
              <span className="font-semibold">{courses.length}</span>
            </p>
          </div>
        </div>

        {loadingCourses ? (
          <div className="p-6">
            <div className="grid gap-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <BookIcon />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">No courses found</h3>
            <p className="mt-1 text-sm text-slate-500">
              Try changing filters or create your first course.
            </p>

            <button
              onClick={() => navigate("/teacher/create-course")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <PlusIcon />
              Create Course
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600">Code</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600">Title</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600">Section</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600">Semester</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600">Year</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCourses.map((c) => {
                  const type = (c.courseType || "theory").toLowerCase();

                  const badge =
                    type === "lab"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : type === "hybrid"
                      ? "bg-purple-50 text-purple-700 border border-purple-200"
                      : "bg-sky-50 text-sky-700 border border-sky-200";

                  const label = type === "lab" ? "Lab" : type === "hybrid" ? "Hybrid" : "Theory";

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-4 whitespace-nowrap font-semibold text-slate-900">
                        {c.code}
                      </td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => openCourse(c)}
                          className="text-left w-full"
                          title="Open course"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 hover:text-primary-700 transition">
                              {c.title}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
                              {label}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {c.semester || "-"} • {c.year || "-"} • Section {c.section || "-"}
                          </div>
                        </button>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-slate-600">{c.section || "-"}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-600">{c.semester || "-"}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-600">{c.year || "-"}</td>

                      <td className="px-5 py-4 whitespace-nowrap text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openCourse(c)}
                          className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-primary-700 border border-primary-200 hover:bg-primary-50"
                        >
                          <ArrowRightIcon />
                          Open
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          disabled={deletingId === c.id}
                          className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-60"
                        >
                          {deletingId === c.id ? (
                            <>
                              <SpinnerIcon />
                              Deleting…
                            </>
                          ) : (
                            <>
                              <TrashIcon />
                              Delete
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Small UI helpers ---------------- */

function Pill({ label }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="mt-2 h-3 w-64 rounded bg-slate-200" />
    </div>
  );
}

/* ---------------- Icons (inline SVG) ---------------- */

function BookIcon() {
  return (
    <svg className="h-4 w-4 text-primary-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19a2 2 0 0 0 2 2h14V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
      <path d="M4 7h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 21l-4.3-4.3" />
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
      />
    </svg>
  );
}
