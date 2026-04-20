import { useEffect, useMemo, useState } from "react";
import {
  createProjectPhase,
  deleteProjectPhase,
  fetchTeacherProjectPhases,
  updateProjectPhase,
} from "../../services/projectPhaseService";

const EMPTY_FORM = {
  title: "",
  instructions: "",
  phaseType: "group",
  dueDate: "",
  totalMarks: "",
  order: "",
  isVisibleToStudents: true,
};

export default function TeacherProjectPhases({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phases, setPhases] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadPhases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const totalConfiguredMarks = useMemo(() => {
    return phases.reduce((sum, item) => sum + Number(item.totalMarks || 0), 0);
  }, [phases]);

  const projectTotalMarks = Number(course?.projectFeature?.totalProjectMarks || 0);

  const loadPhases = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchTeacherProjectPhases(courseId);
      setPhases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project phases.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const validateForm = () => {
    if (!String(form.title || "").trim()) {
      setError("Phase title is required.");
      return false;
    }

    if (String(form.totalMarks || "").trim() === "") {
      setError("Total marks is required.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!validateForm()) return;

      const payload = {
        title: form.title,
        instructions: form.instructions,
        phaseType: form.phaseType,
        dueDate: form.dueDate || null,
        totalMarks: Number(form.totalMarks || 0),
        order: Number(form.order || 0),
        isVisibleToStudents: Boolean(form.isVisibleToStudents),
      };

      if (editingId) {
        await updateProjectPhase(courseId, editingId, payload);
        setSuccess("Project phase updated successfully.");
      } else {
        await createProjectPhase(courseId, payload);
        setSuccess("Project phase created successfully.");
      }

      resetForm();
      await loadPhases();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to save project phase.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (phase) => {
    setEditingId(phase.id);
    setForm({
      title: phase.title || "",
      instructions: phase.instructions || "",
      phaseType: phase.phaseType || "group",
      dueDate: phase.dueDate ? toInputDateTime(phase.dueDate) : "",
      totalMarks: String(phase.totalMarks ?? ""),
      order: String(phase.order ?? 0),
      isVisibleToStudents: phase.isVisibleToStudents !== false,
    });
    setError("");
    setSuccess("");
  };

  const handleDelete = async (phaseId) => {
    const ok = window.confirm("Are you sure you want to delete this project phase?");
    if (!ok) return;

    try {
      setError("");
      setSuccess("");

      await deleteProjectPhase(courseId, phaseId);
      setSuccess("Project phase deleted successfully.");

      if (editingId === phaseId) {
        resetForm();
      }

      await loadPhases();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to delete project phase.");
    }
  };

  return (
    <div className="space-y-6">
      {error ? <AlertBox tone="error" message={error} /> : null}
      {success ? <AlertBox tone="success" message={success} /> : null}

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Create Project Phase
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Create project tasks like proposal, progress review, report, or presentation.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Configured Marks: {totalConfiguredMarks}
              </div>
              <div className="mt-1 text-slate-500 dark:text-slate-400">
                Course Project Marks: {projectTotalMarks}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <FieldBlock label="Phase Title" required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Example: Proposal Submission"
              />
            </FieldBlock>

            <FieldBlock label="Phase Type" required>
              <select
                value={form.phaseType}
                onChange={(e) => setForm((prev) => ({ ...prev, phaseType: e.target.value }))}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="group">Group</option>
                <option value="individual">Individual</option>
              </select>
            </FieldBlock>

            <FieldBlock label="Due Date">
              <input
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </FieldBlock>

            <FieldBlock label="Total Marks" required>
              <input
                type="number"
                min="0"
                value={form.totalMarks}
                onChange={(e) => setForm((prev) => ({ ...prev, totalMarks: e.target.value }))}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="10"
              />
            </FieldBlock>

            <FieldBlock label="Display Order">
              <input
                type="number"
                min="0"
                value={form.order}
                onChange={(e) => setForm((prev) => ({ ...prev, order: e.target.value }))}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="1"
              />
            </FieldBlock>

            <FieldBlock label="Student Visibility">
              <label className="flex h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.isVisibleToStudents}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      isVisibleToStudents: e.target.checked,
                    }))
                  }
                />
                Visible to students
              </label>
            </FieldBlock>

            <FieldBlock label="Instructions" full>
              <textarea
                rows={5}
                value={form.instructions}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, instructions: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Write clear instructions for students..."
              />
            </FieldBlock>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingId
                ? "Update Phase"
                : "Create Phase"}
            </button>

            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Existing Phases
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Created phases will appear here in order.
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="h-36 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-36 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : phases.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              No project phases created yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {phases.map((phase) => (
                <div
                  key={phase.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {phase.title}
                        </h4>

                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {phase.phaseType === "individual" ? "Individual" : "Group"}
                        </span>

                        {!phase.isVisibleToStudents ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                            Hidden
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Marks: <span className="font-semibold">{phase.totalMarks}</span>
                        {" • "}
                        Order: <span className="font-semibold">{phase.order}</span>
                      </div>

                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Due: {phase.dueDate ? formatDateTime(phase.dueDate) : "No due date"}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(phase)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(phase.id)}
                        className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {phase.instructions ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {phase.instructions}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FieldBlock({ label, required, children, full = false }) {
  return (
    <div className={full ? "lg:col-span-2" : ""}>
      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </div>
      {children}
    </div>
  );
}

function AlertBox({ tone = "error", message }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>{message}</div>;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString();
}

function toInputDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");

  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}