import { useEffect, useState } from "react";
import {
  fetchTeacherProjectSyncState,
  runProjectFinalSync,
  saveTeacherProjectSyncConfig,
} from "../../services/projectFinalSyncService";

export default function TeacherProjectFinalSync({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [assessments, setAssessments] = useState([]);
  const [targetAssessmentId, setTargetAssessmentId] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
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
      const data = await fetchTeacherProjectSyncState(courseId);

      setAssessments(Array.isArray(data?.assessments) ? data.assessments : []);
      setTargetAssessmentId(data?.config?.targetAssessmentId || "");
      setSyncEnabled(data?.config?.syncEnabled === true);
      setLastSyncedAt(data?.config?.lastSyncedAt || null);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project sync settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await saveTeacherProjectSyncConfig(courseId, {
        targetAssessmentId,
        syncEnabled,
      });

      setSuccess("Project sync settings updated successfully.");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to save sync settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleRunSync = async () => {
    try {
      setRunning(true);
      setError("");
      setSuccess("");
      setSyncResult(null);

      const data = await runProjectFinalSync(courseId);
      setSyncResult(data);
      setSuccess(data?.message || "Project marks synced successfully.");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to run final sync.");
    } finally {
      setRunning(false);
    }
  };

  const selectedAssessment = assessments.find((item) => item.id === targetAssessmentId);

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

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Final Sync Settings
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            For Advanced Lab Final, project marks now sync into the project breakdown items. For regular assessments, project total syncs as one flat value.
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="h-36 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Target Assessment
                </div>
                <select
                  value={targetAssessmentId}
                  onChange={(e) => setTargetAssessmentId(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Select assessment</option>
                  {assessments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} ({item.marks}){" "}
                      {item.structureType === "lab_final"
                        ? `• Advanced Lab Final${item.labFinalMode ? ` • ${item.labFinalMode}` : ""}`
                        : "• Regular"}
                    </option>
                  ))}
                </select>

                {selectedAssessment ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <span className="font-semibold">Selected type:</span>{" "}
                    {selectedAssessment.structureType === "lab_final"
                      ? `Advanced Lab Final${selectedAssessment.labFinalMode ? ` (${selectedAssessment.labFinalMode})` : ""}`
                      : "Regular Assessment"}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sync Status
                </div>
                <label className="flex h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={syncEnabled}
                    onChange={(e) => setSyncEnabled(e.target.checked)}
                  />
                  Enable project to assessment sync
                </label>
              </div>

              <div className="lg:col-span-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Sync Settings"}
                </button>

                <button
                  type="button"
                  onClick={handleRunSync}
                  disabled={running || !syncEnabled || !targetAssessmentId}
                  className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {running ? "Syncing..." : "Run Final Sync"}
                </button>
              </div>

              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span className="font-semibold">Last Synced:</span>{" "}
                {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Never"}
              </div>
            </div>
          )}
        </div>
      </section>

      {syncResult ? (
        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Sync Result
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              The result below shows what was pushed into the selected assessment.
            </p>
          </div>

          <div className="space-y-6 p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <span className="font-semibold">Target Assessment:</span>{" "}
              {syncResult?.targetAssessment?.title || "-"}
              {" • "}
              <span className="font-semibold">Synced Students:</span>{" "}
              {syncResult?.syncedCount || 0}
              {" • "}
              <span className="font-semibold">Structure:</span>{" "}
              {syncResult?.targetAssessment?.structureType || "-"}
            </div>

            {Array.isArray(syncResult?.mapping) && syncResult.mapping.length > 0 ? (
              <div className="rounded-3xl border border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Phase to Assessment Breakdown Mapping
                  </h4>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    These project phases were synced into these advanced lab final breakdown items.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-white dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Project Phase
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Phase Marks
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Assessment Breakdown Item
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Breakdown Marks
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                      {syncResult.mapping.map((item) => (
                        <tr key={item.phaseId}>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                            {item.phaseTitle}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                            {item.phaseMarks}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                            {item.targetLabel}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                            {item.targetMarks}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Roll
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Project Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Available
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                  {(syncResult?.totals || []).map((item) => (
                    <tr key={item.studentId}>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                        {item.roll || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                        {item.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.syncedMarks ?? 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                        {item.available ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString();
}