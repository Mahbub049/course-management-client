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
  const isSelfStudy = type === "self_study";
  const isEveningCourse = String(course?.shift || "").trim().toLowerCase() === "evening";
  const isCourseFileEligible =
    String(course?.shift || "").toLowerCase() === "day" &&
    !String(course?.department || "").toUpperCase().includes("(DH)") &&
    !isSelfStudy;

  const typeBadge =
    type === "lab"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : type === "hybrid"
      ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300"
      : type === "self_study"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
      : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";

  const typeLabel =
    type === "lab" ? "Lab" : type === "hybrid" ? "Hybrid" : type === "self_study" ? "Self Study" : "Theory";

  const tabs = [
    { id: "marks", label: "Marks", icon: <MarksIcon /> },
    { id: "assessments", label: "Assessments", icon: <ClipboardIcon /> },
    ...(isProjectMode
      ? [{ id: "projects", label: "Projects", icon: <ProjectIcon /> }]
      : []),
    { id: "submissions", label: "Submissions", icon: <UploadIcon /> },
    ...(!isEveningCourse
      ? [{ id: "obe", label: "OBE / CO-PO", icon: <TargetIcon /> }]
      : []),
    { id: "students", label: "Students", icon: <UsersIcon /> },
    ...(isSelfStudy ? [{ id: "bill", label: "Bill Generate", icon: <BillIcon /> }] : []),
    ...(isCourseFileEligible
      ? [{ id: "course-file", label: "Course File", icon: <FolderIcon /> }]
      : []),
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
  ];

  return (
    <div className="mx-auto space-y-5">
      <section className="relative overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_16px_42px_-30px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-indigo-500/[0.055] blur-3xl dark:bg-indigo-500/[0.08]" />

        <div className="relative px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6 lg:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="min-w-0 text-[24px] font-extrabold leading-tight tracking-[-0.025em] text-slate-950 dark:text-white sm:text-[28px] lg:text-[30px]">
                  <span className="whitespace-nowrap">{course?.code || "Course Code"}</span>
                  <span className="mx-2.5 font-medium text-slate-300 dark:text-slate-700">—</span>
                  <span className="break-words">{course?.title || "Untitled Course"}</span>
                </h1>

                <span
                  className={`inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-bold uppercase tracking-[0.08em] ${typeBadge}`}
                >
                  {typeLabel}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill label={`Sec ${course?.section || "-"}`} />
                {course?.intake && <Pill label={`Intake ${course.intake}`} />}
                <Pill label={`${course?.semester || "-"} ${course?.year || "-"}`} />
                {isSelfStudy && course?.creditHours && (
                  <Pill
                    label={`${course.creditHours} Credit Hour${
                      Number(course.creditHours) === 1 ? "" : "s"
                    }`}
                  />
                )}
                {isProjectMode && (
                  <span className="inline-flex h-8 items-center rounded-full border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                    Project Workflow
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate("/teacher/courses")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              >
                <ArrowLeftIcon />
                <span className="hidden sm:inline">Courses</span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/teacher/dashboard")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-500 hover:shadow-md dark:bg-indigo-600 dark:hover:bg-indigo-500"
              >
                <HomeIcon />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200/80 pt-4 dark:border-slate-800">
            <div
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0"
              style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "group relative inline-flex h-[52px] min-w-[138px] shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-[13px] font-semibold transition-all duration-200 lg:min-w-0 lg:w-full",
                      isActive
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-[0_8px_20px_-12px_rgba(79,70,229,0.9)]"
                        : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-white",
                    ].join(" ")}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span
                      className={[
                        "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                        isActive
                          ? "bg-white/15 text-white"
                          : "bg-white text-slate-500 shadow-sm ring-1 ring-slate-200/80 group-hover:text-indigo-600 dark:bg-slate-950 dark:text-slate-400 dark:ring-slate-800 dark:group-hover:text-indigo-300",
                      ].join(" ")}
                    >
                      {tab.icon}
                    </span>
                    <span className="whitespace-nowrap">{tab.label}</span>
                    {isActive && (
                      <span className="absolute inset-x-5 -bottom-px h-0.5 rounded-full bg-white/75" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-h-12 items-center border-b border-slate-100 px-5 dark:border-slate-800 sm:px-6">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-slate-100">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            {tabs.find((t) => t.id === activeTab)?.label || "Course Content"}
          </div>
        </div>

        <div className="p-3 sm:p-4 md:p-5">{children}</div>
      </div>
    </div>
  );
}

function Pill({ label }) {
  return (
    <span className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
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

function BillIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h9l4 4v16H6z" />
      <path d="M14 2v5h5" />
      <path d="M9 12h6M9 16h6" />
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