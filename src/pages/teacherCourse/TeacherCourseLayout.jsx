import { useNavigate } from "react-router-dom";

export default function TeacherCourseLayout({
  course,
  children,
  activeTab,
  setActiveTab,
}) {
  const navigate = useNavigate();

  const type = (course?.courseType || "theory").toLowerCase();
  const isProjectMode = course?.projectFeature?.mode === "project";

  const typeBadge =
    type === "lab"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : type === "hybrid"
      ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300"
      : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";

  const typeLabel =
    type === "lab" ? "Lab" : type === "hybrid" ? "Hybrid" : "Theory";

  const tabs = [
    { id: "marks", label: "Marks Entry", icon: <MarksIcon /> },
    { id: "assessments", label: "Assessments", icon: <ClipboardIcon /> },
    ...(isProjectMode
      ? [{ id: "projects", label: "Projects", icon: <ProjectIcon /> }]
      : []),
    { id: "materials", label: "Materials", icon: <FolderIcon /> },
    { id: "obe", label: "OBE / CO-PO", icon: <TargetIcon /> },
    { id: "submissions", label: "Submissions", icon: <UploadIcon /> },
    { id: "students", label: "Students", icon: <UsersIcon /> },
    { id: "attendance", label: "Attendance", icon: <CalendarIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
  ];

  return (
    <div className="mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-indigo-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40" />
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
        <div className="absolute -left-16 -bottom-20 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-500/10" />

        <div className="relative p-5 md:p-7 xl:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
                <BookIcon />
                Course Dashboard
              </div>

              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">
                {course?.code || "Course Code"}{" "}
                <span className="text-slate-300 dark:text-slate-600">—</span>{" "}
                <span className="break-words">{course?.title || "Untitled Course"}</span>
              </h2>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Pill label={`Section: ${course?.section || "-"}`} />
                <Pill label={`Semester: ${course?.semester || "-"}`} />
                <Pill label={`Year: ${course?.year || "-"}`} />
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${typeBadge}`}
                >
                  {typeLabel}
                </span>
                {isProjectMode && (
                  <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                    Project Workflow Active
                  </span>
                )}
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Manage course marks, assessments, students, attendance, materials, and project workflow from one organized workspace.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 xl:justify-end">
              <button
                type="button"
                onClick={() => navigate("/teacher/courses")}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ArrowLeftIcon />
                Back to Courses
              </button>

              <button
                type="button"
                onClick={() => navigate("/teacher/dashboard")}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
              >
                <HomeIcon />
                Dashboard
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200/70 pt-5 dark:border-slate-800">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "group inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold border transition-all duration-200",
                      isActive
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                        : "border-slate-200 bg-white/85 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700/80",
                    ].join(" ")}
                  >
                    <span
                      className={
                        isActive
                          ? "text-white"
                          : "text-slate-500 transition group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200"
                      }
                    >
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tabs.find((t) => t.id === activeTab)?.label || "Course Content"}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Work with the selected course section below.
          </div>
        </div>

        <div className="p-5 md:p-6">{children}</div>
      </div>
    </div>
  );
}

function Pill({ label }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {label}
    </span>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10l9-7 9 7" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="h-4 w-4 text-primary-700 dark:text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19a2 2 0 0 0 2 2h14V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
      <path d="M4 7h16" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21a7 7 0 0 0-14 0" />
      <path d="M10 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M21 21a6 6 0 0 0-9-5" />
      <path d="M17 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5h6" />
      <path d="M9 3h6v4H9z" />
      <path d="M7 7h10v14H7z" />
    </svg>
  );
}

function MarksIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19V5" />
      <path d="M10 19V9" />
      <path d="M16 19v-6" />
      <path d="M22 19V3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4" />
      <path d="m7 9-5-5-5 5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h5l2 2h11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 1-2 0 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 1 0-2 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 1 2 0 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.3.43.64.6 1a1.65 1.65 0 0 1 0 2c-.17.36-.36.7-.6 1z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M21 12h-3M12 21v-3M3 12h3" />
    </svg>
  );
}

function ProjectIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h8" />
      <path d="M8 12h8" />
      <path d="M8 18h5" />
      <path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}