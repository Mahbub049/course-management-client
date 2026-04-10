import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTeacherCourses } from "../services/courseService";
import { fetchTeacherComplaints } from "../services/complaintService";

export default function TeacherDashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem("marksPortalRole");
    if (role !== "teacher") navigate("/login", { replace: true });
  }, [navigate]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const teacherName = localStorage.getItem("marksPortalName") || "Teacher";

  const [statsLoading, setStatsLoading] = useState(true);
  const [coursesCount, setCoursesCount] = useState(0);
  const [pendingComplaintsCount, setPendingComplaintsCount] = useState(0);

  useEffect(() => {
    const role = localStorage.getItem("marksPortalRole");
    if (role !== "teacher") return;

    const loadStats = async () => {
      setStatsLoading(true);
      try {
        const [courses, complaints] = await Promise.all([
          fetchTeacherCourses(),
          fetchTeacherComplaints(),
        ]);

        setCoursesCount(Array.isArray(courses) ? courses.length : 0);

        const list = Array.isArray(complaints) ? complaints : [];
        const pending = list.filter(
          (c) => c.status === "open" || c.status === "in_review"
        ).length;

        setPendingComplaintsCount(pending);
      } catch (err) {
        console.error("Dashboard stats error:", err);
        setCoursesCount(0);
        setPendingComplaintsCount(0);
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();
  }, []);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Top intro + quick actions */}
      <section className="rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/85 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
              {greeting},{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {teacherName}
              </span>
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Teacher Dashboard
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Manage courses, attendance, marks and complaints from one clean
              workspace designed for both desktop and mobile use.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[540px]">
            <QuickButton
              primary
              icon={<PlusIcon />}
              label="Create Course"
              onClick={() => navigate("/teacher/create-course")}
            />
            <QuickButton
              icon={<GridIcon />}
              label="View Courses"
              onClick={() => navigate("/teacher/courses")}
            />
            <QuickButton
              icon={<CheckIcon />}
              label="Take Attendance"
              onClick={() => navigate("/teacher/attendance")}
            />
            <QuickButton
              icon={<SheetIcon />}
              label="Attendance Sheet"
              onClick={() => navigate("/teacher/attendance-sheet")}
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
                <SparkIcon />
                BUBT Marks Portal • Teacher Panel
              </div>

              <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl">
                Quick Actions & Overview
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Create courses, manage students and assessments, take daily
                attendance, and handle complaints from one dashboard.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <MiniActionButton
                label="Open Courses"
                primary
                onClick={() => navigate("/teacher/courses")}
              />
              <MiniActionButton
                label="Open Attendance"
                onClick={() => navigate("/teacher/attendance")}
              />
              <MiniActionButton
                label="Attendance Sheet"
                onClick={() => navigate("/teacher/attendance-sheet")}
              />
              <MiniActionButton
                label="View Complaints"
                onClick={() => navigate("/teacher/complaints")}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          title="Courses"
          value={statsLoading ? "..." : String(coursesCount)}
          hint="Total courses you created"
          icon={<BookIcon />}
          accent="violet"
        />

        <StatCard
          title="Pending Complaints"
          value={statsLoading ? "..." : String(pendingComplaintsCount)}
          hint="Open + In-review complaints"
          icon={<AlertIcon />}
          accent="amber"
        />

        <StatCard
          title="Attendance"
          value={statsLoading ? "..." : "Ready"}
          hint="Daily attendance & sheet generation"
          icon={<CheckIcon />}
          accent="emerald"
        />
      </section>

      {/* Main action cards */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4 md:grid-cols-2">
        <ActionCard
          title="Courses"
          desc="Create courses, manage students, open marks tabs and keep course tasks organized."
          buttonText="Go to Courses"
          onClick={() => navigate("/teacher/courses")}
          icon={<BookIcon />}
          accent="from-sky-500/10 via-indigo-500/10 to-violet-500/10 dark:from-sky-500/10 dark:via-indigo-500/5 dark:to-violet-500/10"
        />

        <ActionCard
          title="Attendance"
          desc="Take attendance, update previous records and generate attendance sheets easily."
          buttonText="Open Attendance"
          onClick={() => navigate("/teacher/attendance")}
          icon={<CheckIcon />}
          accent="from-emerald-500/10 via-cyan-500/10 to-sky-500/10 dark:from-emerald-500/10 dark:via-cyan-500/5 dark:to-sky-500/10"
        />

        <ActionCard
          title="Complaints"
          desc="Review attendance and marks complaints, reply quickly and keep issue tracking clean."
          buttonText="Go to Complaints"
          onClick={() => navigate("/teacher/complaints")}
          icon={<AlertIcon />}
          accent="from-amber-500/10 via-orange-500/10 to-rose-500/10 dark:from-amber-500/10 dark:via-orange-500/5 dark:to-rose-500/10"
        />

        <ActionCard
          title="Account Settings"
          desc="Change your password and keep your teacher account settings up to date."
          buttonText="Go to Account"
          onClick={() => navigate("/change-password")}
          icon={<UserIcon />}
          accent="from-teal-500/10 via-emerald-500/10 to-sky-500/10 dark:from-teal-500/10 dark:via-emerald-500/5 dark:to-sky-500/10"
        />
      </section>
    </div>
  );
}

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
    amber:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    emerald:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
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

function ActionCard({ title, desc, buttonText, onClick, icon, accent }) {
  return (
    <div className="group relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/40 blur-2xl dark:bg-white/5" />

      <div className="relative flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-slate-800 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100">
            {icon}
          </div>

          <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-500 backdrop-blur dark:bg-slate-800/80 dark:text-slate-400">
            Quick Access
          </span>
        </div>

        <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>

        <p className="mt-2 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
          {desc}
        </p>

        <button
          onClick={onClick}
          type="button"
          className="mt-5 inline-flex items-center justify-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700"
        >
          {buttonText}
          <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

/* ---------- Icons ---------- */

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowIcon() {
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

function SparkIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 2l1.5 5L19 9l-5.5 2L12 16l-1.5-5L5 9l5.5-2L12 2z" />
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
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 19a2 2 0 0 0 2 2h14V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
      <path d="M4 7h16" />
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
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.5h3.4L22 20H2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h4" />
    </svg>
  );
}