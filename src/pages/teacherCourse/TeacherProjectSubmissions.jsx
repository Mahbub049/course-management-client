import { useEffect, useState } from "react";
import { fetchTeacherProjectSubmissions } from "../../services/projectSubmissionService";

export default function TeacherProjectSubmissions({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchTeacherProjectSubmissions(courseId);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project submissions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          <div className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-40 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          No project phases or submissions found yet.
        </div>
      ) : (
        items.map((item) => (
          <section
            key={item.phase.id}
            className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {item.phase.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {item.phase.phaseType === "individual" ? "Individual" : "Group"} submission
                    {" • "}
                    Marks: {item.phase.totalMarks}
                    {" • "}
                    Due: {item.phase.dueDate ? formatDateTime(item.phase.dueDate) : "No due date"}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Submitted: {item.submittedCount}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              {item.submissions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                  No submissions for this phase yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {item.submissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {submission.submissionType === "individual" ? "Individual" : "Group"}
                        </span>

                        {submission.isLate ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                            Late
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            On Time
                          </span>
                        )}
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                        {submission.group ? (
                          <div>
                            <span className="font-semibold">Group:</span>{" "}
                            {submission.group.groupName || "Unnamed Group"}
                          </div>
                        ) : null}

                        {submission.student ? (
                          <div>
                            <span className="font-semibold">Student:</span>{" "}
                            {submission.student.name}
                            {submission.student.roll ? ` (${submission.student.roll})` : ""}
                          </div>
                        ) : null}

                        {submission.submittedBy ? (
                          <div>
                            <span className="font-semibold">Submitted By:</span>{" "}
                            {submission.submittedBy.name}
                            {submission.submittedBy.roll ? ` (${submission.submittedBy.roll})` : ""}
                          </div>
                        ) : null}

                        <div>
                          <span className="font-semibold">Submitted At:</span>{" "}
                          {formatDateTime(submission.submittedAt)}
                        </div>

                        <div>
                          <span className="font-semibold">Last Updated:</span>{" "}
                          {formatDateTime(submission.lastUpdatedAt)}
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Submission Link
                        </div>
                        <a
                          href={submission.link}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-violet-600 hover:underline dark:text-violet-300"
                        >
                          {submission.link}
                        </a>
                      </div>

                      {submission.note ? (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Note
                          </div>
                          {submission.note}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString();
}