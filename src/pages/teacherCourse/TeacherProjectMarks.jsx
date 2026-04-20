import { useEffect, useState } from "react";
import {
  fetchTeacherProjectEvaluations,
  saveProjectEvaluation,
} from "../../services/projectEvaluationService";

export default function TeacherProjectMarks({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [items, setItems] = useState([]);
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

      const data = await fetchTeacherProjectEvaluations(courseId);
      const list = Array.isArray(data) ? data : [];
      setItems(list);

      const nextDrafts = {};
      list.forEach((phaseBlock) => {
        (phaseBlock.items || []).forEach((entry) => {
          const key = buildEntryKey(phaseBlock.phase.id, entry.submission.id);
          nextDrafts[key] = {
            marksObtained: entry.evaluation?.marksObtained ?? "",
            feedback: entry.evaluation?.feedback || "",
          };
        });
      });
      setDrafts(nextDrafts);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project marks.");
    } finally {
      setLoading(false);
    }
  };

  const handleDraftChange = (phaseId, submissionId, field, value) => {
    const key = buildEntryKey(phaseId, submissionId);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { marksObtained: "", feedback: "" }),
        [field]: value,
      },
    }));
  };

  const handleSave = async (phaseId, submissionId, totalMarks) => {
    const key = buildEntryKey(phaseId, submissionId);
    const draft = drafts[key] || { marksObtained: "", feedback: "" };

    try {
      setSavingKey(key);
      setError("");
      setSuccess("");

      if (String(draft.marksObtained).trim() === "") {
        setError("Marks are required.");
        return;
      }

      const marks = Number(draft.marksObtained);
      if (Number.isNaN(marks) || marks < 0 || marks > Number(totalMarks || 0)) {
        setError(`Marks must be between 0 and ${Number(totalMarks || 0)}.`);
        return;
      }

      await saveProjectEvaluation(courseId, phaseId, {
        submissionId,
        marksObtained: marks,
        feedback: draft.feedback || "",
      });

      setSuccess("Marks saved successfully.");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to save marks.");
    } finally {
      setSavingKey("");
    }
  };

  return (
    <div className="space-y-6">
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
        <div className="grid grid-cols-1 gap-4">
          <div className="h-44 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-44 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          No submissions are available for marking yet.
        </div>
      ) : (
        items.map((block) => (
          <section
            key={block.phase.id}
            className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {block.phase.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {block.phase.phaseType === "individual" ? "Individual" : "Group"}
                    {" • "}
                    Total Marks: {block.phase.totalMarks}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {block.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                  No submissions found for this phase.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {block.items.map((entry) => {
                    const key = buildEntryKey(block.phase.id, entry.submission.id);
                    const draft = drafts[key] || {
                      marksObtained: "",
                      feedback: "",
                    };

                    return (
                      <div
                        key={entry.submission.id}
                        className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40"
                      >
                        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                {entry.submission.submissionType === "individual"
                                  ? "Individual"
                                  : "Group"}
                              </span>
                            </div>

                            {entry.submission.group ? (
                              <div className="text-sm text-slate-600 dark:text-slate-300">
                                <span className="font-semibold">Group:</span>{" "}
                                {entry.submission.group.groupName || "Unnamed Group"}
                              </div>
                            ) : null}

                            {entry.submission.student ? (
                              <div className="text-sm text-slate-600 dark:text-slate-300">
                                <span className="font-semibold">Student:</span>{" "}
                                {entry.submission.student.name}
                                {entry.submission.student.roll
                                  ? ` (${entry.submission.student.roll})`
                                  : ""}
                              </div>
                            ) : null}

                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Submission Link
                              </div>
                              <a
                                href={entry.submission.link}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-violet-600 hover:underline dark:text-violet-300"
                              >
                                {entry.submission.link}
                              </a>
                            </div>

                            {entry.submission.note ? (
                              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Submission Note
                                </div>
                                {entry.submission.note}
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <div>
                              <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Marks Obtained
                              </div>
                              <input
                                type="number"
                                min="0"
                                max={block.phase.totalMarks}
                                value={draft.marksObtained}
                                onChange={(e) =>
                                  handleDraftChange(
                                    block.phase.id,
                                    entry.submission.id,
                                    "marksObtained",
                                    e.target.value
                                  )
                                }
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                placeholder={`0 - ${block.phase.totalMarks}`}
                              />
                            </div>

                            <div>
                              <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Feedback
                              </div>
                              <textarea
                                rows={5}
                                value={draft.feedback}
                                onChange={(e) =>
                                  handleDraftChange(
                                    block.phase.id,
                                    entry.submission.id,
                                    "feedback",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                placeholder="Write feedback for this submission"
                              />
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  handleSave(
                                    block.phase.id,
                                    entry.submission.id,
                                    block.phase.totalMarks
                                  )
                                }
                                disabled={savingKey === key}
                                className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingKey === key ? "Saving..." : "Save Marks"}
                              </button>

                              {entry.evaluation ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                  Saved: {entry.evaluation.marksObtained}/{block.phase.totalMarks}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function buildEntryKey(phaseId, submissionId) {
  return `${phaseId}__${submissionId}`;
}