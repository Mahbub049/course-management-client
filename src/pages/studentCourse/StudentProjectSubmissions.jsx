import { useEffect, useMemo, useState } from "react";
import {
  fetchStudentProjectSubmissions,
  submitStudentProjectPhase,
} from "../../services/projectSubmissionService";

export default function StudentProjectSubmissions({
  course,
  initialPhaseId = "",
}) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [savingPhaseId, setSavingPhaseId] = useState("");
  const [items, setItems] = useState([]);
  const [myGroup, setMyGroup] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [selectedPhaseId, setSelectedPhaseId] = useState(initialPhaseId || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadData();
  }, [courseId]);

  useEffect(() => {
    if (initialPhaseId) {
      setSelectedPhaseId(initialPhaseId);
    }
  }, [initialPhaseId]);

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
          file: null,
        };
      });
      setDrafts(nextDrafts);

      if (!selectedPhaseId && list.length > 0) {
        setSelectedPhaseId(list[0].phase.id);
      }
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
        ...(prev[phaseId] || { link: "", note: "", file: null }),
        [key]: value,
      },
    }));
  };

  const selectedItem = useMemo(() => {
    return items.find((item) => item.phase.id === selectedPhaseId) || null;
  }, [items, selectedPhaseId]);

  const handleSubmit = async () => {
    if (!selectedItem) return;

    try {
      const phaseId = selectedItem.phase.id;
      setSavingPhaseId(phaseId);
      setError("");
      setSuccess("");

      const payload = drafts[phaseId] || { link: "", note: "", file: null };

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
          Project Phases & Workflow
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Select a phase, review its instructions, resource links, deadline, and complete the submission from the same place.
        </p>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
            <div className="h-96 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-96 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
            No project phases are available yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
            <div className="space-y-3">
              {items.map((item, index) => {
                const active = item.phase.id === selectedPhaseId;
                const submitted = Boolean(item.submission);

                return (
                  <button
                    key={item.phase.id}
                    type="button"
                    onClick={() => setSelectedPhaseId(item.phase.id)}
                    className={[
                      "w-full rounded-3xl border p-4 text-left transition",
                      active
                        ? "border-violet-500 bg-violet-50 shadow-lg shadow-violet-500/10 dark:border-violet-400 dark:bg-violet-500/10"
                        : "border-slate-200 bg-slate-50/70 hover:border-violet-200 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-violet-500/30",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                        {index + 1}
                      </span>

                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.phase.title}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {item.phase.phaseType === "individual" ? "Individual" : "Group"}
                      </span>

                      {submitted ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                          Submitted
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                          Pending
                        </span>
                      )}
                    </div>

                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {item.phase.totalMarks} Marks •{" "}
                      {item.phase.dueDate ? formatDateTime(item.phase.dueDate) : "No due date"}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedItem ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {selectedItem.phase.title}
                      </h3>

                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {selectedItem.phase.phaseType === "individual" ? "Individual" : "Group"}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      {selectedItem.submissionLabel} • Marks: {selectedItem.phase.totalMarks} • Due:{" "}
                      {selectedItem.phase.dueDate
                        ? formatDateTime(selectedItem.phase.dueDate)
                        : "No due date"}
                    </div>
                  </div>
                </div>

                {selectedItem.phase.instructions ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {selectedItem.phase.instructions}
                  </div>
                ) : null}

                {Array.isArray(selectedItem.phase.resourceLinks) &&
                  selectedItem.phase.resourceLinks.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Reference Links
                    </div>
                    {selectedItem.phase.resourceLinks.map((link, idx) => (
                      <a
                        key={`${selectedItem.phase.id}-${idx}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-violet-600 hover:underline dark:border-slate-700 dark:bg-slate-900 dark:text-violet-300"
                      >
                        {link.label || "Open link"}
                      </a>
                    ))}
                  </div>
                ) : null}

                {!selectedItem.canSubmit ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    This group phase requires a project group first.
                  </div>
                ) : (
                  <>
                    <div className="mt-5 grid grid-cols-1 gap-4">
                      {/*                      <div>
                        <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Submission Link
                        </div>
                        <input
                          type="url"
                          value={drafts[selectedItem.phase.id]?.link || ""}
                          onChange={(e) =>
                            handleChangeDraft(selectedItem.phase.id, "link", e.target.value)
                          }
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          placeholder="Paste Google Drive / OneDrive / GitHub link"
                        />
                      </div>*/}

                      <div>
                        <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Upload File
                        </div>
                        <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                          You must upload a file, or later a submission link can also be used.
                        </div>
                        <input
                          type="file"
                          onChange={(e) =>
                            handleChangeDraft(
                              selectedItem.phase.id,
                              "file",
                              e.target.files?.[0] || null
                            )
                          }
                          className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 file:mr-4 file:rounded-xl file:border-0 file:bg-violet-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-violet-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        {drafts[selectedItem.phase.id]?.file ? (
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Selected: {drafts[selectedItem.phase.id]?.file?.name}
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Note
                        </div>
                        <textarea
                          rows={5}
                          value={drafts[selectedItem.phase.id]?.note || ""}
                          onChange={(e) =>
                            handleChangeDraft(selectedItem.phase.id, "note", e.target.value)
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          placeholder="Optional note for teacher"
                        />
                      </div>
                    </div>

                    {selectedItem.submission?.fileUrl ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          Uploaded File
                        </div>
                        <a
                          href={selectedItem.submission.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block text-violet-600 hover:underline dark:text-violet-300"
                        >
                          {selectedItem.submission.fileName || "Open uploaded file"}
                        </a>
                      </div>
                    ) : null}

                    {selectedItem.submission ? (
                      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Last updated: {formatDateTime(selectedItem.submission.lastUpdatedAt)}
                      </div>
                    ) : null}

                    <div className="mt-5">
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={savingPhaseId === selectedItem.phase.id}
                        className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingPhaseId === selectedItem.phase.id
                          ? "Saving..."
                          : selectedItem.submission
                            ? "Update Submission"
                            : "Submit Phase"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
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