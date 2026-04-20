import { useEffect, useState } from "react";
import { fetchStudentProjectEvaluations } from "../../services/projectEvaluationService";

export default function StudentProjectMarks({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [totalObtained, setTotalObtained] = useState(0);
  const [totalAvailable, setTotalAvailable] = useState(0);
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

      const data = await fetchStudentProjectEvaluations(courseId);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotalObtained(Number(data?.totalObtained || 0));
      setTotalAvailable(Number(data?.totalAvailable || 0));
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project marks.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Project Marks
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Check your phase-wise project marks and teacher feedback.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Total: {totalObtained} / {totalAvailable}
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="h-36 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-36 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
            No project marks available yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.phase.id}
                className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {item.phase.title}
                  </h3>

                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {item.phase.phaseType === "individual" ? "Individual" : "Group"}
                  </span>
                </div>

                <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Marks:{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {item.evaluation ? item.evaluation.marksObtained : 0}
                  </span>
                  {" / "}
                  {item.phase.totalMarks}
                </div>

                {item.evaluation ? (
                  <>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Evaluated by: {item.evaluation.evaluatedBy?.name || "Teacher"}
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Feedback
                      </div>
                      {item.evaluation.feedback || "No feedback provided."}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    Not evaluated yet.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}