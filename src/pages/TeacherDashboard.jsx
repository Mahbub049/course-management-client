import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function TeacherDashboard() {
  const navigate = useNavigate();

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const teacherName = localStorage.getItem("marksPortalName") || "Teacher";

  return (
    <div className="space-y-6">
      {/* Top header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {greeting}, <span className="text-slate-700">{teacherName}</span>
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Teacher Dashboard
          </h1>

          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Manage courses, review complaints, and update account settings — all from one place.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate("/teacher/create-course")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            <PlusIcon />
            Create Course
          </button>

          <button
            onClick={() => navigate("/teacher/courses")}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <GridIcon />
            View Courses
          </button>
        </div>
      </div>

      {/* Premium “Hero” card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-purple-100 blur-3xl" />
        <div className="absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-sky-100 blur-3xl" />

        <div className="relative p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                <SparkIcon />
                BUBT Marks Portal • Teacher Panel
              </div>

              <h2 className="mt-3 text-xl font-semibold text-slate-900">
                Quick Actions & Overview
              </h2>

              <p className="mt-1 text-sm text-slate-500 max-w-xl">
                Start by creating a course, then add students and assessments. Marks and complaints are managed per course.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => navigate("/teacher/courses")}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Open Courses
              </button>
              <button
                onClick={() => navigate("/teacher/complaints")}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Complaints
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row (UI-only for now) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="Courses"
          value="—"
          hint="Total courses you created"
          icon={<BookIcon />}
        />
        <StatCard
          title="Pending Complaints"
          value="—"
          hint="Complaints marked as open/in review"
          icon={<AlertIcon />}
        />
        <StatCard
          title="Last Activity"
          value="—"
          hint="Most recent update in your portal"
          icon={<ClockIcon />}
        />
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActionCard
          title="Courses"
          desc="Create courses, open marks tabs, manage students."
          buttonText="Go to Courses"
          onClick={() => navigate("/teacher/courses")}
          icon={<BookIcon />}
          accent="from-sky-500/10 to-purple-500/10"
        />
        <ActionCard
          title="Complaints"
          desc="Reply, mark in-review, and resolve complaints."
          buttonText="Go to Complaints"
          onClick={() => navigate("/teacher/complaints")}
          icon={<AlertIcon />}
          accent="from-amber-500/10 to-rose-500/10"
        />
        <ActionCard
          title="Account Settings"
          desc="Change password, update your profile details."
          buttonText="Go to Account"
          onClick={() => navigate("/change-password")}
          icon={<UserIcon />}
          accent="from-emerald-500/10 to-sky-500/10"
        />
      </div>

      {/* Recent activity placeholder */}
      {/* <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Recent Activity
          </h3>
          <span className="text-xs text-slate-500">Coming soon</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SkeletonLine />
          <SkeletonLine />
          <SkeletonLine />
          <SkeletonLine />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Tip: You can add real data later (courses count, pending complaints) once APIs are available.
        </p>
      </div> */}
    </div>
  );
}

/* ---------- Small UI Components ---------- */

function StatCard({ title, value, hint, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500">{title}</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{hint}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ title, desc, buttonText, onClick, icon, accent }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl border border-slate-200 bg-white/70 p-2 text-slate-800">
            {icon}
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            Quick Access
          </span>
        </div>

        <h3 className="mt-3 text-base font-semibold text-slate-900">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-600">{desc}</p>

        <button
          onClick={onClick}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {buttonText}
          <ArrowIcon />
        </button>
      </div>

      <div className="absolute right-0 top-0 h-24 w-24 -translate-y-6 translate-x-6 rounded-full bg-white/40 blur-2xl group-hover:bg-white/60 transition" />
    </div>
  );
}

function SkeletonLine() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="mt-2 h-3 w-56 rounded bg-slate-200" />
    </div>
  );
}

/* ---------- Icons (inline SVG, no library) ---------- */

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l1.5 5L19 9l-5.5 2L12 16l-1.5-5L5 9l5.5-2L12 2z" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19a2 2 0 0 0 2 2h14V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
      <path d="M4 7h16" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.5h3.4L22 20H2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 8v5l3 2" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    </svg>
  );
}
