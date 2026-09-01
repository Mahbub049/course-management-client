import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchStudentCourses } from "../services/studentService";
import StudentLabSubmissions from "./studentCourse/StudentLabSubmissions";
import StudentPageBack from "../components/StudentPageBack";

function getCourseId(course) {
  return course?._id || course?.id || "";
}

function getTypeLabel(course) {
  const type = String(course?.courseType || "theory").toLowerCase();
  if (type === "lab") return "Lab";
  if (type === "hybrid") return "Hybrid";
  return "Theory";
}

export default function StudentSubmissionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cachedCourses = useMemo(() => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem("studentCoursesCache") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);
  const [courses, setCourses] = useState(cachedCourses);
  const [loading, setLoading] = useState(cachedCourses.length === 0);
  const [error, setError] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState(() => {
    const requested = searchParams.get("course") || "";
    if (requested) return requested;
    return cachedCourses.length === 1 ? getCourseId(cachedCourses[0]) : "";
  });

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchStudentCourses();
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        setCourses(list);
        sessionStorage.setItem("studentCoursesCache", JSON.stringify(list));

        const requested = searchParams.get("course") || "";
        if (requested && list.some((course) => getCourseId(course) === requested)) {
          setSelectedCourseId(requested);
        } else if (list.length === 1) {
          const onlyId = getCourseId(list[0]);
          setSelectedCourseId(onlyId);
          const next = new URLSearchParams(searchParams);
          next.set("course", onlyId);
          setSearchParams(next, { replace: true });
        }
      } catch (err) {
        if (!active) return;
        setError(err?.response?.data?.message || "Could not load your courses.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const selectedCourse = useMemo(
    () => courses.find((course) => getCourseId(course) === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const chooseCourse = (courseId) => {
    setSelectedCourseId(courseId);
    const next = new URLSearchParams(searchParams);
    if (courseId) next.set("course", courseId);
    else next.delete("course");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="w-full space-y-5 pb-8">
      <StudentPageBack />
      <section className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-gradient-to-br from-white via-violet-50/50 to-sky-50/60 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:border-violet-500/20 dark:bg-slate-800/80 dark:text-violet-300">
            <SubmissionIcon />
            Student Submissions
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Submissions
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            {courses.length === 1
              ? "Your enrolled course is selected automatically. Running tasks and previous submissions are shown below."
              : "Start by selecting a course below. Running tasks and previous submissions will then appear together."}
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {courses.length !== 1 && (
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Select course</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Only submissions for the selected course will be shown.
              </p>
            </div>
            {!loading && courses.length > 0 ? (
              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {courses.length} enrolled course{courses.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-9 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              You are not enrolled in any courses yet.
            </div>
          ) : (
            <>
              <div className="sm:hidden">
                <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Course
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(event) => chooseCourse(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Choose a course</option>
                  {courses.map((course) => (
                    <option key={getCourseId(course)} value={getCourseId(course)}>
                      {course.code} — {course.title} (Sec {course.section || "—"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => {
                  const id = getCourseId(course);
                  const active = id === selectedCourseId;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => chooseCourse(id)}
                      className={[
                        "group rounded-2xl border p-4 text-left transition",
                        active
                          ? "border-violet-300 bg-violet-50 shadow-sm ring-2 ring-violet-500/10 dark:border-violet-500/40 dark:bg-violet-500/10"
                          : "border-slate-200 bg-slate-50/70 hover:border-violet-200 hover:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-violet-500/30 dark:hover:bg-slate-800",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
                            {course.code || "Course"}
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">
                            {course.title || "Untitled Course"}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {getTypeLabel(course)}
                        </span>
                      </div>
                      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        Section {course.section || "—"} · {course.semester || "—"} {course.year || ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      )}

      {courses.length === 1 && selectedCourse ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-500/20 dark:bg-violet-500/5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300">Selected automatically</div>
            <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{selectedCourse.code} — {selectedCourse.title}</div>
          </div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Section {selectedCourse.section || "—"}</div>
        </div>
      ) : null}

      {selectedCourse ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300">
                {selectedCourse.code}
              </div>
              <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                {selectedCourse.title}
              </h2>
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Section {selectedCourse.section || "—"}
            </div>
          </div>

          <StudentLabSubmissions courseId={selectedCourseId} />
        </section>
      ) : !loading && courses.length > 0 ? (
        <div className="rounded-[28px] border border-dashed border-violet-200 bg-violet-50/40 px-5 py-10 text-center dark:border-violet-500/20 dark:bg-violet-500/5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
            <CourseIcon />
          </div>
          <div className="mt-3 text-sm font-bold text-slate-900 dark:text-white">Choose a course to continue</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Running and past submissions will appear here.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SubmissionIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M14 2v6h6" />
      <path d="M9 14h6M9 18h4" />
    </svg>
  );
}

function CourseIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m3 8 9-5 9 5-9 5z" />
      <path d="M7 10.5V15c0 1.8 2.2 3 5 3s5-1.2 5-3v-4.5" />
    </svg>
  );
}
