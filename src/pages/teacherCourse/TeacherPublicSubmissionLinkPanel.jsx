import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  fetchTeacherPublicSubmissionLink,
  updateTeacherPublicSubmissionLink,
} from "../../services/labSubmissionService";

function buildPublicUrl(token = "") {
  if (!token) return "";
  return `${window.location.origin}/${token}`;
}

export default function TeacherPublicSubmissionLinkPanel({
  courseId,
  assessments = [],
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState(null);
  const [form, setForm] = useState({
    isActive: false,
    title: "Public Submission Link",
    instructions: "",
    assessmentIds: [],
  });

  const publicUrl = useMemo(() => buildPublicUrl(link?.token), [link?.token]);

  const selectedCount = form.assessmentIds.length;

  const loadLink = async () => {
    if (!courseId) return;

    setLoading(true);
    try {
      const data = await fetchTeacherPublicSubmissionLink(courseId);
      const nextLink = data?.link || null;
      setLink(nextLink);
      setForm({
        isActive: !!nextLink?.isActive,
        title: nextLink?.title || "Public Submission Link",
        instructions: nextLink?.instructions || "",
        assessmentIds: Array.isArray(nextLink?.assessmentIds)
          ? nextLink.assessmentIds
          : [],
      });
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not load public submission link.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLink();
  }, [courseId]);

  const toggleAssessment = (assessmentId) => {
    setForm((prev) => {
      const current = Array.isArray(prev.assessmentIds) ? prev.assessmentIds : [];
      const exists = current.includes(assessmentId);
      return {
        ...prev,
        assessmentIds: exists
          ? current.filter((id) => id !== assessmentId)
          : [...current, assessmentId],
      };
    });
  };

  const toggleAll = () => {
    setForm((prev) => {
      const allIds = assessments.map((item) => item.id);
      const allSelected = allIds.every((id) => prev.assessmentIds.includes(id));
      return {
        ...prev,
        assessmentIds: allSelected ? [] : allIds,
      };
    });
  };

  const saveLink = async () => {
    setSaving(true);
    try {
      const data = await updateTeacherPublicSubmissionLink(courseId, {
        isActive: !!form.isActive,
        title: form.title,
        instructions: form.instructions,
        assessmentIds: form.assessmentIds,
      });

      const nextLink = data?.link || null;
      setLink(nextLink);
      setForm({
        isActive: !!nextLink?.isActive,
        title: nextLink?.title || "Public Submission Link",
        instructions: nextLink?.instructions || "",
        assessmentIds: Array.isArray(nextLink?.assessmentIds)
          ? nextLink.assessmentIds
          : [],
      });

      await Swal.fire(
        "Saved",
        "Public submission link settings saved successfully. The link is now short and readable.",
        "success"
      );
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not save public submission link.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!publicUrl) return;

    try {
      await navigator.clipboard.writeText(publicUrl);
      Swal.fire("Copied", "Short public submission link copied.", "success");
    } catch (_err) {
      Swal.fire("Copy manually", publicUrl, "info");
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 sm:rounded-3xl sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-300">
            Public Upload Page
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
            No-login submission link for students
          </h3>
          <p className="mt-1 hidden max-w-3xl text-sm text-slate-600 dark:text-slate-300 sm:block">
            Students can open this link, enter their roll number, and upload files.
            Uploaded files will appear in this same teacher submission section and
            will use the same Supabase storage.
          </p>
        </div>

        <label className="flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-emerald-500/20 dark:bg-slate-900 dark:text-slate-200 lg:w-auto">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, isActive: e.target.checked }))
            }
          />
          Enable public submission link
        </label>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Loading public link...
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:mt-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Public Page Title
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="Example: ICT-1102 Lab Submission"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Short Public Link
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={publicUrl || "Short link will be generated automatically"}
                    readOnly
                    className="min-w-0 flex-1 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    disabled={!publicUrl}
                    className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Format: course code + intake + section, for example ict1102i66s7.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Public Page Instructions
              </label>
              <textarea
                value={form.instructions}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, instructions: e.target.value }))
                }
                rows={3}
                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                placeholder="Example: Enter your roll number and upload the required file before deadline."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Show Submissions
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {selectedCount} selected
                </div>
              </div>

              <button
                type="button"
                onClick={toggleAll}
                disabled={!assessments.length}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Select All
              </button>
            </div>

            {!assessments.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Create at least one file submission assessment first.
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {assessments.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 transition hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={form.assessmentIds.includes(item.id)}
                      onChange={() => toggleAssessment(item.id)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold">{item.name}</span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        Full marks: {item.fullMarks || 0} • Submissions: {item.submissionCount || 0}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={saveLink}
          disabled={saving || loading}
          className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600 sm:w-auto"
        >
          {saving ? "Saving..." : "Save Public Link Settings"}
        </button>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Public link status: {form.isActive ? "Active" : "Disabled"}
        </div>
      </div>
    </div>
  );
}
