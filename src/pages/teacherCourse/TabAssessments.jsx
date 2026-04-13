import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  fetchAssessments,
  createAssessmentRequest,
  updateAssessmentRequest,
  deleteAssessmentRequest,
} from "../../services/assessmentService";
import { updateCourseRequest } from "../../services/courseService";

function getCourseType(course) {
  return (course?.courseType || "theory").toLowerCase();
}

function normalizeOrders(list) {
  return (list || []).map((a, idx) => ({
    ...a,
    order: Number.isFinite(Number(a.order)) ? Number(a.order) : idx,
  }));
}

function sortByOrder(list) {
  const arr = normalizeOrders(list);
  return [...arr].sort((a, b) => {
    const ao = Number(a.order ?? 0);
    const bo = Number(b.order ?? 0);
    if (ao !== bo) return ao - bo;

    const at = new Date(a.createdAt || 0).getTime();
    const bt = new Date(b.createdAt || 0).getTime();
    return at - bt;
  });
}

function classifyForBadge(nameRaw, courseType) {
  const name = String(nameRaw || "").toLowerCase();

  if (courseType === "lab") {
    if (name.includes("mid")) return "mid";
    if (name.includes("final")) return "final";
    if (name.includes("att") || name.includes("attendance")) return "attendance";
    return "lab";
  }

  if (name.includes("ct") || name.includes("class test") || name.includes("class-test")) return "ct";
  if (name.includes("mid")) return "mid";
  if (name.includes("final")) return "final";
  if (name.includes("att") || name.includes("attendance")) return "attendance";
  if (name.includes("assign")) return "assignment";
  if (name.includes("pres")) return "presentation";
  return "other";
}

function badgeLabel(type) {
  if (type === "ct") return "CT";
  if (type === "mid") return "Mid";
  if (type === "final") return "Final";
  if (type === "attendance") return "Attendance";
  if (type === "assignment") return "Assignment";
  if (type === "presentation") return "Presentation";
  if (type === "lab") return "Lab";
  return "Other";
}

function badgeClass(type) {
  if (type === "final") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";
  }
  if (type === "mid") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (type === "ct") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";
  }
  if (type === "attendance") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (type === "assignment" || type === "presentation") {
    return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300";
  }
  if (type === "lab") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function reorderArray(arr, fromIndex, toIndex) {
  const copy = [...arr];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

function getDefaultCtPolicy(course) {
  const raw = course?.classTestPolicy || {};

  return {
    mode: raw.mode || "best_n_average_scaled",
    bestCount:
      Number(raw.bestCount) > 0
        ? Number(raw.bestCount)
        : raw.mode === "best_one_scaled"
          ? 1
          : 2,
    totalWeight:
      Number(raw.totalWeight) >= 0 ? Number(raw.totalWeight) : 15,
    manualSelectedAssessmentIds: Array.isArray(raw.manualSelectedAssessmentIds)
      ? raw.manualSelectedAssessmentIds.map(String)
      : [],
  };
}

function getCtPolicyLabel(policy) {
  const p = policy || {};
  const bestCount = Number(p.bestCount || 2);
  const totalWeight = Number(p.totalWeight || 15);

  if (p.mode === "best_n_individual_scaled") {
    return `Best ${bestCount} CT individually scaled to ${totalWeight}`;
  }
  if (p.mode === "best_one_scaled") {
    return `Best 1 CT scaled to ${totalWeight}`;
  }
  if (p.mode === "manual_average_scaled") {
    return `Average of manually selected CTs scaled to ${totalWeight}`;
  }
  return `Average of best ${bestCount} CT scaled to ${totalWeight}`;
}

export default function TabAssessments({ courseId, course, onCourseUpdated }) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assessmentError, setAssessmentError] = useState("");

  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [query, setQuery] = useState("");

  const [policyForm, setPolicyForm] = useState(getDefaultCtPolicy(course));
  const [savingPolicy, setSavingPolicy] = useState(false);

  const courseType = useMemo(() => getCourseType(course), [course]);

  const [form, setForm] = useState({
    type: courseType === "lab" ? "lab" : "ct",
    name: "",
    fullMarks: "",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      type: courseType === "lab" ? "lab" : "ct",
    }));
  }, [courseType]);

  const canReorder = query.trim() === "";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAssessmentError("");
      try {
        const data = await fetchAssessments(courseId);
        setAssessments(sortByOrder(data || []));
      } catch (err) {
        console.error(err);
        setAssessmentError(err?.response?.data?.message || "Failed to load assessments");
      } finally {
        setLoading(false);
      }
    };

    if (courseId) load();
  }, [courseId]);

  useEffect(() => {
    setPolicyForm(getDefaultCtPolicy(course));
  }, [course]);

  const orderedAssessments = useMemo(() => sortByOrder(assessments), [assessments]);

  const filteredAssessments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedAssessments;

    return orderedAssessments.filter((a) => {
      const n = String(a?.name || "").toLowerCase();
      const fm = String(a?.fullMarks ?? "").toLowerCase();
      const t = classifyForBadge(a?.name, courseType);
      return n.includes(q) || fm.includes(q) || t.includes(q);
    });
  }, [orderedAssessments, query, courseType]);

  const ctAssessments = useMemo(() => {
    return orderedAssessments.filter(
      (a) => classifyForBadge(a?.name, courseType) === "ct"
    );
  }, [orderedAssessments, courseType]);

  const typeOptions =
    courseType === "lab"
      ? [
        { value: "lab", label: "Lab Assessment" },
        { value: "mid", label: "Mid" },
        { value: "final", label: "Final" },
        { value: "attendance", label: "Attendance" },
      ]
      : [
        { value: "ct", label: "Class Test (CT)" },
        { value: "mid", label: "Mid" },
        { value: "final", label: "Final" },
        { value: "attendance", label: "Attendance" },
        { value: "assignment", label: "Assignment" },
        { value: "presentation", label: "Presentation" },
      ];

  const headerHint =
    courseType === "lab"
      ? "Lab Assessments (average → 25), Mid (30), Final (40), Attendance (5)."
      : `${getCtPolicyLabel(policyForm)}, Mid (30), Final (40), Assignment/Presentation (10), Attendance (5).`;

  const onCreate = async (e) => {
    e.preventDefault();
    setAssessmentError("");
    setCreating(true);

    try {
      const name = form.name.trim();
      const fullMarks = Number(form.fullMarks);

      if (!name) {
        setAssessmentError("Please enter a name.");
        setCreating(false);
        return;
      }

      if (!fullMarks || Number.isNaN(fullMarks) || fullMarks <= 0) {
        setAssessmentError("Full marks must be a positive number.");
        setCreating(false);
        return;
      }

      const created = await createAssessmentRequest(courseId, {
        name,
        fullMarks,
      });

      setAssessments((prev) => {
        const list = sortByOrder(prev);
        const nextOrder = list.length
          ? Number(list[list.length - 1].order ?? list.length - 1) + 1
          : 0;
        return sortByOrder([...list, { ...created, order: nextOrder }]);
      });

      setForm((prev) => ({ ...prev, name: "", fullMarks: "" }));

      Swal.fire({
        icon: "success",
        title: "Assessment added",
        text: "The assessment has been created successfully.",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to create assessment");
    } finally {
      setCreating(false);
    }
  };

  const quickAdd = (name, fullMarks, typeValue) => {
    setForm((prev) => ({
      ...prev,
      type: typeValue || prev.type,
      name,
      fullMarks: String(fullMarks),
    }));
  };

  const removeAssessment = async (assessmentId) => {
    const result = await Swal.fire({
      title: "Delete this assessment?",
      text: "All related marks for this assessment will also be deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#e11d48",
    });

    if (!result.isConfirmed) return;

    try {
      setBusyId(assessmentId);
      await deleteAssessmentRequest(assessmentId);
      setAssessments((prev) => prev.filter((a) => String(a._id) !== String(assessmentId)));

      Swal.fire({
        icon: "success",
        title: "Deleted",
        text: "Assessment removed successfully.",
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to delete assessment.");
    } finally {
      setBusyId(null);
    }
  };

  const persistOrders = async (nextList) => {
    const ops = nextList.map((a, idx) => updateAssessmentRequest(a._id, { order: idx }));
    await Promise.all(ops);
  };

  const handleDrop = async (toId) => {
    const fromId = dragId;
    if (!fromId || fromId === toId) return;

    const full = orderedAssessments;
    const fromIndex = full.findIndex((x) => String(x._id) === String(fromId));
    const toIndex = full.findIndex((x) => String(x._id) === String(toId));
    if (fromIndex < 0 || toIndex < 0) return;

    const next = reorderArray(full, fromIndex, toIndex).map((x, i) => ({
      ...x,
      order: i,
    }));

    setAssessments(next);

    try {
      setBusyId(fromId);
      await persistOrders(next);
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to save new order.");
    } finally {
      setBusyId(null);
      setDragId(null);
    }
  };

  const handlePolicySave = async () => {
    if (courseType === "lab") return;

    const payload = {
      classTestPolicy: {
        mode: policyForm.mode,
        bestCount:
          policyForm.mode === "best_one_scaled"
            ? 1
            : Math.max(1, Number(policyForm.bestCount || 2)),
        totalWeight: Math.max(0, Number(policyForm.totalWeight || 15)),
        manualSelectedAssessmentIds:
          policyForm.mode === "manual_average_scaled"
            ? (policyForm.manualSelectedAssessmentIds || []).map(String)
            : [],
      },
    };

    try {
      setSavingPolicy(true);

      const updated = await updateCourseRequest(courseId, payload);

      if (typeof onCourseUpdated === "function") {
        onCourseUpdated(updated);
      }

      Swal.fire({
        icon: "success",
        title: "CT policy updated",
        text: "The class test calculation rule has been updated.",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Update failed",
        text: err?.response?.data?.message || "Failed to update CT policy.",
      });
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-6 py-5 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Assessment Setup
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {headerHint}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${courseType === "lab"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                  }`}
              >
                {courseType === "lab" ? "Lab Course" : "Theory Course"}
              </span>

              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Total: {assessments.length}
              </span>
            </div>
          </div>

          {assessmentError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {assessmentError}
            </div>
          )}
        </div>
      </div>

      {courseType !== "lab" && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Class Test Policy
            </h4>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose how CT marks will be counted in the final total.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                CT Calculation Method
              </label>
              <select
                value={policyForm.mode}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    mode: e.target.value,
                    bestCount: e.target.value === "best_one_scaled" ? 1 : prev.bestCount,
                  }))
                }
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="best_n_average_scaled">Average of best N CTs</option>
                <option value="best_n_individual_scaled">Best N CTs individually scaled</option>
                <option value="best_one_scaled">Best 1 CT only</option>
                <option value="manual_average_scaled">Average of manually selected CTs</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Number of CTs to count
              </label>
              <input
                type="number"
                min="1"
                disabled={policyForm.mode === "best_one_scaled" || policyForm.mode === "manual_average_scaled"}
                value={policyForm.mode === "best_one_scaled" ? 1 : policyForm.bestCount}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    bestCount: Math.max(1, Number(e.target.value || 1)),
                  }))
                }
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Total CT Weight
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={policyForm.totalWeight}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    totalWeight: Number(e.target.value || 0),
                  }))
                }
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          {policyForm.mode === "manual_average_scaled" && (
            <div className="border-t border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Select which CTs will count
              </div>

              {ctAssessments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No CT assessments found yet. Create CTs first, then select them here.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ctAssessments.map((a) => {
                    const checked = policyForm.manualSelectedAssessmentIds.includes(String(a._id));

                    return (
                      <label
                        key={a._id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const id = String(a._id);

                            setPolicyForm((prev) => {
                              const prevIds = prev.manualSelectedAssessmentIds || [];

                              return {
                                ...prev,
                                manualSelectedAssessmentIds: e.target.checked
                                  ? [...prevIds, id]
                                  : prevIds.filter((x) => x !== id),
                              };
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium">{a.name}</span>
                        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                          {a.fullMarks}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Current rule: <span className="font-semibold text-slate-700 dark:text-slate-200">{getCtPolicyLabel(policyForm)}</span>
            </p>

            <button
              type="button"
              onClick={handlePolicySave}
              disabled={savingPolicy}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingPolicy ? "Saving..." : "Save CT Policy"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Add Assessment
          </h4>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create new assessment items for this course.
          </p>
        </div>

        <div className="px-6 py-5">
          <form onSubmit={onCreate} className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-3">
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Type
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {typeOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-6">
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={
                  courseType === "lab"
                    ? "Lab Assessment 01 / Experiment 01"
                    : "CT1 / Mid / Final"
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Full Marks
              </label>
              <input
                value={form.fullMarks}
                onChange={(e) => setForm((p) => ({ ...p, fullMarks: e.target.value }))}
                placeholder="10 / 30 / 40"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="lg:col-span-1">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Adding..." : "Add"}
              </button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Quick add
            </span>

            {courseType === "lab" ? (
              <>
                <QuickPill label="Lab Assessment (10)" onClick={() => quickAdd("Lab Assessment", 10, "lab")} />
                <QuickPill label="Mid (30)" onClick={() => quickAdd("Mid", 30, "mid")} />
                <QuickPill label="Final (40)" onClick={() => quickAdd("Final", 40, "final")} />
                <QuickPill label="Attendance (5)" onClick={() => quickAdd("Attendance", 5, "attendance")} />
              </>
            ) : (
              <>
                <QuickPill label="CT1 (10)" onClick={() => quickAdd("CT1", 10, "ct")} />
                <QuickPill label="CT2 (10)" onClick={() => quickAdd("CT2", 10, "ct")} />
                <QuickPill label="Mid (30)" onClick={() => quickAdd("Mid", 30, "mid")} />
                <QuickPill label="Final (40)" onClick={() => quickAdd("Final", 40, "final")} />
                <QuickPill label="Presentation (10)" onClick={() => quickAdd("Presentation", 10, "presentation")} />
                <QuickPill label="Assignment (10)" onClick={() => quickAdd("Assignment", 10, "assignment")} />
                <QuickPill label="Attendance (5)" onClick={() => quickAdd("Attendance", 5, "attendance")} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between dark:border-slate-800">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Existing Assessments
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredAssessments.length} of {assessments.length}
              {!canReorder && (
                <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Clear search to reorder
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name / type / marks..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 md:w-[300px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <span className="absolute left-3 top-3.5 text-slate-400 dark:text-slate-500">
              <SearchIcon />
            </span>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
            Loading assessments...
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No assessments found.
          </div>
        ) : (
          <ul className="space-y-3 p-4">
            {filteredAssessments.map((a) => {
              const type = classifyForBadge(a?.name, courseType);

              return (
                <li
                  key={a._id}
                  draggable={canReorder}
                  onDragStart={() => setDragId(String(a._id))}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (!canReorder) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!canReorder) return;
                    e.preventDefault();
                    handleDrop(String(a._id));
                  }}
                  className={[
                    "rounded-2xl border px-4 py-4 transition",
                    "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
                    canReorder
                      ? "cursor-move border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                      : "cursor-default border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
                    dragId === String(a._id)
                      ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                      : "",
                  ].join(" ")}
                  title={canReorder ? "Drag to reorder" : "Clear search to reorder"}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                        {a.name}
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(
                          type
                        )}`}
                      >
                        {badgeLabel(type)}
                      </span>

                      {canReorder && (
                        <span className="ml-1 text-slate-400 dark:text-slate-500" title="Drag handle">
                          <GripIcon />
                        </span>
                      )}
                    </div>

                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Used in marks entry table
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      Full Marks: <span className="font-semibold">{a.fullMarks}</span>
                    </div>

                    <button
                      type="button"
                      disabled={busyId === a._id}
                      onClick={() => removeAssessment(a._id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                      title="Delete"
                    >
                      <XIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Tip: drag and drop to sort. Clear search first to enable reordering.
        </div>
      </div>
    </div>
  );
}

function QuickPill({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {label}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 6h.01M10 12h.01M10 18h.01" />
      <path d="M14 6h.01M14 12h.01M14 18h.01" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}