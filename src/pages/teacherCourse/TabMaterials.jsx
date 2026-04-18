import { useEffect, useMemo, useState } from "react";
import {
  createCourseMaterialRequest,
  deleteCourseMaterialRequest,
  fetchTeacherCourseMaterials,
  updateCourseMaterialRequest,
} from "../../services/materialService";

const initialForm = {
  title: "",
  topic: "",
  description: "",
  driveLink: "",
  fileType: "google_slide",
  visibleToStudents: true,
  sortOrder: 0,
};

export default function TabMaterials({ courseId }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);

  const loadMaterials = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTeacherCourseMaterials(courseId);
      setMaterials(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load materials.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courseId) loadMaterials();
  }, [courseId]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setSuccess("");
    setError("");
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (editingId) {
        await updateCourseMaterialRequest(editingId, form);
        setSuccess("Material updated successfully.");
      } else {
        await createCourseMaterialRequest(courseId, form);
        setSuccess("Material added successfully.");
      }

      resetForm();
      await loadMaterials();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to save material.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setForm({
      title: item.title || "",
      topic: item.topic || "",
      description: item.description || "",
      driveLink: item.driveLink || "",
      fileType: item.fileType || "google_slide",
      visibleToStudents: item.visibleToStudents !== false,
      sortOrder: Number(item.sortOrder || 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (item) => {
    const ok = window.confirm(`Delete "${item.title}"?`);
    if (!ok) return;

    try {
      await deleteCourseMaterialRequest(item._id);
      if (editingId === item._id) resetForm();
      await loadMaterials();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to delete material.");
    }
  };

  const totalVisible = useMemo(
    () => materials.filter((m) => m.visibleToStudents).length,
    [materials]
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              Course Materials
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add Google Drive slide links and share them with students from this course.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label="Total" value={materials.length} />
            <MiniStat label="Visible" value={totalVisible} />
            <MiniStat label="Hidden" value={materials.length - totalVisible} />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          {editingId ? "Edit Material" : "Add New Material"}
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field label="Title *">
            <input
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              className={inputClass}
              placeholder="Week 01 Introduction"
              required
            />
          </Field>

          <Field label="Topic">
            <input
              value={form.topic}
              onChange={(e) => handleChange("topic", e.target.value)}
              className={inputClass}
              placeholder="Database basics / OOP / Chapter 1"
            />
          </Field>

          <div className="lg:col-span-2">
            <Field label="Google Drive Link *">
              <input
                value={form.driveLink}
                onChange={(e) => handleChange("driveLink", e.target.value)}
                className={inputClass}
                placeholder="https://drive.google.com/..."
                required
              />
            </Field>
          </div>

          <Field label="File Type">
            <select
              value={form.fileType}
              onChange={(e) => handleChange("fileType", e.target.value)}
              className={inputClass}
            >
              <option value="google_slide">Google Slide</option>
              <option value="pdf">PDF</option>
              <option value="ppt">PPT</option>
              <option value="pptx">PPTX</option>
              <option value="doc">DOC</option>
              <option value="docx">DOCX</option>
              <option value="link">Link</option>
              <option value="other">Other</option>
            </select>
          </Field>

          <Field label="Sort Order">
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => handleChange("sortOrder", e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </Field>

          <div className="lg:col-span-2">
            <Field label="Description">
              <textarea
                rows="4"
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                className={inputClass}
                placeholder="Optional short note for students"
              />
            </Field>
          </div>

          <div className="lg:col-span-2">
            <label className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.visibleToStudents}
                onChange={(e) => handleChange("visibleToStudents", e.target.checked)}
              />
              Visible to students
            </label>
          </div>

          <div className="lg:col-span-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : editingId ? "Update Material" : "Add Material"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="text-base font-semibold text-slate-900 dark:text-white">
            Existing Materials
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Loading materials...</div>
          ) : materials.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No materials added yet.
            </div>
          ) : (
            <div className="space-y-4">
              {materials.map((item) => (
                <div
                  key={item._id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/70"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                          {item.fileType || "file"}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            item.visibleToStudents
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                          }`}
                        >
                          {item.visibleToStudents ? "Visible to students" : "Hidden from students"}
                        </span>
                      </div>

                      <div className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
                        {item.title}
                      </div>

                      {item.topic ? (
                        <div className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                          Topic: {item.topic}
                        </div>
                      ) : null}

                      {item.description ? (
                        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                          {item.description}
                        </div>
                      ) : null}

                      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        Sort Order: {item.sortOrder || 0}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={item.driveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Open
                      </a>

                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </div>
      {children}
    </label>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center dark:border-slate-700 dark:bg-slate-800">
      <div className="text-lg font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";