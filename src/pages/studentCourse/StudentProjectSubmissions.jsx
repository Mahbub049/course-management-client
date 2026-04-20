import { useEffect, useState } from "react";
import {
  fetchStudentProjectSubmissions,
  submitStudentProjectPhase,
} from "../../services/projectSubmissionService";

export default function StudentProjectSubmissions({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [savingPhaseId, setSavingPhaseId] = useState("");
  const [items, setItems] = useState([]);
  const [myGroup, setMyGroup] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const data = await fetchStudentProjectSubmissions(courseId);
      const list = Array.isArray(data?.items) ? data.items : [];

      setItems(list);
      setMyGroup(data?.myGroup || null);

      const nextDrafts = {};
      list.forEach((item) => {
        nextDrafts[item.phase.id] = {
          link: item.submission?.link || "",
          note: item.submission?.note || "",
        };
      });
      setDrafts(nextDrafts);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeDraft = (phaseId, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [phaseId]: {
        ...(prev[phaseId] || { link: "", note: "" }),
        [key]: value,
      },
    }));
  };

  const handleSubmit = async (phaseId) => {
    try {
      setSavingPhaseId(phaseId);
      setError("");
      setSuccess("");

      const payload = drafts[phaseId] || { link: "", note: "" };

      if (!String(payload.link || "").trim()) {
        setError("Submission link is required.");
        return;
      }

      await submitStudentProjectPhase(courseId, phaseId, payload);
      setSuccess("Submission saved successfully.");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to save submission.");
    } finally {
      setSavingPhaseId("");
    }
  };

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Project Submissions
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Submit or update your project phase links here.
        </p>
      </div>

      <div className="p-5 sm:p-6 space-y-4">
        {myGroup ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <span className="font-semibold">My Group:</span>{" "}
            {myGroup.groupName || "Unnamed Group"}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            {success}
          </div>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="h-48 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-48 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
            No project phases available for submission yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {items.map((item) => {
              const draft = drafts[item.phase.id] || { link: "", note: "" };
              const disabled = !item.canSubmit;
              const alreadySubmitted = Boolean(item.submission);

              return (
                <div
                  key={item.phase.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {item.phase.title}
                        </h3>

                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {item.phase.phaseType === "individual" ? "Individual" : "Group"}
                        </span>

                        {item.submission?.isLate ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                            Late
                          </span>
                        ) : alreadySubmitted ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            Submitted
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {item.submissionLabel}
                        {" • "}
                        Marks: {item.phase.totalMarks}
                        {" • "}
                        Due: {item.phase.dueDate ? formatDateTime(item.phase.dueDate) : "No due date"}
                      </div>
                    </div>
                  </div>

                  {item.phase.instructions ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {item.phase.instructions}
                    </div>
                  ) : null}

                  {!item.canSubmit ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                      This group phase requires a project group first.
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="lg:col-span-2">
                      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Submission Link <span className="text-rose-500">*</span>
                      </div>
                      <input
                        type="url"
                        value={draft.link}
                        onChange={(e) =>
                          handleChangeDraft(item.phase.id, "link", e.target.value)
                        }
                        disabled={disabled}
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        placeholder="Paste Google Drive / OneDrive / GitHub link"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Note
                      </div>
                      <textarea
                        rows={4}
                        value={draft.note}
                        onChange={(e) =>
                          handleChangeDraft(item.phase.id, "note", e.target.value)
                        }
                        disabled={disabled}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        placeholder="Optional note for teacher"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleSubmit(item.phase.id)}
                      disabled={disabled || savingPhaseId === item.phase.id}
                      className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingPhaseId === item.phase.id
                        ? "Saving..."
                        : alreadySubmitted
                        ? "Update Submission"
                        : "Submit"}
                    </button>

                    {item.submission ? (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        Last updated: {formatDateTime(item.submission.lastUpdatedAt)}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString();
}