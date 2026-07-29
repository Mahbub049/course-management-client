import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPublicSubmissionPortal } from "../services/labSubmissionService";

function formatDateTime(value) {
  if (!value) return "No deadline set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline set";

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function courseMeta(course = {}) {
  return [
    course.intake ? `Intake ${course.intake}` : "",
    course.section ? `Section ${course.section}` : "",
    course.semester && course.year
      ? `${course.semester} ${course.year}`
      : course.semester || course.year || "",
  ]
    .filter(Boolean)
    .join(" • ");
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CourseCard({ item }) {
  const assessments = Array.isArray(item.assessments) ? item.assessments : [];
  const visibleAssessments = assessments.slice(0, 3);
  const remainingCount = Math.max(0, assessments.length - visibleAssessments.length);
  const hasOpenSubmission = Number(item.openAssessmentCount || 0) > 0;

  return (
    <article className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-100/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:shadow-black/20 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              {item.course?.code || "Course"}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                hasOpenSubmission
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {hasOpenSubmission
                ? `${item.openAssessmentCount} open`
                : "No open task"}
            </span>
          </div>

          <h2 className="mt-4 line-clamp-2 text-xl font-bold leading-tight text-slate-950 dark:text-white">
            {item.title || `${item.course?.code || "Course"} Submission`}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
            {item.course?.title || "Course submission page"}
          </p>
        </div>

        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none">
          <UploadIcon />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Course details
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {courseMeta(item.course) || "Course information"}
        </div>
        {item.teacher?.name ? (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Faculty: {item.teacher.name}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Available submissions
          </div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {item.assessmentCount || assessments.length} total
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {visibleAssessments.map((assessment) => (
            <div
              key={assessment.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 px-3.5 py-3 dark:border-slate-800"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {assessment.name}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatDateTime(assessment.dueDate)}
                </div>
              </div>
              <span
                className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  assessment.submissionsOpen
                    ? "bg-emerald-500"
                    : "bg-slate-300 dark:bg-slate-600"
                }`}
                title={assessment.submissionsOpen ? "Open" : "Closed"}
              />
            </div>
          ))}

          {remainingCount > 0 ? (
            <div className="px-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
              +{remainingCount} more submission{remainingCount === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          {item.nextDeadline
            ? `Next deadline: ${formatDateTime(item.nextDeadline)}`
            : "No upcoming deadline"}
        </div>
        <Link
          to={`/submit/${item.token}`}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500"
        >
          Open course submissions
          <ArrowIcon />
        </Link>
      </div>
    </article>
  );
}

export default function PublicSubmissionPortalPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState([]);
  const [query, setQuery] = useState("");

  const loadPortal = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchPublicSubmissionPortal();
      setCourses(Array.isArray(data?.courses) ? data.courses : []);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "The public submission portal could not be loaded right now."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, []);

  const filteredCourses = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return courses;

    return courses.filter((item) => {
      const searchable = [
        item.title,
        item.course?.code,
        item.course?.title,
        item.course?.intake,
        item.course?.section,
        item.course?.semester,
        item.course?.year,
        item.teacher?.name,
        ...(item.assessments || []).map((assessment) => assessment.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(cleanQuery);
    });
  }, [courses, query]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-white">
              <UploadIcon />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-950 dark:text-white">
                BUBT Marks Portal
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Public Submission
              </div>
            </div>
          </div>
          <a
            href="/login"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Portal Login
          </a>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 px-6 py-8 text-white shadow-2xl shadow-indigo-200/60 dark:shadow-none sm:px-10 sm:py-12">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-50">
              One simple address
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              Submit your course work from one place
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-indigo-100 sm:text-base">
              Select your course, verify your roll number, and upload the required file. No student login is needed.
            </p>
          </div>

          <div className="relative mt-7 max-w-2xl">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-indigo-300">
              <SearchIcon />
            </div>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by course code, title, intake, section, or faculty..."
              className="w-full rounded-2xl border border-white/20 bg-white py-3.5 pl-12 pr-4 text-sm text-slate-900 shadow-lg outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/20"
            />
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                Available courses
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Only courses currently published by faculty members are shown here.
              </p>
            </div>
            {!loading && !error ? (
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {filteredCourses.length} course{filteredCourses.length === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-96 animate-pulse rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
              <div className="font-bold">Could not load submissions</div>
              <p className="mt-1 text-sm">{error}</p>
              <button
                type="button"
                onClick={loadPortal}
                className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
              >
                Try again
              </button>
            </div>
          ) : filteredCourses.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredCourses.map((item) => (
                <CourseCard key={item.token} item={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <SearchIcon />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                {query ? "No matching course found" : "No course is published right now"}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500 dark:text-slate-400">
                {query
                  ? "Try a different course code, intake, section, or faculty name."
                  : "A course will appear here when its faculty member enables public submission."}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
