import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  fetchTeacherPublicSubmissionLink,
  updateTeacherPublicSubmissionLink,
} from "../../services/labSubmissionService";

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getAssessmentId(item) {
  return String(item?.id || item?._id || "");
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M14 5h5v5m0-5-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
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
    showOnPortal: false,
    portalVisibleFrom: "",
    portalVisibleUntil: "",
    title: "Public Submission Link",
    instructions: "",
    assessmentIds: [],
  });

  const portalUrl = useMemo(() => `${window.location.origin}/submit`, []);
  const coursePreviewUrl = useMemo(
    () => (link?.token ? `${window.location.origin}/submit/${link.token}` : ""),
    [link?.token]
  );

  const selectedCount = form.assessmentIds.length;

  const applyLinkToForm = (nextLink) => {
    setLink(nextLink);
    setForm({
      isActive: !!nextLink?.isActive,
      showOnPortal: nextLink?.showOnPortal === true,
      portalVisibleFrom: toDateTimeLocal(nextLink?.portalVisibleFrom),
      portalVisibleUntil: toDateTimeLocal(nextLink?.portalVisibleUntil),
      title: nextLink?.title || "Public Submission Link",
      instructions: nextLink?.instructions || "",
      assessmentIds: Array.isArray(nextLink?.assessmentIds)
        ? nextLink.assessmentIds.map(String)
        : [],
    });
  };

  const loadLink = async () => {
    if (!courseId) return;

    setLoading(true);
    try {
      const data = await fetchTeacherPublicSubmissionLink(courseId);
      applyLinkToForm(data?.link || null);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not load public submission settings.",
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
      const allIds = assessments.map(getAssessmentId).filter(Boolean);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.assessmentIds.includes(id));
      return {
        ...prev,
        assessmentIds: allSelected ? [] : allIds,
      };
    });
  };

  const saveLink = async () => {
    if ((form.isActive || form.showOnPortal) && !form.assessmentIds.length) {
      await Swal.fire(
        "Select a submission",
        "Choose at least one assessment before enabling this public submission page.",
        "warning"
      );
      return;
    }

    if (
      form.portalVisibleFrom &&
      form.portalVisibleUntil &&
      new Date(form.portalVisibleFrom) > new Date(form.portalVisibleUntil)
    ) {
      await Swal.fire(
        "Invalid schedule",
        "The portal end date and time must be later than the start date and time.",
        "warning"
      );
      return;
    }

    if (form.showOnPortal && !link?.showOnPortal) {
      const confirmation = await Swal.fire({
        title: "Use this course at /submit?",
        text: "Students will open this course directly from /submit. Any course currently using /submit will be removed from that address, but its course-specific link will keep working.",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Use This Course",
      });

      if (!confirmation.isConfirmed) return;
    }

    setSaving(true);
    try {
      const data = await updateTeacherPublicSubmissionLink(courseId, {
        isActive: !!form.isActive,
        showOnPortal: !!form.showOnPortal,
        portalVisibleFrom: toIsoOrNull(form.portalVisibleFrom),
        portalVisibleUntil: toIsoOrNull(form.portalVisibleUntil),
        title: form.title,
        instructions: form.instructions,
        assessmentIds: form.assessmentIds,
      });

      applyLinkToForm(data?.link || null);

      await Swal.fire(
        "Saved",
        form.showOnPortal
          ? "The /submit address now opens this course directly according to the selected schedule."
          : "Public submission settings were saved successfully.",
        "success"
      );
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not save public submission settings.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const copyValue = async (value, successMessage) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      Swal.fire("Copied", successMessage, "success");
    } catch (_err) {
      Swal.fire("Copy manually", value, "info");
    }
  };

  const portalStatus = !form.isActive
    ? "Public uploads disabled"
    : !form.showOnPortal
      ? "Public uploads enabled through the course-specific link"
      : form.portalVisibleFrom || form.portalVisibleUntil
        ? "Selected for /submit with a visibility schedule"
        : "Selected as the current /submit page";

  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-500/20 dark:bg-slate-950 sm:rounded-3xl">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-4 dark:border-slate-800 dark:from-indigo-500/10 dark:via-slate-950 dark:to-violet-500/10 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-indigo-300">
              Direct /submit Page
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-950 dark:text-white sm:text-xl">
              Choose what opens at /submit
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Students open <span className="font-semibold text-indigo-700 dark:text-indigo-300">{portalUrl}</span> and come directly to this course submission page. There is no course-list or search screen.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:w-[430px]">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <span>Accept public uploads</span>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                    showOnPortal: event.target.checked ? prev.showOnPortal : false,
                  }))
                }
                className="h-4 w-4 accent-indigo-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <span>Use as /submit page</span>
              <input
                type="checkbox"
                checked={form.showOnPortal}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    showOnPortal: event.target.checked,
                    isActive: event.target.checked ? true : prev.isActive,
                  }))
                }
                className="h-4 w-4 accent-indigo-600"
              />
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
          Loading public submission settings...
        </div>
      ) : (
        <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
              <div className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Direct student link
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={portalUrl}
                  readOnly
                  className="min-w-0 flex-1 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => copyValue(portalUrl, "The direct /submit link was copied.")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
                >
                  <CopyIcon />
                  Copy /submit Link
                </button>
                <button
                  type="button"
                  onClick={() => window.open(portalUrl, "_blank", "noopener,noreferrer")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800"
                >
                  <ExternalIcon />
                  Open /submit
                </button>
              </div>
              {coursePreviewUrl ? (
                <button
                  type="button"
                  onClick={() => window.open(coursePreviewUrl, "_blank", "noopener,noreferrer")}
                  className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                >
                  Preview this course directly
                  <ExternalIcon />
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Submission Page Title
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-indigo-500/10"
                  placeholder="Example: ICT-1102 Lab Submission"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  This title appears at the top of the direct submission page.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Open /submit From — Optional
                </label>
                <input
                  type="datetime-local"
                  value={form.portalVisibleFrom}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, portalVisibleFrom: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Stop Showing After — Optional
                </label>
                <input
                  type="datetime-local"
                  value={form.portalVisibleUntil}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, portalVisibleUntil: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Student Instructions
                  </label>
                  {(form.portalVisibleFrom || form.portalVisibleUntil) && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          portalVisibleFrom: "",
                          portalVisibleUntil: "",
                        }))
                      }
                      className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
                    >
                      Clear schedule
                    </button>
                  )}
                </div>
                <textarea
                  value={form.instructions}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, instructions: event.target.value }))
                  }
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-indigo-500/10"
                  placeholder="Example: Enter your roll number and upload the required file before the deadline."
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Published Submissions
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
                {assessments.length > 0 && assessments.every((item) => form.assessmentIds.includes(getAssessmentId(item)))
                  ? "Clear All"
                  : "Select All"}
              </button>
            </div>

            {!assessments.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Create at least one file submission assessment first.
              </div>
            ) : (
              <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1">
                {assessments.map((item) => {
                  const itemId = getAssessmentId(item);
                  return (
                    <label
                      key={itemId}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                        form.assessmentIds.includes(itemId)
                          ? "border-indigo-300 bg-indigo-50 text-slate-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-slate-100"
                          : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.assessmentIds.includes(itemId)}
                        onChange={() => toggleAssessment(itemId)}
                        className="mt-1 h-4 w-4 accent-indigo-600"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{item.name}</span>
                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                          Full marks: {item.fullMarks || 0} • Submissions: {item.submissionCount || 0}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {portalStatus}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Only one course can use /submit at a time. Selecting this course removes the previous course from /submit, while all course-specific links continue to work.
          </div>
        </div>

        <button
          type="button"
          onClick={saveLink}
          disabled={saving || loading}
          className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Saving..." : "Save Public Submission Settings"}
        </button>
      </div>
    </div>
  );
}
