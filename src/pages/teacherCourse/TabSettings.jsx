// client/src/pages/teacherCourse/TabSettings.jsx

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { updateCourseRequest, fetchCourseById } from "../../services/courseService";
import {
  BUBT_SHIFTS,
  getEquivalentProgramForShift,
  getProgramsForShift,
} from "../../constants/bubtAcademicPrograms";

const SEMESTERS = ["Spring", "Summer", "Fall"];

export default function TabSettings({
  courseId,
  course,
  onCourseUpdated,
  onOpenProjects,
}) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    section: "",
    intake: "",
    shift: "Day",
    department: "",
    semester: "Spring",
    year: "",
    courseType: "theory",
    projectFeature: {
      mode: "lab_final",
      totalProjectMarks: 40,
      allowStudentGroupCreation: true,
      allowTeacherGroupEditing: true,
      visibleToStudents: true,
    },
  });

  const [localCourse, setLocalCourse] = useState(course);

  useEffect(() => {
    setLocalCourse(course);
    setForm({
      title: course?.title || "",
      section: course?.section || "",
      intake: course?.intake || "",
      shift: course?.shift || "Day",
      department: course?.department || course?.program || "",
      semester: course?.semester || "Spring",
      year: course?.year || new Date().getFullYear(),
      courseType: (course?.courseType || "theory").toLowerCase(),
      projectFeature: {
        mode: course?.projectFeature?.mode || "lab_final",
        totalProjectMarks: Number(course?.projectFeature?.totalProjectMarks || 40),
        allowStudentGroupCreation: course?.projectFeature?.allowStudentGroupCreation !== false,
        allowTeacherGroupEditing: course?.projectFeature?.allowTeacherGroupEditing !== false,
        visibleToStudents: course?.projectFeature?.visibleToStudents !== false,
      },
    });
  }, [course]);

  const hasChanges = useMemo(() => {
    if (!localCourse) return false;

    return (
      (form.title || "").trim() !== (localCourse.title || "").trim() ||
      (form.section || "").trim() !== (localCourse.section || "").trim() ||
      (form.intake || "").trim() !== (localCourse.intake || "").trim() ||
      String(form.shift || "Day") !== String(localCourse.shift || "Day") ||
      String(form.department || "") !==
      String(localCourse.department || localCourse.program || "") ||
      String(form.semester || "") !== String(localCourse.semester || "") ||
      String(form.year || "") !== String(localCourse.year || "") ||
      String(form.courseType || "").toLowerCase() !==
      String(localCourse.courseType || "theory").toLowerCase() ||
      String(form.projectFeature?.mode || "lab_final") !==
      String(localCourse.projectFeature?.mode || "lab_final") ||
      Number(form.projectFeature?.totalProjectMarks || 40) !==
      Number(localCourse.projectFeature?.totalProjectMarks || 40) ||
      Boolean(form.projectFeature?.allowStudentGroupCreation) !==
      (localCourse.projectFeature?.allowStudentGroupCreation !== false) ||
      Boolean(form.projectFeature?.allowTeacherGroupEditing) !==
      (localCourse.projectFeature?.allowTeacherGroupEditing !== false) ||
      Boolean(form.projectFeature?.visibleToStudents) !==
      (localCourse.projectFeature?.visibleToStudents !== false)
    );
  }, [form, localCourse]);

  const availablePrograms = useMemo(
    () => getProgramsForShift(form.shift),
    [form.shift]
  );

  const handleChange = (key, value) => {
    setForm((prev) => {
      if (key === "shift") {
        const equivalentDepartment = getEquivalentProgramForShift(
          prev.department,
          value
        );

        return {
          ...prev,
          shift: value,
          department: equivalentDepartment || "",
        };
      }

      return { ...prev, [key]: value };
    });
  };

  const handleProjectFeatureChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      projectFeature: {
        ...prev.projectFeature,
        [key]: value,
      },
    }));
  };

  const handleCancel = () => {
    setEditMode(false);
    if (!localCourse) return;

    setForm({
      title: localCourse.title || "",
      section: localCourse.section || "",
      intake: localCourse.intake || "",
      shift: localCourse.shift || "Day",
      department: localCourse.department || localCourse.program || "",
      semester: localCourse.semester || "Spring",
      year: localCourse.year || new Date().getFullYear(),
      courseType: (localCourse.courseType || "theory").toLowerCase(),
      projectFeature: {
        mode: localCourse?.projectFeature?.mode || "lab_final",
        totalProjectMarks: Number(localCourse?.projectFeature?.totalProjectMarks || 40),
        allowStudentGroupCreation: localCourse?.projectFeature?.allowStudentGroupCreation !== false,
        allowTeacherGroupEditing: localCourse?.projectFeature?.allowTeacherGroupEditing !== false,
        visibleToStudents: localCourse?.projectFeature?.visibleToStudents !== false,
      },
    });
  };

  const handleSave = async () => {
    const title = (form.title || "").trim();

    if (!title) {
      Swal.fire({
        icon: "warning",
        title: "Title is required",
        confirmButtonColor: "#4f46e5",
      });
      return;
    }

    if (!form.department) {
      Swal.fire({
        icon: "warning",
        title: "Department is required",
        text: "Select a department/program for the chosen shift.",
        confirmButtonColor: "#4f46e5",
      });
      return;
    }

    const confirm = await Swal.fire({
      icon: "question",
      title: "Save changes?",
      text: "This will update course information.",
      showCancelButton: true,
      confirmButtonText: "Save",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#4f46e5",
    });

    if (!confirm.isConfirmed) return;

    try {
      setSaving(true);

      const payload = {
        title,
        section: (form.section || "").trim(),
        intake: (form.intake || "").trim(),
        shift: form.shift,
        department: form.department,
        semester: form.semester,
        year: Number(form.year),
        courseType: (form.courseType || "theory").toLowerCase(),
        projectFeature: {
          mode: form.projectFeature?.mode === "project" ? "project" : "lab_final",
          totalProjectMarks: Number(form.projectFeature?.totalProjectMarks || 40),
          allowStudentGroupCreation: form.projectFeature?.allowStudentGroupCreation !== false,
          allowTeacherGroupEditing: form.projectFeature?.allowTeacherGroupEditing !== false,
          visibleToStudents: form.projectFeature?.visibleToStudents !== false,
        },
      };

      const updated = await updateCourseRequest(courseId, payload);

      setLocalCourse(updated);
      setEditMode(false);

      if (typeof onCourseUpdated === "function") {
        onCourseUpdated(updated);
      }

      if (
        updated?.projectFeature?.mode === "project" &&
        typeof onOpenProjects === "function"
      ) {
        onOpenProjects();
      } else {
        try {
          const fresh = await fetchCourseById(courseId);
          setLocalCourse(fresh);
        } catch {
          // ignore fallback fetch error
        }
      }

      Swal.fire({
        icon: "success",
        title: "Updated",
        text: "Course information updated successfully.",
        confirmButtonColor: "#4f46e5",
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Update Failed",
        text: err?.response?.data?.message || "Failed to update course.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!localCourse) return null;

  const currentType = (localCourse.courseType || "theory").toLowerCase();
  const courseTypeLabel =
    currentType === "lab" ? "Lab" : currentType === "hybrid" ? "Hybrid" : "Theory";

  const typeBadgeClass =
    currentType === "lab"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : currentType === "hybrid"
        ? "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300"
        : "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300";

  const supportsProjectWorkflow = ["lab", "hybrid"].includes(
    (form.courseType || "theory").toLowerCase()
  );

  const inputClass =
    "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  const selectClass = `${inputClass} font-medium`;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-4 py-4 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/35 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-500/20">
                <SettingsIcon />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-lg font-bold tracking-tight text-slate-950 dark:text-white">
                    Course Settings
                  </h3>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${typeBadgeClass}`}>
                    {courseTypeLabel}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                  {localCourse.code || "Course"} · {localCourse.title || "Untitled course"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!editMode ? (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  <EditIcon />
                  Edit Course
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <XIcon />
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving || !hasChanges}
                    onClick={handleSave}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <SpinnerIcon /> : <SaveIcon />}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[0.9fr_1.1fr]">
          <SettingsSection
            icon={<IdentityIcon />}
            title="Course Identity"
            description="Core information students and reports use to identify this course."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Course Code" locked>
                <DisplayValue value={localCourse.code || "—"} strong />
                <p className="mt-1 text-[11px] text-slate-400">Locked after course creation.</p>
              </Field>

              <Field label="Course Type">
                {!editMode ? (
                  <DisplayValue value={courseTypeLabel} />
                ) : (
                  <select
                    value={form.courseType}
                    onChange={(e) => handleChange("courseType", e.target.value)}
                    className={selectClass}
                  >
                    <option value="theory">Theory</option>
                    <option value="lab">Lab</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                )}
              </Field>

              <div className="sm:col-span-2">
                <Field label="Course Title">
                  {!editMode ? (
                    <DisplayValue value={localCourse.title || "—"} strong />
                  ) : (
                    <input
                      value={form.title}
                      onChange={(e) => handleChange("title", e.target.value)}
                      className={inputClass}
                      placeholder="Course title"
                    />
                  )}
                </Field>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<AcademicIcon />}
            title="Academic Placement"
            description="Shift, programme, intake and semester information used throughout the portal."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Shift">
                {!editMode ? (
                  <DisplayValue value={localCourse.shift || "Day"} />
                ) : (
                  <select
                    value={form.shift}
                    onChange={(e) => handleChange("shift", e.target.value)}
                    className={selectClass}
                  >
                    {BUBT_SHIFTS.map((shift) => (
                      <option key={shift} value={shift}>{shift}</option>
                    ))}
                  </select>
                )}
              </Field>

              <div className="sm:col-span-1 lg:col-span-2">
                <Field label="Department / Programme">
                  {!editMode ? (
                    <DisplayValue value={localCourse.department || localCourse.program || "Not set"} />
                  ) : (
                    <select
                      value={form.department}
                      onChange={(e) => handleChange("department", e.target.value)}
                      className={selectClass}
                      required
                    >
                      <option value="">Select department/programme</option>
                      {availablePrograms.map((program) => (
                        <option key={program.key} value={program.label}>{program.label}</option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>

              <Field label="Intake">
                {!editMode ? (
                  <DisplayValue value={localCourse.intake || "—"} />
                ) : (
                  <input
                    value={form.intake}
                    onChange={(e) => handleChange("intake", e.target.value)}
                    className={inputClass}
                    placeholder="e.g. 48"
                  />
                )}
              </Field>

              <Field label="Section">
                {!editMode ? (
                  <DisplayValue value={localCourse.section || "—"} />
                ) : (
                  <input
                    value={form.section}
                    onChange={(e) => handleChange("section", e.target.value)}
                    className={inputClass}
                    placeholder="e.g. 2"
                  />
                )}
              </Field>

              <Field label="Semester">
                {!editMode ? (
                  <DisplayValue value={localCourse.semester || "—"} />
                ) : (
                  <select
                    value={form.semester}
                    onChange={(e) => handleChange("semester", e.target.value)}
                    className={selectClass}
                  >
                    {SEMESTERS.map((semester) => (
                      <option key={semester} value={semester}>{semester}</option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Year">
                {!editMode ? (
                  <DisplayValue value={localCourse.year || "—"} />
                ) : (
                  <input
                    type="number"
                    value={form.year}
                    onChange={(e) => handleChange("year", e.target.value)}
                    className={inputClass}
                    min={2000}
                    max={2100}
                  />
                )}
              </Field>
            </div>
          </SettingsSection>
        </div>

        {editMode && !hasChanges && (
          <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 sm:mx-5 sm:mb-5">
            Change any field to enable <span className="font-semibold">Save Changes</span>.
          </div>
        )}
      </section>

      {supportsProjectWorkflow && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
              <WorkflowIcon />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white">Project Workflow</h3>
              <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Configure the project-based flow used by lab and hybrid courses.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Workflow Mode">
              {!editMode ? (
                <DisplayValue value={form.projectFeature?.mode === "project" ? "Project Based" : "Lab Final Based"} />
              ) : (
                <select
                  value={form.projectFeature?.mode || "lab_final"}
                  onChange={(e) => handleProjectFeatureChange("mode", e.target.value)}
                  className={selectClass}
                >
                  <option value="lab_final">Lab Final Based</option>
                  <option value="project">Project Based</option>
                </select>
              )}
            </Field>

            <Field label="Total Project Marks">
              {!editMode ? (
                <DisplayValue value={Number(form.projectFeature?.totalProjectMarks || 40)} />
              ) : (
                <input
                  type="number"
                  min={0}
                  value={form.projectFeature?.totalProjectMarks || 40}
                  onChange={(e) => handleProjectFeatureChange("totalProjectMarks", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>

            <Field label="Student Visibility">
              {!editMode ? (
                <StatusValue enabled={form.projectFeature?.visibleToStudents !== false} enabledLabel="Visible" disabledLabel="Hidden" />
              ) : (
                <ToggleRow
                  checked={form.projectFeature?.visibleToStudents !== false}
                  onChange={(value) => handleProjectFeatureChange("visibleToStudents", value)}
                  label="Visible to students"
                />
              )}
            </Field>

            <Field label="Student Group Creation">
              {!editMode ? (
                <StatusValue enabled={form.projectFeature?.allowStudentGroupCreation !== false} />
              ) : (
                <ToggleRow
                  checked={form.projectFeature?.allowStudentGroupCreation !== false}
                  onChange={(value) => handleProjectFeatureChange("allowStudentGroupCreation", value)}
                  label="Students can create groups"
                />
              )}
            </Field>

            <Field label="Teacher Group Editing">
              {!editMode ? (
                <StatusValue enabled={form.projectFeature?.allowTeacherGroupEditing !== false} />
              ) : (
                <ToggleRow
                  checked={form.projectFeature?.allowTeacherGroupEditing !== false}
                  onChange={(value) => handleProjectFeatureChange("allowTeacherGroupEditing", value)}
                  label="Teacher can edit groups"
                />
              )}
            </Field>
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsSection({ icon, title, description, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4 dark:border-slate-800 dark:bg-slate-950/35">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h4>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, locked = false }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${locked
      ? "border-slate-200 bg-slate-100/70 dark:border-slate-700 dark:bg-slate-800/60"
      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    }`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function DisplayValue({ value, strong = false }) {
  return (
    <div className={`${strong ? "font-bold text-slate-950 dark:text-white" : "font-semibold text-slate-800 dark:text-slate-200"} break-words text-sm`}>
      {value}
    </div>
  );
}

function StatusValue({ enabled, enabledLabel = "Enabled", disabledLabel = "Disabled" }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${enabled
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "bg-slate-500/10 text-slate-600 dark:text-slate-300"
    }`}>
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}

function ToggleRow({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-left dark:bg-slate-800/70"
    >
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition ${checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"}`}>
        <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </span>
    </button>
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

function IdentityIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16v12H4z" />
      <path d="M8 10h5M8 14h8" />
    </svg>
  );
}

function AcademicIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m3 10 9-5 9 5-9 5-9-5Z" />
      <path d="M7 12.5V17c3 2 7 2 10 0v-4.5" />
    </svg>
  );
}

function WorkflowIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M8 6h8M7 8l4 8M17 8l-4 8" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
    </svg>
  );
}
