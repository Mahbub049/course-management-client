import { useEffect, useMemo, useState } from "react";
import {
  createProjectPhase,
  deleteProjectPhase,
  fetchTeacherProjectPhases,
  moveProjectPhase,
  updateProjectPhase,
} from "../../services/projectPhaseService";

const EMPTY_FORM = {
  title: "",
  instructions: "",
  phaseType: "group",
  dueDateOnly: "",
  dueTimeOnly: "",
  totalMarks: "",
  isVisibleToStudents: true,
  resourceLinks: [{ label: "", url: "" }],
};

export default function TeacherProjectPhases({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState("");
  const [phases, setPhases] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadPhases();
  }, [courseId]);

  const totalConfiguredMarks = useMemo(() => {
    return phases.reduce((sum, item) => sum + Number(item.totalMarks || 0), 0);
  }, [phases]);

  const projectTotalMarks = Number(course?.projectFeature?.totalProjectMarks || 0);
  const remainingMarks = Math.max(0, projectTotalMarks - totalConfiguredMarks);

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

    const nextMarks = Number(form.totalMarks || 0);
    const currentlyEditingMarks =
      editingId
        ? Number(phases.find((item) => item.id === editingId)?.totalMarks || 0)
        : 0;

    const projectedTotal = totalConfiguredMarks - currentlyEditingMarks + nextMarks;
    if (projectedTotal > projectTotalMarks) {
      setError(`Total phase marks cannot exceed ${projectTotalMarks}.`);
      return false;
    }

    return true;
  };

  const buildDueDate = () => {
    if (!form.dueDateOnly) return null;
    const timePart = form.dueTimeOnly || "23:59";
    return `${form.dueDateOnly}T${timePart}`;
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
        dueDate: buildDueDate(),
        totalMarks: Number(form.totalMarks || 0),
        isVisibleToStudents: Boolean(form.isVisibleToStudents),
        resourceLinks: form.resourceLinks.filter((item) => String(item.url || "").trim()),
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
    const due = phase.dueDate ? new Date(phase.dueDate) : null;

    setEditingId(phase.id);
    setForm({
      title: phase.title || "",
      instructions: phase.instructions || "",
      phaseType: phase.phaseType || "group",
      dueDateOnly: due ? toInputDate(due) : "",
      dueTimeOnly: due ? toInputTime(due) : "",
      totalMarks: String(phase.totalMarks ?? ""),
      isVisibleToStudents: phase.isVisibleToStudents !== false,
      resourceLinks:
        Array.isArray(phase.resourceLinks) && phase.resourceLinks.length > 0
          ? phase.resourceLinks
          : [{ label: "", url: "" }],
    });

    setError("");
    setSuccess("");
  };

  const handleMove = async (phaseId, direction) => {
    try {
      setMovingId(phaseId);
      setError("");
      setSuccess("");

      const data = await moveProjectPhase(courseId, phaseId, direction);
      setPhases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to reorder phase.");
    } finally {
      setMovingId("");
    }
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

  const updateResourceLink = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      resourceLinks: prev.resourceLinks.map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const addResourceLink = () => {
    setForm((prev) => ({
      ...prev,
      resourceLinks: [...prev.resourceLinks, { label: "", url: "" }],
    }));
  };

  const removeResourceLink = (index) => {
    setForm((prev) => ({
      ...prev,
      resourceLinks:
        prev.resourceLinks.length === 1
          ? [{ label: "", url: "" }]
          : prev.resourceLinks.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-6">
      {error ? <AlertBox tone="error" message={error} /> : null}
      {success ? <AlertBox tone="success" message={success} /> : null}

      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Project Phase Manager
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Create project milestones, attach reference links, and control what students see.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatPill label="Course Project Marks" value={projectTotalMarks} />
              <StatPill label="Configured" value={totalConfiguredMarks} />
              <StatPill label="Remaining" value={remainingMarks} highlight />
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
                className={inputClass}
                placeholder="Example: Proposal Submission"
              />
            </FieldBlock>

            <FieldBlock label="Phase Type" required>
              <select
                value={form.phaseType}
                onChange={(e) => setForm((prev) => ({ ...prev, phaseType: e.target.value }))}
                className={inputClass}
              >
                <option value="group">Group</option>
                <option value="individual">Individual</option>
              </select>
            </FieldBlock>

<FieldBlock label="Due Date">
  <div className="relative">
    <input
      type="date"
      value={form.dueDateOnly}
      onChange={(e) =>
        setForm((prev) => ({
          ...prev,
          dueDateOnly: e.target.value,
        }))
      }
      onClick={(e) => e.currentTarget.showPicker?.()}
      onFocus={(e) => e.currentTarget.showPicker?.()}
      className="h-12 w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 pr-12 text-sm text-white outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]"
    />

    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-300">
      📅
    </div>
  </div>
</FieldBlock>

<FieldBlock label="Due Time">
  <div className="relative">
    <input
      type="time"
      value={form.dueTimeOnly}
      onChange={(e) =>
        setForm((prev) => ({
          ...prev,
          dueTimeOnly: e.target.value,
        }))
      }
      onClick={(e) => e.currentTarget.showPicker?.()}
      onFocus={(e) => e.currentTarget.showPicker?.()}
      className="h-12 w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 pr-12 text-sm text-white outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 [color-scheme:dark]"
    />

    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-300">
      🕒
    </div>
  </div>
</FieldBlock>

            <FieldBlock label="Total Marks" required>
              <input
                type="number"
                min="0"
                value={form.totalMarks}
                onChange={(e) => setForm((prev) => ({ ...prev, totalMarks: e.target.value }))}
                className={inputClass}
                placeholder="10"
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
                onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
                className={textareaClass}
                placeholder="Write clear instructions for students..."
              />
            </FieldBlock>

            <FieldBlock label="Reference Links / Documents" full>
              <div className="space-y-3">
                {form.resourceLinks.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50 lg:grid-cols-[220px_1fr_auto]"
                  >
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => updateResourceLink(index, "label", e.target.value)}
                      className={inputClass}
                      placeholder="Label e.g. Requirement Doc"
                    />

                    <input
                      type="url"
                      value={item.url}
                      onChange={(e) => updateResourceLink(index, "url", e.target.value)}
                      className={inputClass}
                      placeholder="https://drive.google.com/..."
                    />

                    <button
                      type="button"
                      onClick={() => removeResourceLink(index)}
                      className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addResourceLink}
                  className="rounded-2xl border border-dashed border-violet-300 px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
                >
                  + Add More Links
                </button>
              </div>
            </FieldBlock>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : editingId ? "Update Phase" : "Create Phase"}
            </button>

            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Existing Phases
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Phases are automatically ordered. Use move buttons to adjust the sequence.
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : phases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              No project phases created yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {phases.map((phase, index) => (
                <div
                  key={phase.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-bold text-white">
                          #{index + 1}
                        </span>

                        <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {phase.title}
                        </h4>

                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {phase.phaseType === "individual" ? "Individual" : "Group"}
                        </span>

                        <span
                          className={[
                            "rounded-full px-3 py-1 text-xs font-semibold",
                            phase.isVisibleToStudents
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
                          ].join(" ")}
                        >
                          {phase.isVisibleToStudents ? "Visible" : "Hidden"}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1 text-sm text-slate-500 dark:text-slate-400">
                        <div>Marks: {phase.totalMarks}</div>
                        <div>Due: {phase.dueDate ? formatDateTime(phase.dueDate) : "No due date"}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleMove(phase.id, "up")}
                        disabled={movingId === phase.id || index === 0}
                        className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(phase.id, "down")}
                        disabled={movingId === phase.id || index === phases.length - 1}
                        className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(phase)}
                        className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(phase.id)}
                        className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
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

                  {Array.isArray(phase.resourceLinks) && phase.resourceLinks.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Reference Links
                      </div>
                      {phase.resourceLinks.map((link, idx) => (
                        <a
                          key={`${phase.id}-${idx}`}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-violet-600 hover:underline dark:border-slate-700 dark:bg-slate-900 dark:text-violet-300"
                        >
                          {link.label || "Open link"} — {link.url}
                        </a>
                      ))}
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

const inputClass =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

const textareaClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

function FieldBlock({ label, children, required, full = false }) {
  return (
    <div className={full ? "lg:col-span-2" : ""}>
      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </div>
      {children}
    </div>
  );
}

function AlertBox({ tone = "error", message }) {
  const classes =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}>{message}</div>;
}

function StatPill({ label, value, highlight = false }) {
  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3 text-sm",
        highlight
          ? "border-violet-200 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10"
          : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
      ].join(" ")}
    >
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toInputTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString();
}