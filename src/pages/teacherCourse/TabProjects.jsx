import { useMemo, useState } from "react";
import TeacherProjectGroups from "./TeacherProjectGroups";
import TeacherProjectForm from "./TeacherProjectForm";
import TeacherProjectPhases from "./TeacherProjectPhases";
import TeacherProjectSubmissions from "./TeacherProjectSubmissions";
import TeacherProjectMarks from "./TeacherProjectMarks";
import TeacherProjectFinalSync from "./TeacherProjectFinalSync";

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "groups", label: "Groups" },
  { key: "form", label: "Form" },
  { key: "phases", label: "Phases" },
  { key: "submissions", label: "Submissions" },
  { key: "marks", label: "Marks" },
  {
    key: "finalSync",
    label: "Final Sync",
  }
];

export default function TabProjects({ course }) {
  const [activeSection, setActiveSection] = useState("overview");

  const projectFeature = course?.projectFeature || {};
  const isProjectMode = projectFeature?.mode === "project";

  const summary = useMemo(
    () => [
      {
        label: "Workflow Mode",
        value: isProjectMode ? "Project Based" : "Lab Final Based",
      },
      {
        label: "Project Marks",
        value: `${Number(projectFeature?.totalProjectMarks || 40)} marks`,
      },
      {
        label: "Student Group Creation",
        value:
          projectFeature?.allowStudentGroupCreation === false
            ? "Locked"
            : "Allowed",
      },
      {
        label: "Teacher Group Editing",
        value:
          projectFeature?.allowTeacherGroupEditing === false
            ? "Locked"
            : "Allowed",
      },
    ],
    [isProjectMode, projectFeature]
  );

  if (!isProjectMode) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Project workflow is not enabled
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Go to Settings and switch this course to Project Based mode first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Project Workspace
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage groups, configure the project form, and prepare the next modules from one place.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
          {summary.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/60"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {item.label}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((item) => {
              const active = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSection(item.key)}
                  className={[
                    "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {activeSection === "overview" && <OverviewSection />}
          {activeSection === "groups" && <TeacherProjectGroups course={course} />}
          {activeSection === "form" && <TeacherProjectForm course={course} />}
          {activeSection === "phases" && <TeacherProjectPhases course={course} />}
          {activeSection === "submissions" && <TeacherProjectSubmissions course={course} />}
          {activeSection === "marks" && <TeacherProjectMarks course={course} />}
          {activeSection === "finalSync" && <TeacherProjectFinalSync course={course} />}
        </div>
      </section>
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <InfoCard
        title="Groups"
        text="Students form groups here. One student becomes leader, and already-assigned students must become unavailable for other groups."
      />
      <InfoCard
        title="Project Form"
        text="Teacher can now decide which project information fields are visible or required for students."
      />
      <InfoCard
        title="Phases / Tasks"
        text="Next module will create project phases like proposal, documentation, progress review, and final submission."
      />
      <InfoCard
        title="Submissions & Marks"
        text="Later modules will add link-based submission tracking and phase-wise project marks."
      />
    </div>
  );
}

function PhasesSection() {
  return (
    <PlaceholderPanel
      title="Project Phases / Tasks"
      description="Next implementation: create multiple phases with title, instructions, marks, due date, and submission type (group or individual)."
    />
  );
}

function SubmissionsSection() {
  return (
    <PlaceholderPanel
      title="Submission Tracking"
      description="Next implementation: show phase-wise submissions, submitted by, submission date, external link, and review status."
    />
  );
}

function MarksSection() {
  return (
    <PlaceholderPanel
      title="Phase-wise Marks"
      description="Next implementation: assign marks per phase, add feedback, total everything, and later sync the result into lab final."
    />
  );
}

function InfoCard({ title, text }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h4>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {text}
      </p>
    </div>
  );
}

function PlaceholderPanel({ title, description }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 p-6 dark:border-slate-700 dark:bg-slate-800/40">
      <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h4>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}