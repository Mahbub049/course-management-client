import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { updateCourseRequest } from "../../services/courseService";

function normalizeCtPolicy(course) {
  const raw = course?.classTestPolicy || {};
  return {
    mode: raw.mode || "best_n_average_scaled",
    bestCount:
      Number(raw.bestCount) > 0
        ? Number(raw.bestCount)
        : raw.mode === "best_one_scaled"
          ? 1
          : 2,
    totalWeight: Number(raw.totalWeight) >= 0 ? Number(raw.totalWeight) : 15,
    manualSelectedAssessmentIds: Array.isArray(raw.manualSelectedAssessmentIds)
      ? raw.manualSelectedAssessmentIds.map(String)
      : [],
  };
}

function normalizeAssignmentPolicy(course) {
  const raw = course?.assignmentPolicy || {};
  return {
    mode:
      raw.mode === "proportional_full_marks"
        ? "proportional_full_marks"
        : "equal_parts_scaled",
    totalWeight: Number(raw.totalWeight) >= 0 ? Number(raw.totalWeight) : 10,
  };
}

function isClassTestAssessment(assessment) {
  const name = String(assessment?.name || "").trim().toLowerCase();
  return (
    name.includes("class test") ||
    name.includes("class-test") ||
    /(^|\s|[-_])ct\s*[-_]?\s*\d*/i.test(name) ||
    name.includes("quiz")
  );
}

function ctPolicySummary(policy) {
  const total = Number(policy?.totalWeight ?? 15);
  if (policy?.mode === "best_one_scaled") {
    return `Best 1 CT scaled to ${total}`;
  }
  if (policy?.mode === "manual_average_scaled") {
    return `Average of selected CTs scaled to ${total}`;
  }
  if (policy?.mode === "best_n_individual_scaled") {
    return `Best ${Number(policy?.bestCount || 2)} CTs individually scaled to ${total}`;
  }
  return `Average of best ${Number(policy?.bestCount || 2)} CTs scaled to ${total}`;
}

export default function CourseAssessmentPolicyModal({
  open,
  onClose,
  courseId,
  course,
  assessments = [],
  onCourseUpdated,
}) {
  const [ctPolicy, setCtPolicy] = useState(() => normalizeCtPolicy(course));
  const [assignmentPolicy, setAssignmentPolicy] = useState(() =>
    normalizeAssignmentPolicy(course)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCtPolicy(normalizeCtPolicy(course));
    setAssignmentPolicy(normalizeAssignmentPolicy(course));
  }, [open, course]);

  const ctAssessments = useMemo(
    () => (assessments || []).filter(isClassTestAssessment),
    [assessments]
  );

  if (!open) return null;

  const savePolicies = async () => {
    const totalWeight = Math.max(0, Number(ctPolicy.totalWeight ?? 15));

    if (totalWeight > 15) {
      await Swal.fire({
        icon: "warning",
        title: "CT weight limit exceeded",
        text: "The Class Test category can contribute a maximum of 15 marks.",
      });
      return;
    }

    if (
      ctPolicy.mode === "manual_average_scaled" &&
      !(ctPolicy.manualSelectedAssessmentIds || []).length
    ) {
      await Swal.fire({
        icon: "warning",
        title: "Select at least one Class Test",
        text: "Manual CT policy needs at least one CT to be selected.",
      });
      return;
    }

    try {
      setSaving(true);
      const updated = await updateCourseRequest(courseId, {
        classTestPolicy: {
          mode: ctPolicy.mode,
          bestCount:
            ctPolicy.mode === "best_one_scaled"
              ? 1
              : Math.max(1, Number(ctPolicy.bestCount || 2)),
          totalWeight,
          manualSelectedAssessmentIds:
            ctPolicy.mode === "manual_average_scaled"
              ? (ctPolicy.manualSelectedAssessmentIds || []).map(String)
              : [],
        },
        assignmentPolicy: {
          mode: assignmentPolicy.mode,
          totalWeight: 10,
        },
      });

      if (typeof onCourseUpdated === "function") {
        onCourseUpdated(updated);
      }

      await Swal.fire({
        icon: "success",
        title: "Assessment policies updated",
        text: "The same Class Test and Assignment policies will be used by Marks and OBE CO-PO.",
        timer: 1500,
        showConfirmButton: false,
      });
      onClose?.();
    } catch (error) {
      console.error(error);
      await Swal.fire({
        icon: "error",
        title: "Update failed",
        text:
          error?.response?.data?.message ||
          "Failed to update the assessment policies.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close assessment policy settings"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        onClick={() => !saving && onClose?.()}
      />

      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/60 px-5 py-5 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30 sm:px-7">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
              Shared Marks Rules
            </div>
            <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">
              Assessment Policies
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              These settings are shared by the regular Marks sheet and OBE CO-PO so both calculate the same final result.
            </p>
          </div>

          <button
            type="button"
            onClick={() => !saving && onClose?.()}
            disabled={saving}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="overflow-hidden rounded-3xl border border-violet-200 bg-violet-50/50 dark:border-violet-500/20 dark:bg-violet-500/[0.06]">
              <div className="border-b border-violet-200/80 px-5 py-4 dark:border-violet-500/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-black text-slate-900 dark:text-slate-100">
                    Class Test Policy
                  </h4>
                  <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700 dark:border-violet-500/20 dark:bg-slate-900 dark:text-violet-300">
                    Total 15
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {ctPolicySummary(ctPolicy)}
                </p>
              </div>

              <div className="space-y-4 p-5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Calculation Method
                  </span>
                  <select
                    value={ctPolicy.mode}
                    onChange={(event) =>
                      setCtPolicy((prev) => ({
                        ...prev,
                        mode: event.target.value,
                        bestCount:
                          event.target.value === "best_one_scaled"
                            ? 1
                            : prev.bestCount,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="best_n_average_scaled">Average of best N CTs</option>
                    <option value="best_n_individual_scaled">Best N CTs individually scaled</option>
                    <option value="best_one_scaled">Best 1 CT only</option>
                    <option value="manual_average_scaled">Average of manually selected CTs</option>
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      CTs to Count
                    </span>
                    <input
                      type="number"
                      min="1"
                      disabled={
                        ctPolicy.mode === "best_one_scaled" ||
                        ctPolicy.mode === "manual_average_scaled"
                      }
                      value={
                        ctPolicy.mode === "best_one_scaled"
                          ? 1
                          : ctPolicy.bestCount
                      }
                      onChange={(event) =>
                        setCtPolicy((prev) => ({
                          ...prev,
                          bestCount: Math.max(1, Number(event.target.value || 1)),
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Category Total
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="15"
                      step="0.5"
                      value={ctPolicy.totalWeight}
                      onChange={(event) =>
                        setCtPolicy((prev) => ({
                          ...prev,
                          totalWeight: Number(event.target.value || 0),
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                </div>

                {ctPolicy.mode === "manual_average_scaled" && (
                  <div className="rounded-2xl border border-violet-200 bg-white p-3 dark:border-violet-500/20 dark:bg-slate-950/70">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      CTs included in this policy
                    </div>
                    {!ctAssessments.length ? (
                      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                        No regular Marks-sheet CT assessments exist yet. Create the CT assessments first, then select them here.
                      </p>
                    ) : (
                      <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                        {ctAssessments.map((assessment) => {
                          const id = String(assessment._id);
                          const checked = (ctPolicy.manualSelectedAssessmentIds || []).includes(id);
                          return (
                            <label
                              key={id}
                              className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-700 transition hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-500/40"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  setCtPolicy((prev) => {
                                    const ids = prev.manualSelectedAssessmentIds || [];
                                    return {
                                      ...prev,
                                      manualSelectedAssessmentIds: event.target.checked
                                        ? [...ids, id]
                                        : ids.filter((value) => value !== id),
                                    };
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                              />
                              <span className="font-semibold">{assessment.name}</span>
                              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                                {assessment.fullMarks}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-amber-200 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
              <div className="border-b border-amber-200/80 px-5 py-4 dark:border-amber-500/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-black text-slate-900 dark:text-slate-100">
                    Assignment Policy
                  </h4>
                  <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700 dark:border-amber-500/20 dark:bg-slate-900 dark:text-amber-300">
                    Total 10
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Assignment and Presentation are parts of one 10-mark category.
                </p>
              </div>

              <div className="space-y-4 p-5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Calculation Method
                  </span>
                  <select
                    value={assignmentPolicy.mode}
                    onChange={(event) =>
                      setAssignmentPolicy((prev) => ({
                        ...prev,
                        mode: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="equal_parts_scaled">Equal parts when multiple components exist</option>
                    <option value="proportional_full_marks">Use created full-mark breakdown proportionally</option>
                  </select>
                </label>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <strong>Single component rule:</strong> if you create only one Assignment <em>or</em> only one Presentation, that single component contributes the full <strong>10 marks</strong>. It is not reduced to 5.
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                  {assignmentPolicy.mode === "equal_parts_scaled" ? (
                    <>
                      When Assignment and Presentation both exist, the 10-mark category is split equally (5 + 5).
                    </>
                  ) : (
                    <>
                      When Assignment and Presentation both exist, their created full marks decide their share of the 10-mark category. A single component still receives the full 10 marks.
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/70 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            Saving here updates both regular Marks and OBE CO-PO calculation rules.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => !saving && onClose?.()}
              disabled={saving}
              className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={savePolicies}
              disabled={saving}
              className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Policies"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
