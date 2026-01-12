// client/src/pages/teacherCourse/TabSettings.jsx

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { updateCourseRequest, fetchCourseById } from "../../services/courseService";

const SEMESTERS = ["Spring", "Summer", "Fall"];

export default function TabSettings({ courseId, course, onCourseUpdated }) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    section: "",
    semester: "Spring",
    year: "",
    courseType: "theory", // theory | lab | hybrid
  });

  // keep local copy for showing latest after save (even if parent doesn't refresh)
  const [localCourse, setLocalCourse] = useState(course);

  useEffect(() => {
    setLocalCourse(course);
    setForm({
      title: course?.title || "",
      section: course?.section || "",
      semester: course?.semester || "Spring",
      year: course?.year || new Date().getFullYear(),
      courseType: (course?.courseType || "theory").toLowerCase(),
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
        String(localCourse.courseType || "theory").toLowerCase()
    );
  }, [form, localCourse]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
    });
  };

  const handleSave = async () => {
    const title = (form.title || "").trim();
    if (!title) {
      Swal.fire({ icon: "warning", title: "Title is required" });
      return;
    }

    const confirm = await Swal.fire({
      icon: "question",
      title: "Save changes?",
      text: "This will update course info for this course.",
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
      };

      const updated = await updateCourseRequest(courseId, payload);

      // Option 1: update local (this tab)
      setLocalCourse(updated);
      setEditMode(false);

      // Option 2 (recommended): update parent course state so header updates too
      if (typeof onCourseUpdated === "function") {
        onCourseUpdated(updated);
      } else {
        // fallback: refetch (so layout/header updates if parent uses same object reference)
        // if parent doesn't re-render, at least this tab stays updated.
        try {
          const fresh = await fetchCourseById(courseId);
          setLocalCourse(fresh);
        } catch {}
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

  return (
    <div className="space-y-6">
      {/* Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Course Settings</h3>
            <p className="text-sm text-slate-500 mt-1">
              View and update course information.
            </p>
          </div>

          <div className="flex gap-2">
            {!editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={saving || !hasChanges}
                  onClick={handleSave}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Course Code">
            <div className="text-sm font-semibold text-slate-900">
              {localCourse.code}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Course code is locked (cannot be edited).
            </div>
          </Field>

          <Field label="Course Type">
            {!editMode ? (
              <div className="text-sm font-medium text-slate-800">
                {(localCourse.courseType || "theory").toUpperCase()}
              </div>
            ) : (
              <select
                value={form.courseType}
                onChange={(e) => handleChange("courseType", e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="theory">Theory</option>
                <option value="lab">Lab</option>
                <option value="hybrid">Hybrid</option>
              </select>
            )}
          </Field>

          <Field label="Title">
            {!editMode ? (
              <div className="text-sm font-medium text-slate-800">
                {localCourse.title}
              </div>
            ) : (
              <input
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="Course title"
              />
            )}
          </Field>

          <Field label="Section">
            {!editMode ? (
              <div className="text-sm font-medium text-slate-800">
                {localCourse.section || "—"}
              </div>
            ) : (
              <input
                value={form.section}
                onChange={(e) => handleChange("section", e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="e.g., 54/5"
              />
            )}
          </Field>

          <Field label="Semester">
            {!editMode ? (
              <div className="text-sm font-medium text-slate-800">
                {localCourse.semester || "—"}
              </div>
            ) : (
              <select
                value={form.semester}
                onChange={(e) => handleChange("semester", e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
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
              <div className="text-sm font-medium text-slate-800">
                {localCourse.year || "—"}
              </div>
            ) : (
              <input
                type="number"
                value={form.year}
                onChange={(e) => handleChange("year", e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                min={2000}
                max={2100}
              />
            )}
          </Field>
        </div>

        {editMode && !hasChanges && (
          <div className="mt-4 text-xs text-slate-500">
            Make a change to enable <span className="font-semibold">Save</span>.
          </div>
        )}
      </div>

      {/* Optional future box */}
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-5 text-sm text-slate-500">
        <h4 className="font-semibold text-slate-700 mb-1">
          Future Settings (optional)
        </h4>
        <p>
          Later you can add options like locking marks, exporting PDFs, closing attendance, etc.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
