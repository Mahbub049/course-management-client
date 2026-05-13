import { useState } from "react";
import TeacherProjectGroups from "./TeacherProjectGroups";
import TeacherProjectForm from "./TeacherProjectForm";
import TeacherProjectPhases from "./TeacherProjectPhases";
import TeacherProjectSubmissions from "./TeacherProjectSubmissions";
import TeacherProjectMarks from "./TeacherProjectMarks";
import TeacherProjectFinalSync from "./TeacherProjectFinalSync";

const SECTIONS = [
  { key: "groups", label: "Groups" },
  { key: "form", label: "Form" },
  { key: "phases", label: "Phases" },
  { key: "submissions", label: "Submissions" },
  { key: "marks", label: "Marks" },
  { key: "finalSync", label: "Final Sync" },
];

export default function TabProjects({ course }) {
  // Open Groups first because this is the main working area.
  const [activeSection, setActiveSection] = useState("groups");

  const projectFeature = course?.projectFeature || {};
  const isProjectMode = projectFeature?.mode === "project";
  const totalProjectMarks = Number(projectFeature?.totalProjectMarks || 40);

  if (!isProjectMode) {
    return (
      <section className="rounded-[26px] border border-dashed border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <h3 className="font-semibold">Project workflow is not enabled.</h3>
        <p className="mt-1">
          Go to Settings and switch this course to Project Based mode first.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[26px] border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Project Workspace
              </h3>

              <StatusBadge text={`${totalProjectMarks} Marks`} tone="violet" />
              <StatusBadge
                text={projectFeature?.visibleToStudents === false ? "Hidden" : "Student Visible"}
                tone={projectFeature?.visibleToStudents === false ? "rose" : "emerald"}
              />
              <StatusBadge
                text={
                  projectFeature?.allowStudentGroupCreation === false
                    ? "Student Group Locked"
                    : "Student Group Allowed"
                }
                tone={
                  projectFeature?.allowStudentGroupCreation === false
                    ? "amber"
                    : "sky"
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((item, index) => {
              const active = activeSection === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSection(item.key)}
                  className={[
                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
                    active
                      ? "border-violet-600 bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                      : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-violet-500/30 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold",
                      active
                        ? "bg-white/15 text-white"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                    ].join(" ")}
                  >
                    {index + 1}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {activeSection === "groups" && <TeacherProjectGroups course={course} />}
        {activeSection === "form" && <TeacherProjectForm course={course} />}
        {activeSection === "phases" && <TeacherProjectPhases course={course} />}
        {activeSection === "submissions" && <TeacherProjectSubmissions course={course} />}
        {activeSection === "marks" && <TeacherProjectMarks course={course} />}
        {activeSection === "finalSync" && <TeacherProjectFinalSync course={course} />}
      </section>
    </div>
  );
}

function StatusBadge({ text, tone = "slate" }) {
  const toneMap = {
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    violet:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    sky:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    rose:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
  };

  return (
    <span
      className={[
        "rounded-full border px-3 py-1 text-xs font-semibold",
        toneMap[tone] || toneMap.slate,
      ].join(" ")}
    >
      {text}
    </span>
  );
}
