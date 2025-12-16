import { useNavigate } from "react-router-dom";

export default function TeacherCourseLayout({ course, children, activeTab, setActiveTab }) {
  const navigate = useNavigate();

  const type = (course?.courseType || "theory").toLowerCase();
  const typeBadge =
    type === "lab"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : type === "hybrid"
      ? "bg-purple-50 text-purple-700 border border-purple-200"
      : "bg-sky-50 text-sky-700 border border-sky-200";

  const typeLabel = type === "lab" ? "Lab" : type === "hybrid" ? "Hybrid" : "Theory";

  const tabs = [
    { id: "students", label: "Students", icon: <UsersIcon /> },
    { id: "assessments", label: "Assessments", icon: <ClipboardIcon /> },
    { id: "marks", label: "Marks Entry", icon: <MarksIcon /> },
    { id: "attendance", label: "Attendance", icon: <CalendarIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
  ];

  return (
    <div className=" mx-auto space-y-5">
      {/* Header Card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-purple-100 blur-3xl" />
        <div className="absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-sky-100 blur-3xl" />

        <div className="relative p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                <BookIcon />
                Course Dashboard
              </div>

              <h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                {course.code} <span className="text-slate-400">—</span> {course.title}
              </h2>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Pill label={`Section: ${course.section || "-"}`} />
                <Pill label={`Semester: ${course.semester || "-"}`} />
                <Pill label={`Year: ${course.year || "-"}`} />
                <span className={`inline-flex items-center rounded-full px-3 py-1 border text-xs font-semibold ${typeBadge}`}>
                  {typeLabel}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate("/teacher/courses")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowLeftIcon />
                Back to Courses
              </button>

              <button
                type="button"
                onClick={() => navigate("/teacher/dashboard")}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                <HomeIcon />
                Dashboard
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border transition",
                    isActive
                      ? "bg-primary-600 text-white border-primary-600 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className={isActive ? "text-white" : "text-slate-500"}>
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 md:p-6">
        {children}
      </div>
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

/* ---------------- Icons (inline SVG) ---------------- */

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
    <svg className="h-4 w-4 text-primary-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <path d="M4 19h16" />
      <path d="M8 15l3-3 3 2 4-5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3v3M16 3v3" />
      <path d="M4 7h16" />
      <path d="M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.9 7.9 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L15 3H9l-.4 2.5a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L9 21h6l.4-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5z" />
    </svg>
  );
}
