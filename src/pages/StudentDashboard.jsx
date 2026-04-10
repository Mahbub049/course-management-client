import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchStudentCourses } from "../services/studentService";

function StudentDashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const studentName = localStorage.getItem("marksPortalName") || "Student";

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchStudentCourses();
        setCourses(data || []);
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const stats = useMemo(() => {
    const total = courses.length;
    let published = 0;
    let inProgress = 0;
    let notPublished = 0;

    courses.forEach((c) => {
      if (c?.summaryStatus === "published") published += 1;
      else if (c?.summaryStatus === "in_progress") inProgress += 1;
      else notPublished += 1;
    });

    return { total, published, inProgress, notPublished };
  }, [courses]);

  const recent = useMemo(() => (courses || []).slice(0, 4), [courses]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Top intro + quick actions */}
      <section className="rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/85 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
              {greeting},{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {studentName}
              </span>
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Student Dashboard
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              View your courses, track published results, monitor progress, and
              access important student actions from one clean dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[520px]">
            <QuickButton
              primary
              icon={<GridIcon />}
              label="My Courses"
              onClick={() => navigate("/student/courses")}
            />
            <QuickButton
              icon={<ChatIcon />}
              label="My Complaints"
              onClick={() => navigate("/student/complaints")}
            />
            <QuickButton
              icon={<AttendanceIcon />}
              label="Attendance"
              onClick={() => navigate("/student/attendance")}
            />
            <QuickButton
              icon={<LockIcon />}
              label="Change Password"
              onClick={() => navigate("/change-password")}
            />
          </div>
        </div>
      </section>

      {/* Hero overview */}
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-white via-violet-50/60 to-sky-50/70 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute -top-16 right-0 h-44 w-44 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
        <div className="pointer-events-none absolute -bottom-16 left-0 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />

        <div className="relative p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                <CapIcon />
                BUBT Marks Portal • Student Panel
              </div>

              <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl">
                Progress & Quick Actions
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Review your course progress, check published marks, visit your
                complaints section, and navigate to important pages faster.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <MiniActionButton
                label="Open Courses"
                primary
                onClick={() => navigate("/student/courses")}
              />
              <MiniActionButton
                label="Complaints"
                onClick={() => navigate("/student/complaints")}
              />
              <MiniActionButton
                label="Attendance"
                onClick={() => navigate("/student/attendance")}
              />
              <MiniActionButton
                label="Password"
                onClick={() => navigate("/change-password")}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <section className="rounded-[24px] border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-rose-700 dark:text-rose-300">
              <AlertIcon />
            </div>
            <div>
              <div className="font-semibold text-rose-800 dark:text-rose-200">
                Could not load dashboard
              </div>
              <div className="mt-1 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Courses"
          value={loading ? "..." : String(stats.total)}
          hint="All enrolled courses"
          icon={<GridIcon />}
          accent="violet"
        />

        <StatCard
          title="Published"
          value={loading ? "..." : String(stats.published)}
          hint="Results already published"
          icon={<CheckIcon />}
          accent="emerald"
        />

        <StatCard
          title="In Progress"
          value={loading ? "..." : String(stats.inProgress)}
          hint="Marks are being updated"
          icon={<ClockIcon />}
          accent="amber"
        />

        <StatCard
          title="Not Published"
          value={loading ? "..." : String(stats.notPublished)}
          hint="No published summary yet"
          icon={<MinusIcon />}
          accent="slate"
        />
      </section>

      {/* Recent Courses */}
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Recent Courses
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Quick access to your latest enrolled courses
            </p>
          </div>

          <button
            onClick={() => navigate("/student/courses")}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            type="button"
          >
            View All
            <ArrowRightIcon />
          </button>
        </div>

        {loading ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-[24px] border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-slate-600 dark:text-slate-300">
                <InfoIcon />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  No courses found
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  You are not enrolled in any courses yet.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((c, idx) => {
              const id = c?._id || c?.id;

              return (
                <button
                  key={id || idx}
                  onClick={() => id && navigate(`/student/courses/${id}`)}
                  className="group relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500/25 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-500/30"
                  type="button"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/5 via-violet-500/5 to-fuchsia-500/5 dark:from-sky-500/5 dark:via-violet-500/5 dark:to-fuchsia-500/5" />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <HashIcon />
                          {c?.code || "—"}
                        </div>

                        <div className="mt-3 line-clamp-2 text-sm font-bold text-slate-900 transition group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
                          {c?.title || "Untitled Course"}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon />
                            {c?.semester || "—"} {c?.year || ""}
                          </span>

                          <span className="inline-flex items-center gap-1">
                            <TagIcon />
                            Section{" "}
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {c?.section || "—"}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:border-violet-200 group-hover:bg-violet-50 group-hover:text-violet-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:group-hover:border-violet-500/30 dark:group-hover:bg-violet-500/10 dark:group-hover:text-violet-300">
                        <ChevronIcon />
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                      {c?.summaryStatus === "published" ? (
                        <div className="flex items-center justify-between gap-6">
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            Current Total
                            <div className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                              {c?.summary?.total ?? 0}/100
                            </div>
                          </div>

                          <div className="text-right text-xs text-slate-600 dark:text-slate-400">
                            Grade
                            <div className="mt-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                              {c?.summary?.grade || "—"}
                            </div>
                          </div>
                        </div>
                      ) : c?.summaryStatus === "in_progress" ? (
                        <div className="text-xs text-amber-700 dark:text-amber-300">
                          Marks are being updated
                          <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                            Some assessments are pending.
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Marks not published yet
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">
                            Assessment structure not finalized.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default StudentDashboard;

/* ---------- UI Components ---------- */

function QuickButton({ label, icon, onClick, primary = false }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-violet-500/40",
        primary
          ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:bg-slate-800",
      ].join(" ")}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MiniActionButton({ label, onClick, primary = false }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={[
        "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition",
        primary
          ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function StatCard({ title, value, hint, icon, accent = "violet" }) {
  const accentMap = {
    violet:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20",
    emerald:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
    amber:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    slate:
      "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20",
  };

  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {title}
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {value}
          </div>
          <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {hint}
          </div>
        </div>

        <div
          className={`rounded-2xl border p-3 ${accentMap[accent] || accentMap.violet}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ---------- Icons ---------- */

function ArrowRightIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

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

function ChatIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function AttendanceIcon() {
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
      <path d="M8 14l2 2 4-4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 8v5l3 3" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14" />
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

function AlertIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10z" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}