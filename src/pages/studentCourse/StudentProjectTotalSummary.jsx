import { useEffect, useState } from "react";
import { fetchStudentProjectTotalSummary } from "../../services/projectFinalSyncService";

export default function StudentProjectTotalSummary({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalObtained: 0,
    totalAvailable: 0,
    syncedMarks: 0,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await fetchStudentProjectTotalSummary(courseId);
      setSummary({
        totalObtained: Number(data?.totalObtained || 0),
        totalAvailable: Number(data?.totalAvailable || 0),
        syncedMarks: Number(data?.syncedMarks || 0),
      });
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project total.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Project Total Summary
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your final project total that can be synced into the course marksheet.
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        ) : loading ? (
          <div className="h-28 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard label="Project Obtained" value={summary.totalObtained} />
            <MetricCard label="Project Available" value={summary.totalAvailable} />
            <MetricCard label="Synced Marks" value={summary.syncedMarks} />
          </div>
        )}
      </div>
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}