import { useMemo, useState } from "react";
import TeacherProjectGroups from "./TeacherProjectGroups";
import TeacherProjectForm from "./TeacherProjectForm";
import TeacherProjectPhases from "./TeacherProjectPhases";
import TeacherProjectSubmissions from "./TeacherProjectSubmissions";
import TeacherProjectMarks from "./TeacherProjectMarks";
import TeacherProjectFinalSync from "./TeacherProjectFinalSync";

const SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    description: "See workflow summary and next actions.",
  },
  {
    key: "groups",
    label: "Groups",
    description: "Create, edit, and manage student groups.",
  },
  {
    key: "form",
    label: "Form",
    description: "Control which project fields students can fill.",
  },
  {
    key: "phases",
    label: "Phases",
    description: "Define milestones, deadlines, and tasks.",
  },
  {
    key: "submissions",
    label: "Submissions",
    description: "Track links, files, and student submissions.",
  },
  {
    key: "marks",
    label: "Marks",
    description: "Evaluate groups and prepare final marks.",
  },
  {
    key: "finalSync",
    label: "Final Sync",
    description: "Sync project result into the final system.",
  },
];

export default function TabProjects({ course }) {
  const [activeSection, setActiveSection] = useState("overview");

  const projectFeature = course?.projectFeature || {};
  const isProjectMode = projectFeature?.mode === "project";
  const totalProjectMarks = Number(projectFeature?.totalProjectMarks || 40);

  const summary = useMemo(() => {
    const studentGroupCreationAllowed =
      projectFeature?.allowStudentGroupCreation !== false;
    const teacherGroupEditingAllowed =
      projectFeature?.allowTeacherGroupEditing !== false;
    const visibleToStudents = projectFeature?.visibleToStudents !== false;

    return [
      {
        key: "mode",
        label: "Workflow Mode",
        value: isProjectMode ? "Project Based" : "Lab Final Based",
        tone: "violet",
        helper: isProjectMode
          ? "Full project workflow is enabled for this course."
          : "Project workflow is currently disabled.",
      },
      {
        key: "marks",
        label: "Project Marks",
        value: `${totalProjectMarks} Marks`,
        tone: "sky",
        helper: "This is the total project mark configured for the course.",
      },
      {
        key: "studentCreate",
        label: "Student Group Creation",
        value: studentGroupCreationAllowed ? "Allowed" : "Locked",
        tone: studentGroupCreationAllowed ? "emerald" : "amber",
        helper: studentGroupCreationAllowed
          ? "Students can create their own groups."
          : "Only teacher-side group management is allowed.",
      },
      {
        key: "teacherEdit",
        label: "Teacher Group Editing",
        value: teacherGroupEditingAllowed ? "Allowed" : "Locked",
        tone: teacherGroupEditingAllowed ? "emerald" : "amber",
        helper: teacherGroupEditingAllowed
          ? "Teacher can create and reorganize groups."
          : "Teacher-side editing has been restricted.",
      },
      {
        key: "visibility",
        label: "Student Visibility",
        value: visibleToStudents ? "Visible" : "Hidden",
        tone: visibleToStudents ? "emerald" : "rose",
        helper: visibleToStudents
          ? "Students can see the project area in their course page."
          : "Students currently cannot access this project module.",
      },
    ];
  }, [isProjectMode, projectFeature, totalProjectMarks]);

  if (!isProjectMode) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-dashed border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <FolderIcon />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Project workflow is not enabled
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Go to <span className="font-semibold">Settings</span> and switch
                this course to <span className="font-semibold">Project Based</span>{" "}
                mode first.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-3">
          <DisabledMiniCard
            title="Groups"
            text="Student group creation will appear here after project mode is enabled."
          />
          <DisabledMiniCard
            title="Form"
            text="Project information fields can be configured from this section."
          />
          <DisabledMiniCard
            title="Marks"
            text="Project evaluation and final sync will be available later."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative overflow-hidden border-b border-slate-100 px-6 py-6 dark:border-slate-800">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 via-sky-500/5 to-emerald-500/10 dark:from-violet-500/10 dark:via-sky-500/5 dark:to-emerald-500/10" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                <FolderIcon className="h-4 w-4" />
                Project Workspace
              </div>

              <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Manage the complete course project workflow from one place
              </h3>

              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-400">
                Create student groups, control project form fields, define
                phases, review submissions, assign marks, and sync the final
                outcome into your course workflow.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[520px]">
              <MetricTile
                label="Mode"
                value="Project"
                subtle="Enabled"
              />
              <MetricTile
                label="Marks"
                value={String(totalProjectMarks)}
                subtle="Configured"
              />
              <MetricTile
                label="Student Access"
                value={
                  projectFeature?.visibleToStudents === false ? "Off" : "On"
                }
                subtle="Visibility"
              />
              <MetricTile
                label="Teacher Control"
                value={
                  projectFeature?.allowTeacherGroupEditing === false
                    ? "Limited"
                    : "Active"
                }
                subtle="Editing"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
          {summary.map((item) => (
            <SummaryCard
              key={item.key}
              label={item.label}
              value={item.value}
              helper={item.helper}
              tone={item.tone}
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Project Modules
              </h4>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Move between each module to manage the project workflow.
              </p>
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
                      "group inline-flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                      active
                        ? "border-violet-600 bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                        : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-500/30 dark:hover:bg-slate-800",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold",
                        active
                          ? "bg-white/15 text-white"
                          : "bg-slate-100 text-slate-600 group-hover:bg-violet-100 group-hover:text-violet-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-violet-500/10 dark:group-hover:text-violet-300",
                      ].join(" ")}
                    >
                      {index + 1}
                    </div>

                    <div className="hidden sm:block">
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div
                        className={[
                          "text-xs",
                          active ? "text-violet-100" : "text-slate-500 dark:text-slate-400",
                        ].join(" ")}
                      >
                        {item.description}
                      </div>
                    </div>

                    <div className="sm:hidden text-sm font-semibold">
                      {item.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6">
          {activeSection === "overview" && (
            <OverviewSection
              totalProjectMarks={totalProjectMarks}
              projectFeature={projectFeature}
              onOpenSection={setActiveSection}
            />
          )}

          {activeSection === "groups" && <TeacherProjectGroups course={course} />}
          {activeSection === "form" && <TeacherProjectForm course={course} />}
          {activeSection === "phases" && <TeacherProjectPhases course={course} />}
          {activeSection === "submissions" && (
            <TeacherProjectSubmissions course={course} />
          )}
          {activeSection === "marks" && <TeacherProjectMarks course={course} />}
          {activeSection === "finalSync" && (
            <TeacherProjectFinalSync course={course} />
          )}
        </div>
      </section>
    </div>
  );
}

function OverviewSection({ totalProjectMarks, projectFeature, onOpenSection }) {
  const studentCreateAllowed =
    projectFeature?.allowStudentGroupCreation !== false;
  const teacherEditAllowed =
    projectFeature?.allowTeacherGroupEditing !== false;
  const visibleToStudents = projectFeature?.visibleToStudents !== false;

  const quickActions = [
    {
      title: "Manage Groups",
      description:
        "Create new groups, fix member problems, and make sure one student stays in only one group.",
      button: "Open Groups",
      target: "groups",
      icon: <UsersIcon />,
    },
    {
      title: "Configure Form",
      description:
        "Choose which fields students must submit, such as title, summary, drive link, repository, or contact email.",
      button: "Open Form",
      target: "form",
      icon: <FormIcon />,
    },
    {
      title: "Prepare Evaluation Flow",
      description:
        "Create phases, review submissions, assign marks, and sync the final project result into the course system.",
      button: "Continue Workflow",
      target: "phases",
      icon: <WorkflowIcon />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="rounded-[26px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Workflow Summary
              </div>
              <h4 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
                Your course is ready for project workflow setup
              </h4>
            </div>

            <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:flex dark:bg-violet-500/10 dark:text-violet-300">
              <FolderIcon />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <StatusLine
              label="Project marks"
              value={`${totalProjectMarks} marks`}
              status="info"
            />
            <StatusLine
              label="Student access"
              value={visibleToStudents ? "Visible" : "Hidden"}
              status={visibleToStudents ? "success" : "danger"}
            />
            <StatusLine
              label="Student group creation"
              value={studentCreateAllowed ? "Allowed" : "Locked"}
              status={studentCreateAllowed ? "success" : "warning"}
            />
            <StatusLine
              label="Teacher group editing"
              value={teacherEditAllowed ? "Allowed" : "Locked"}
              status={teacherEditAllowed ? "success" : "warning"}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recommended setup order
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <StepPill number="1" text="Create or review groups" />
              <StepPill number="2" text="Configure project form" />
              <StepPill number="3" text="Set phases and deadlines" />
              <StepPill number="4" text="Evaluate and sync marks" />
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Module Guide
          </div>
          <h4 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            What each section does
          </h4>

          <div className="mt-4 space-y-3">
            <GuideRow title="Groups" text="Create and organize project groups." />
            <GuideRow
              title="Form"
              text="Control which project information students can submit."
            />
            <GuideRow
              title="Phases"
              text="Set proposal, progress, or final milestones."
            />
            <GuideRow
              title="Submissions"
              text="Review what students submit for each phase."
            />
            <GuideRow
              title="Marks"
              text="Assign project marks and feedback."
            />
            <GuideRow
              title="Final Sync"
              text="Push project result into the final academic workflow."
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {quickActions.map((item) => (
          <QuickActionCard
            key={item.title}
            title={item.title}
            description={item.description}
            button={item.button}
            icon={item.icon}
            onClick={() => onOpenSection(item.target)}
          />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper, tone = "slate" }) {
  const toneMap = {
    slate:
      "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/40",
    violet:
      "border-violet-200 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10",
    sky:
      "border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10",
    emerald:
      "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    amber:
      "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10",
    rose:
      "border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10",
  };

  return (
    <div
      className={[
        "rounded-[24px] border p-5 transition",
        toneMap[tone] || toneMap.slate,
      ].join(" ")}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
        {helper}
      </p>
    </div>
  );
}

function MetricTile({ label, value, subtle }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{subtle}</div>
    </div>
  );
}

function QuickActionCard({ title, description, button, onClick, icon }) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
        {icon}
      </div>

      <h5 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h5>

      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>

      <button
        type="button"
        onClick={onClick}
        className="mt-5 inline-flex items-center justify-center rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        {button}
      </button>
    </div>
  );
}

function GuideRow({ title, text }) {
  return (
    <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </div>
      <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {text}
      </div>
    </div>
  );
}

function StepPill({ number, text }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 text-xs font-bold text-white">
        {number}
      </div>
      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {text}
      </div>
    </div>
  );
}

function StatusLine({ label, value, status = "info" }) {
  const statusMap = {
    info:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    warning:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    danger:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {value}
        </div>
        <span
          className={[
            "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
            statusMap[status] || statusMap.info,
          ].join(" ")}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

function DisabledMiniCard({ title, text }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {text}
      </p>
    </div>
  );
}

function FolderIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M3 7.5a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.4.57l1.05 1.03a2 2 0 0 0 1.4.57H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M16 19a4 4 0 0 0-8 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="3" />
      <path
        d="M19 19a3 3 0 0 0-2.2-2.88M5 19a3 3 0 0 1 2.2-2.88M17 8.5a2.5 2.5 0 1 1 0 5M7 8.5a2.5 2.5 0 1 0 0 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FormIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M7 5h10M7 10h10M7 15h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WorkflowIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M7 6h4v4H7zM13 14h4v4h-4zM13 6h4v4h-4zM7 14h4v4H7z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 8h2M12 10v4M11 16h2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}