// client/src/pages/teacherCourse/TabSettings.jsx

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { updateCourseRequest, fetchCourseById } from "../../services/courseService";

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

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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

  const typeBadgeClass =
    (localCourse.courseType || "theory").toLowerCase() === "lab"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : (localCourse.courseType || "theory").toLowerCase() === "hybrid"
        ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300"
        : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";

  const courseTypeLabel =
    (localCourse.courseType || "theory").toLowerCase() === "lab"
      ? "Lab"
      : (localCourse.courseType || "theory").toLowerCase() === "hybrid"
        ? "Hybrid"
        : "Theory";


  const supportsProjectWorkflow =
    ["lab", "hybrid"].includes((form.courseType || "theory").toLowerCase());

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-6 py-5 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <SettingsIcon />
                Course Settings
              </div>

              <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                View and update course information
              </h3>

              <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                Edit essential course details such as title, section, semester, year,
                and course type.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <InfoPill label="Code" value={localCourse.code || "—"} />
                <InfoPill label="Semester" value={localCourse.semester || "—"} />
                <InfoPill label="Year" value={localCourse.year || "—"} />
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${typeBadgeClass}`}
                >
                  {courseTypeLabel}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {!editMode ? (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  <EditIcon />
                  Edit
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <XIcon />
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={saving || !hasChanges}
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <SpinnerIcon />
                        Saving...
                      </>
                    ) : (
                      <>
                        <SaveIcon />
                        Save Changes
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Course Code" locked>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {localCourse.code}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Course code is locked and cannot be edited.
              </div>
            </Field>

            <Field label="Course Type">
              {!editMode ? (
                <DisplayValue value={(localCourse.courseType || "theory").toUpperCase()} />
              ) : (
                <select
                  value={form.courseType}
                  onChange={(e) => handleChange("courseType", e.target.value)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="theory">Theory</option>
                  <option value="lab">Lab</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              )}
            </Field>

            <Field label="Title">
              {!editMode ? (
                <DisplayValue value={localCourse.title || "—"} />
              ) : (
                <input
                  value={form.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Course title"
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
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="e.g. 54/5"
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
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {SEMESTERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
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
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  min={2000}
                  max={2100}
                />
              )}
            </Field>
          </div>

          {editMode && !hasChanges && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
              Make a change to enable <span className="font-semibold">Save Changes</span>.
            </div>
          )}
        </div>
      </div>

      {supportsProjectWorkflow && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Project Workflow
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose whether this lab or hybrid course will use the regular lab final flow or the new project-based workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <Field label="Workflow Mode">
              {!editMode ? (
                <DisplayValue
                  value={
                    form.projectFeature?.mode === "project"
                      ? "Project Based"
                      : "Lab Final Based"
                  }
                />
              ) : (
                <select
                  value={form.projectFeature?.mode || "lab_final"}
                  onChange={(e) =>
                    handleProjectFeatureChange("mode", e.target.value)
                  }
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                  onChange={(e) =>
                    handleProjectFeatureChange("totalProjectMarks", e.target.value)
                  }
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              )}
            </Field>

            <Field label="Student Group Creation">
              {!editMode ? (
                <DisplayValue
                  value={
                    form.projectFeature?.allowStudentGroupCreation ? "Enabled" : "Disabled"
                  }
                />
              ) : (
                <ToggleRow
                  checked={form.projectFeature?.allowStudentGroupCreation !== false}
                  onChange={(value) =>
                    handleProjectFeatureChange("allowStudentGroupCreation", value)
                  }
                  label="Let students create their own groups"
                />
              )}
            </Field>

            <Field label="Teacher Group Editing">
              {!editMode ? (
                <DisplayValue
                  value={
                    form.projectFeature?.allowTeacherGroupEditing ? "Enabled" : "Disabled"
                  }
                />
              ) : (
                <ToggleRow
                  checked={form.projectFeature?.allowTeacherGroupEditing !== false}
                  onChange={(value) =>
                    handleProjectFeatureChange("allowTeacherGroupEditing", value)
                  }
                  label="Teacher can edit or fix groups later"
                />
              )}
            </Field>

            <Field label="Student Visibility">
              {!editMode ? (
                <DisplayValue
                  value={form.projectFeature?.visibleToStudents ? "Visible" : "Hidden"}
                />
              ) : (
                <ToggleRow
                  checked={form.projectFeature?.visibleToStudents !== false}
                  onChange={(value) =>
                    handleProjectFeatureChange("visibleToStudents", value)
                  }
                  label="Show project workflow on student side"
                />
              )}
            </Field>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-dashed border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <FutureIcon />
            </div>

            <div>
              <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Future Settings
              </h4>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Later you can add controls like locking marks, closing attendance,
                enabling exports, publishing rules, or archive options here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, locked = false }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${locked
        ? "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/50"
        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DisplayValue({ value }) {
  return <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{value}</div>;
}

function InfoPill({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function ToggleRow({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-7 w-12 items-center rounded-full transition",
          checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-white transition",
            checked ? "translate-x-6" : "translate-x-1",
          ].join(" ")}
        />
      </button>
    </label>
  );
}

function SettingsIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.9 7.9 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L15 3H9l-.4 2.5a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L9 21h6l.4-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function FutureIcon() {
  return (
    <svg
      className="h-5 w-5 text-slate-600 dark:text-slate-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
      />
    </svg>
  );
}