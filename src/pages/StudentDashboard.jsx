// client/src/pages/StudentDashboard.jsx

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
    let published = 0,
      inProgress = 0,
      notPublished = 0;

    courses.forEach((c) => {
      if (c?.summaryStatus === "published") published += 1;
      else if (c?.summaryStatus === "in_progress") inProgress += 1;
      else notPublished += 1;
    });

    return { total, published, inProgress, notPublished };
  }, [courses]);

  const recent = useMemo(() => (courses || []).slice(0, 3), [courses]);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50/70">
      <div className="mx-auto w-full space-y-6 px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        {/* Header card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                <CapIcon />
                Student Dashboard
              </div>

              <p className="mt-3 text-xs font-medium text-slate-500">
                {greeting}, <span className="text-slate-700">{studentName}</span>
              </p>

              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Overview
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                See your progress, published results, and quick actions.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate("/student/courses")}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <GridIcon /> My Courses
              </button>

              <button
                onClick={() => navigate("/student/complaints")}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ChatIcon /> My Complaints
              </button>

              <button
                onClick={() => navigate("/change-password")}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <LockIcon /> Change Password
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm sm:px-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <AlertIcon />
              </div>
              <div>
                <div className="font-semibold">Could not load dashboard</div>
                <div className="opacity-90">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Courses" value={stats.total} icon={<GridIcon />} />
          <StatCard label="Published" value={stats.published} icon={<CheckIcon />} />
          <StatCard label="In Progress" value={stats.inProgress} icon={<ClockIcon />} />
          <StatCard label="Not Published" value={stats.notPublished} icon={<MinusIcon />} />
        </div>

        {/* Recent courses */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-extrabold text-slate-900">
                Recent Courses
              </div>
              <div className="mt-0.5 text-sm text-slate-500">
                Quick access to your courses
              </div>
            </div>

            <button
              onClick={() => navigate("/student/courses")}
              className="text-sm font-semibold text-indigo-700 hover:text-indigo-800"
            >
              View all →
            </button>
          </div>

          {loading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-3xl border border-slate-200 bg-slate-50"
                />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <InfoIcon />
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    No courses found
                  </div>
                  <div className="mt-1 text-slate-500">
                    You are not enrolled in any courses yet.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((c, idx) => (
                <button
                  key={c?._id || c?.id || idx}
                  onClick={() =>
                    navigate(`/student/courses/${c?._id || c?.id}`)
                  }
                  className="group rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        <HashIcon />
                        {c?.code || "—"}
                      </div>

                      <div className="mt-2 line-clamp-2 text-sm font-extrabold text-slate-900 group-hover:text-indigo-700">
                        {c?.title || "Untitled Course"}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarIcon />
                          {c?.semester || "—"} {c?.year || ""}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <TagIcon />
                          Section{" "}
                          <span className="font-semibold text-slate-700">
                            {c?.section || "—"}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-700">
                      <ChevronIcon />
                    </div>
                  </div>

                  {/* status line */}
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    {c?.summaryStatus === "published" ? (
                      <div className="flex items-center justify-between gap-6">
                        <div className="text-xs text-slate-600">
                          Current Total
                          <div className="mt-0.5 text-sm font-extrabold text-slate-900">
                            {c?.summary?.total ?? 0}/100
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-600">
                          Grade
                          <div className="mt-0.5 text-sm font-extrabold text-emerald-700">
                            {c?.summary?.grade || "—"}
                          </div>
                        </div>
                      </div>
                    ) : c?.summaryStatus === "in_progress" ? (
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentDashboard;

/* ---------------- Small components ---------------- */

function StatCard({ label, value, icon }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
          {icon}
        </div>
      </div>

      <div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div>

      {/* subtle visual meter */}
      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
        <div className="h-1.5 w-2/3 rounded-full bg-indigo-200" />
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
      className="h-5 w-5 text-rose-700"
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
      className="h-5 w-5 text-slate-600"
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
