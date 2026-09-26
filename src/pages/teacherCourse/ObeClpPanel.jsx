import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  getObeClp,
  saveObeClpMarks,
  saveObeClpSetup,
} from "../../services/obeService";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/10";

const toast = (icon, title) =>
  Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 1800,
  });

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const preferredCo = (courseOutcomes = [], preferred = "CO1") => {
  const codes = (courseOutcomes || []).map((row) => String(row.code || "").toUpperCase());
  if (codes.includes(preferred)) return preferred;
  return codes[0] || "";
};

const normalizeSources = (item = {}) => {
  const values = [
    ...(Array.isArray(item.sourceAssessments) ? item.sourceAssessments : []),
    item.sourceAssessment,
  ]
    .map((value) => String(value || ""))
    .filter(Boolean);
  return [...new Set(values)];
};

const makeRecommendedItems = (courseOutcomes = []) => {
  const coCode = preferredCo(courseOutcomes, "CO1");
  return Array.from({ length: 5 }, (_, index) => ({
    key: `clp${index + 1}`,
    label: `CLP${index + 1}`,
    marks: 5,
    coCode,
    sourceAssessment: "",
    sourceAssessments: [],
    order: index,
  }));
};

export default function ObeClpPanel({ courseId, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [savingSetup, setSavingSetup] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [attendanceCoCode, setAttendanceCoCode] = useState("CO3");
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const response = await getObeClp(courseId);
      setData(response);
      const courseOutcomes = response?.courseOutcomes || [];
      setAttendanceCoCode(
        response?.attendanceCoCode || preferredCo(courseOutcomes, "CO3")
      );
      setItems(
        response?.items?.length
          ? response.items.map((item, index) => ({
              ...item,
              sourceAssessments: normalizeSources(item),
              order: index,
            }))
          : makeRecommendedItems(courseOutcomes)
      );

      const nextDraft = {};
      (response?.students || []).forEach((student) => {
        (response?.items || []).forEach((item) => {
          const value = student?.values?.[item.key];
          nextDraft[`${student.studentId}__${item.key}`] =
            value === null || value === undefined ? "" : String(value);
        });
      });
      setDraft(nextDraft);
      setDirty({});
    } catch (error) {
      console.error(error);
      toast("error", error?.response?.data?.message || "Failed to load CLP setup.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const totalMarks = useMemo(
    () => round2(items.reduce((sum, item) => sum + Number(item.marks || 0), 0)),
    [items]
  );

  const sourceAssessmentMap = useMemo(
    () => new Map((data?.sourceAssessments || []).map((row) => [String(row.id), row])),
    [data?.sourceAssessments]
  );

  const updateItem = (index, key, value) => {
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      )
    );
  };

  const addItem = () => {
    const used = new Set(items.map((item) => String(item.key)));
    let number = 1;
    while (used.has(`clp${number}`)) number += 1;
    const coCode = preferredCo(data?.courseOutcomes || [], "CO1");
    setItems((prev) => [
      ...prev,
      {
        key: `clp${number}`,
        label: `CLP${number}`,
        marks: 5,
        coCode,
        sourceAssessment: "",
        sourceAssessments: [],
        order: prev.length,
      },
    ]);
  };

  const resetRecommended = () => {
    setItems(makeRecommendedItems(data?.courseOutcomes || []));
  };

  const chooseSources = async (index, item) => {
    const options = data?.sourceAssessments || [];
    if (!options.length) {
      toast("info", "No Individual Lab Assessment is available to map yet.");
      return;
    }

    const selected = new Set(normalizeSources(item));
    const result = await Swal.fire({
      title: `Map ${item.label || `CLP${index + 1}`}`,
      width: 620,
      html: `
        <div style="text-align:left">
          <p style="margin:0 0 12px;color:#64748b;font-size:13px;line-height:1.55">
            Select one or multiple normal marksheet assessments. Their obtained marks are added first, then normalized to this CLP's assigned mark.
          </p>
          <div style="max-height:330px;overflow:auto;border:1px solid #e2e8f0;border-radius:14px;padding:8px">
            ${options
              .map(
                (assessment) => `
                  <label style="display:flex;align-items:center;gap:10px;padding:10px 9px;border-radius:10px;cursor:pointer">
                    <input class="clp-source-check" type="checkbox" value="${escapeHtml(assessment.id)}" ${selected.has(String(assessment.id)) ? "checked" : ""} />
                    <span style="display:flex;flex:1;justify-content:space-between;gap:12px;font-size:13px;color:#334155">
                      <strong>${escapeHtml(assessment.name)}</strong>
                      <span style="color:#64748b">${escapeHtml(assessment.fullMarks)} marks</span>
                    </span>
                  </label>
                `
              )
              .join("")}
          </div>
          <div style="margin-top:10px;color:#64748b;font-size:12px;line-height:1.5">
            Formula: <strong>(sum of obtained marks ÷ sum of selected full marks) × CLP assigned mark</strong>.
            Leave every option unchecked for manual entry only.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Use selected",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#4f46e5",
      preConfirm: () =>
        [...document.querySelectorAll(".clp-source-check:checked")].map(
          (checkbox) => checkbox.value
        ),
    });

    if (!result.isConfirmed) return;
    updateItem(index, "sourceAssessments", result.value || []);
  };

  const saveSetup = async () => {
    try {
      setSavingSetup(true);
      await saveObeClpSetup(courseId, {
        attendanceCoCode,
        items: items.map((item, index) => ({
          ...item,
          sourceAssessment: normalizeSources(item)[0] || "",
          sourceAssessments: normalizeSources(item),
          marks: Number(item.marks || 0),
          order: index,
        })),
      });
      toast("success", "CLP setup saved.");
      await load();
      await onSaved?.();
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Could not save CLP setup",
        text: error?.response?.data?.message || "Please review the CLP setup.",
      });
    } finally {
      setSavingSetup(false);
    }
  };

  const setManualValue = (studentId, itemKey, value) => {
    const key = `${studentId}__${itemKey}`;
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => ({ ...prev, [key]: true }));
  };

  const saveManualMarks = async () => {
    const grouped = new Map();
    Object.keys(dirty).forEach((compoundKey) => {
      if (!dirty[compoundKey]) return;
      const splitAt = compoundKey.indexOf("__");
      const studentId = compoundKey.slice(0, splitAt);
      const clpKey = compoundKey.slice(splitAt + 2);
      const raw = draft[compoundKey];
      const obtainedMarks = String(raw ?? "").trim() === "" ? null : Number(raw);
      if (!grouped.has(studentId)) grouped.set(studentId, []);
      grouped.get(studentId).push({ clpKey, obtainedMarks });
    });

    const records = [...grouped.entries()].map(([studentId, entries]) => ({
      studentId,
      entries,
    }));
    if (!records.length) {
      toast("info", "No CLP changes to save.");
      return;
    }

    try {
      setSavingMarks(true);
      await saveObeClpMarks(courseId, { records });
      toast("success", "CLP marks saved.");
      await load();
      await onSaved?.();
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Could not save CLP marks",
        text: error?.response?.data?.message || "Please review the entered marks.",
      });
    } finally {
      setSavingMarks(false);
    }
  };

  const getDisplayedTotal = (student) =>
    round2(
      (data?.items || []).reduce((sum, item) => {
        const raw = draft[`${student.studentId}__${item.key}`];
        const numeric = Number(raw);
        return sum + (Number.isFinite(numeric) ? numeric : 0);
      }, 0)
    );

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Loading CLP mapping...
      </div>
    );
  }

  const courseOutcomes = data?.courseOutcomes || [];
  const savedItems = data?.items || [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Continuous Lab Performance (CLP)</h3>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Map each CLP to one or multiple Individual Lab Assessments. When multiple assessments are selected, their marks are summed and normalized automatically to the CLP mark you assign. Five CLPs of 5 marks each are recommended, but any number can be used as long as the total is 25. CLPs sharing the same CO are combined in the final GradeSheet.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetRecommended}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reset to 5 CLPs
            </button>
            <button
              type="button"
              onClick={addItem}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              + Add CLP
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(220px,320px)_1fr] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Attendance CO</span>
            <select
              className={inputClass}
              value={attendanceCoCode}
              onChange={(event) => setAttendanceCoCode(event.target.value)}
            >
              {courseOutcomes.map((co) => (
                <option key={co.code} value={co.code}>{co.code}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-400">CO3 is suggested by default.</span>
          </label>

          <div className="flex items-center justify-end gap-3">
            <span className={[
              "rounded-full px-3 py-1.5 text-xs font-black",
              Math.abs(totalMarks - 25) < 0.001
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
            ].join(" ")}>
              CLP Total: {totalMarks} / 25
            </span>
            <button
              type="button"
              onClick={saveSetup}
              disabled={savingSetup}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingSetup ? "Saving..." : "Save CLP Setup"}
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-3 py-3">CLP</th>
                <th className="px-3 py-3">Marks</th>
                <th className="px-3 py-3">CO</th>
                <th className="px-3 py-3">Fetch From Normal Marksheet</th>
                <th className="w-16 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item, index) => {
                const selectedIds = normalizeSources(item);
                const selectedSources = selectedIds
                  .map((id) => sourceAssessmentMap.get(String(id)))
                  .filter(Boolean);
                const sourceTotal = round2(
                  selectedSources.reduce((sum, row) => sum + Number(row.fullMarks || 0), 0)
                );
                return (
                  <tr key={item.key}>
                    <td className="px-3 py-2.5">
                      <input
                        className={inputClass}
                        value={item.label}
                        onChange={(event) => updateItem(index, "label", event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.marks}
                        onChange={(event) => updateItem(index, "marks", event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        className={inputClass}
                        value={item.coCode}
                        onChange={(event) => updateItem(index, "coCode", event.target.value)}
                      >
                        <option value="">Select CO</option>
                        {courseOutcomes.map((co) => (
                          <option key={co.code} value={co.code}>{co.code}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => chooseSources(index, item)}
                        className={`${inputClass} text-left`}
                      >
                        {selectedSources.length
                          ? `${selectedSources.length} selected · ${sourceTotal} source marks`
                          : "Manual entry / no mapping"}
                      </button>
                      {!!selectedSources.length && (
                        <div className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          <div className="truncate" title={selectedSources.map((row) => row.name).join(" + ")}>
                            {selectedSources.map((row) => row.name).join(" + ")}
                          </div>
                          <div className="font-semibold text-indigo-600 dark:text-indigo-300">
                            Formula: Σ obtained / {sourceTotal} × {Number(item.marks || 0)}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                        className="rounded-lg border border-rose-200 px-2.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">CLP Marksheet</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Mapped marks are fetched and scaled automatically, but every cell remains editable. Editing an auto-fetched value saves a faculty override. A mismatch warning is shown against the normal marksheet Lab Evaluation total, but saving is still allowed.
            </p>
          </div>
          <button
            type="button"
            onClick={saveManualMarks}
            disabled={savingMarks || !savedItems.length}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {savingMarks ? "Saving..." : "Save CLP Marks"}
          </button>
        </div>

        {!savedItems.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Save the CLP setup first. Until then, OBE output uses the normal marksheet’s combined 25-mark Lab Evaluation as the CLP total.
          </div>
        ) : (
          <div className="mt-5 max-h-[65vh] overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-950">
                <tr>
                  <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-950">Roll / Name</th>
                  {savedItems.map((item) => (
                    <th key={item.key} className="border-b border-slate-200 px-3 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-500 dark:border-slate-700">
                      {item.label}<br />
                      <span className="font-semibold normal-case tracking-normal text-slate-400">{item.coCode} · {item.marks}</span>
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-500 dark:border-slate-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {(data?.students || []).map((student) => {
                  const displayedTotal = getDisplayedTotal(student);
                  const normalTotal = Number(student?.normalLabEvaluation);
                  const hasNormalTotal = Number.isFinite(normalTotal);
                  const mismatch = hasNormalTotal && Math.abs(displayedTotal - normalTotal) > 1e-9;
                  return (
                    <tr key={student.studentId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                        <div className="font-bold text-slate-800 dark:text-slate-100">{student.roll}</div>
                        <div className="text-xs text-slate-500">{student.name}</div>
                        {mismatch && (
                          <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5 text-[10px] font-bold leading-[1.35] text-orange-800 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-200">
                            ⚠ CLP mismatch: Marks {normalTotal}/25, CLP {displayedTotal}/25.
                          </div>
                        )}
                      </td>
                      {savedItems.map((item) => {
                        const compoundKey = `${student.studentId}__${item.key}`;
                        const mode = student?.modes?.[item.key] || "unmapped";
                        const value = draft[compoundKey] ?? "";
                        const isDirty = Boolean(dirty[compoundKey]);
                        return (
                          <td key={compoundKey} className="border-b border-slate-100 px-3 py-2.5 text-center dark:border-slate-800">
                            <input
                              type="number"
                              min="0"
                              max={item.marks}
                              step="0.5"
                              value={value}
                              onChange={(event) => setManualValue(student.studentId, item.key, event.target.value)}
                              className={`${inputClass} mx-auto max-w-[92px] text-center ${mode === "mapped" && !isDirty ? "bg-emerald-50/50 dark:bg-emerald-500/5" : ""}`}
                            />
                            <div className="mt-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                              {isDirty ? (
                                <span className="text-indigo-600 dark:text-indigo-300">Override pending</span>
                              ) : mode === "mapped" ? (
                                <span className="text-emerald-600 dark:text-emerald-300">Auto · editable</span>
                              ) : mode === "manual" ? (
                                <>
                                  <span className="text-indigo-600 dark:text-indigo-300">Manual override</span>
                                  <button
                                    type="button"
                                    className="text-slate-400 underline hover:text-slate-600"
                                    onClick={() => setManualValue(student.studentId, item.key, "")}
                                  >
                                    clear
                                  </button>
                                </>
                              ) : mode === "missing-source-mark" ? (
                                <span className="text-amber-600 dark:text-amber-300">Source mark missing</span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-300">Manual entry</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className={`border-b border-slate-100 px-3 py-2.5 text-center font-black dark:border-slate-800 ${mismatch ? "text-orange-700 dark:text-orange-300" : "text-slate-800 dark:text-slate-100"}`}>
                        {mismatch ? "⚠ " : ""}{displayedTotal} / 25
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
