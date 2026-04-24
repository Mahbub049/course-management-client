import { useEffect, useState } from "react";
import { fetchStudentProjectPhases } from "../../services/projectPhaseService";

export default function StudentProjectPhases({ course, onOpenSubmission }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [phases, setPhases] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadPhases();
  }, [courseId]);

  const loadPhases = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await fetchStudentProjectPhases(courseId);
      setPhases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project phases.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Project Phases
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Check each phase quickly, then jump directly to submission.
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : phases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
            No project phases are available yet.
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
                        Phase {index + 1}
                      </span>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {phase.title}
                      </h3>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {phase.phaseType === "individual" ? "Individual" : "Group"}
                      </span>

                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                        {phase.totalMarks} Marks
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenSubmission?.(phase.id)}
                    className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                  >
                    Open Submission
                  </button>
                </div>

                <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                  Due: {phase.dueDate ? formatDateTime(phase.dueDate) : "No due date"}
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
                        {link.label || "Open link"}
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
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString();
}