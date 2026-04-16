import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import { saveAs } from "file-saver";

import { getCourseStudents } from "../../services/enrollmentService";
import {
  fetchMarksForCourse,
  saveMarksForCourseRequest,
} from "../../services/markService";
import {
  fetchAssessmentsForCourse,
  publishAssessmentRequest,
} from "../../services/assessmentService";
import { fetchAttendanceSummary } from "../../services/attendanceSummaryService";

function getCourseType(course) {
  const t = (course?.courseType || course?.type || "").toLowerCase();
  if (t.includes("lab")) return "lab";
  return "theory";
}

function round2(num) {
  return Math.round(Number(num || 0) * 100) / 100;
}

function clamp(n, min, max) {
  const x = Number(n ?? 0);
  return Math.max(min, Math.min(max, x));
}

function pct(obt, full) {
  const o = Number(obt ?? 0);
  const f = Number(full ?? 0);
  if (f <= 0) return 0;
  return clamp(o, 0, f) / f;
}

function gradeFromTotal(total) {
  const t = Number(total || 0);
  if (t >= 80) return "A+";
  if (t >= 75) return "A";
  if (t >= 70) return "A-";
  if (t >= 65) return "B+";
  if (t >= 60) return "B";
  if (t >= 55) return "B-";
  if (t >= 50) return "C+";
  if (t >= 45) return "C";
  if (t >= 40) return "D";
  return "F";
}

function roundPolicyTotal(total) {
  return total % 1 === 0
    ? total
    : total % 1 <= 0.5
      ? Math.floor(total) + 0.5
      : Math.ceil(total);
}

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
    totalWeight:
      Number(raw.totalWeight) >= 0 ? Number(raw.totalWeight) : 15,
    manualSelectedAssessmentIds: Array.isArray(raw.manualSelectedAssessmentIds)
      ? raw.manualSelectedAssessmentIds.map(String)
      : [],
  };
}

function isCtAssessment(nameRaw) {
  const n = String(nameRaw || "").toLowerCase().trim();

  if (n.includes("mid") || n.includes("final") || n.includes("att")) return false;
  if (n.includes("assign") || n.includes("present")) return false;

  const compact = n.replace(/[\s\-_]+/g, "");

  if (compact.startsWith("ct")) return true;
  if (compact.includes("classtest")) return true;
  if (n.includes("class test")) return true;
  if (n.includes("quiz")) return true;
  if (n.includes("test")) return true;

  return false;
}

function computeCtScore(course, assessments, rowMarks) {
  const policy = normalizeCtPolicy(course);
  const totalWeight = Number(policy.totalWeight || 15);

  const ctRows = (assessments || [])
    .filter((a) => a?.structureType !== "lab_final")
    .filter((a) => isCtAssessment(a?.name))
    .map((a) => ({
      id: String(a._id),
      percent: pct(getMainMarkValue(rowMarks?.[a._id]), a.fullMarks),
    }));

  if (!ctRows.length || totalWeight <= 0) return 0;

  if (policy.mode === "manual_average_scaled") {
    const selected = ctRows.filter((r) =>
      policy.manualSelectedAssessmentIds.includes(r.id)
    );

    if (!selected.length) return 0;

    const avg =
      selected.reduce((sum, item) => sum + item.percent, 0) / selected.length;

    return avg * totalWeight;
  }

  const sorted = [...ctRows].sort((a, b) => b.percent - a.percent);

  if (policy.mode === "best_one_scaled") {
    return (sorted[0]?.percent || 0) * totalWeight;
  }

  const count = Math.max(1, Number(policy.bestCount || 2));
  const chosen = sorted.slice(0, count);

  if (!chosen.length) return 0;

  const avg =
    chosen.reduce((sum, item) => sum + item.percent, 0) / chosen.length;

  return avg * totalWeight;
}

function getMainMarkValue(cellValue) {
  if (cellValue == null) return 0;
  if (typeof cellValue === "object") return Number(cellValue.obtainedMarks || 0);
  return Number(cellValue || 0);
}

function getSubMarkMap(cellValue) {
  if (!cellValue || typeof cellValue !== "object") return {};
  return cellValue.subMarks || {};
}

function buildSubMarkMap(subMarksArray = []) {
  const map = {};
  (subMarksArray || []).forEach((item) => {
    if (!item?.key) return;
    map[item.key] = Number(item.obtainedMarks || 0);
  });
  return map;
}

function advancedAssessmentItems(assessment) {
  const config = assessment?.labFinalConfig || {};
  const mode = config.mode;
  const items = [];

  if (mode === "project_only" || mode === "mixed") {
    (config.projectComponents || []).forEach((component) => {
      if (component.entryMode === "phased") {
        (component.phases || []).forEach((phase) => {
          items.push({
            key: phase.key,
            label: `${component.name} - ${phase.name}`,
            fullMarks: Number(phase.marks || 0),
            group: component.name,
            section: "Project",
          });
        });
      } else {
        items.push({
          key: component.key,
          label: component.name,
          fullMarks: Number(component.marks || 0),
          group: "Project",
          section: "Project",
        });
      }
    });
  }

  if (mode === "lab_exam_only" || mode === "mixed") {
    (config.examQuestions || []).forEach((q) => {
      items.push({
        key: q.key,
        label: q.label,
        fullMarks: Number(q.marks || 0),
        group: "Lab Final",
        section: "Lab Final",
      });
    });
  }

  return items;
}

function getAdvancedExportColumns(assessment) {
  const items = advancedAssessmentItems(assessment);

  return items.map((item) => ({
    key: item.key,
    label: `${assessment.name} → ${item.label}`,
    fullMarks: item.fullMarks,
  }));
}

function calculateAdvancedObtained(assessment, subMarksMap) {
  const items = advancedAssessmentItems(assessment);
  return round2(
    items.reduce((sum, item) => {
      const value = Number(subMarksMap?.[item.key] || 0);
      return sum + clamp(value, 0, item.fullMarks);
    }, 0)
  );
}

function getLabMain(assessments, rowMarks) {
  const list = Array.isArray(assessments) ? assessments : [];

  const regularLabAssessments = list.filter((a) => {
    const n = String(a?.name || "").toLowerCase();
    return (
      a?.structureType !== "lab_final" &&
      !n.includes("mid") &&
      !n.includes("final") &&
      !n.includes("att")
    );
  });

  if (!regularLabAssessments.length) return 0;

  const avgPercent =
    regularLabAssessments.reduce(
      (sum, a) => sum + pct(getMainMarkValue(rowMarks?.[a._id]), a.fullMarks),
      0
    ) / regularLabAssessments.length;

  return roundPolicyTotal(avgPercent * 25);
}

function computeTotal100(course, assessments, rowMarks, attendanceMarks5 = 0) {
  const courseType = getCourseType(course);
  const list = Array.isArray(assessments) ? assessments : [];
  const name = (a) => String(a?.name || "").toLowerCase();

  const attScore5 = clamp(attendanceMarks5, 0, 5);

  if (courseType === "lab") {
    const labList = list.filter((a) => {
      const n = name(a);
      return (
        a?.structureType !== "lab_final" &&
        !n.includes("mid") &&
        !n.includes("final") &&
        !n.includes("att")
      );
    });

    const mid = list.find((a) => name(a).includes("mid"));
    const advancedFinal = list.find((a) => a?.structureType === "lab_final");
    const regularFinal = list.find(
      (a) => a?.structureType !== "lab_final" && name(a).includes("final")
    );
    const finalAssessment = advancedFinal || regularFinal;

    const labPercents = labList.map((a) =>
      pct(getMainMarkValue(rowMarks?.[a._id]), a.fullMarks)
    );

    const avgLab = labPercents.length
      ? labPercents.reduce((s, v) => s + v, 0) / labPercents.length
      : 0;

    const labScore25 = avgLab * 25;
    const midScore30 = mid
      ? pct(getMainMarkValue(rowMarks?.[mid._id]), mid.fullMarks) * 30
      : 0;
    const finalScore40 = finalAssessment
      ? pct(getMainMarkValue(rowMarks?.[finalAssessment._id]), finalAssessment.fullMarks) * 40
      : 0;

    return roundPolicyTotal(labScore25 + midScore30 + finalScore40 + attScore5);
  }

  const mid = list.find((a) => name(a).includes("mid"));
  const final = list.find((a) => name(a).includes("final"));
  const presentation = list.find((a) => name(a).includes("present"));
  const assignment = list.find((a) => name(a).includes("assign"));

  const ctScore = computeCtScore(course, list, rowMarks);

  const midScore30 = mid
    ? pct(getMainMarkValue(rowMarks?.[mid._id]), mid.fullMarks) * 30
    : 0;
  const finalScore40 = final
    ? pct(getMainMarkValue(rowMarks?.[final._id]), final.fullMarks) * 40
    : 0;

  let paScore10 = 0;
  const hasP = !!presentation;
  const hasA = !!assignment;

  if (hasP && hasA) {
    const p5 = pct(getMainMarkValue(rowMarks?.[presentation._id]), presentation.fullMarks) * 5;
    const a5 = pct(getMainMarkValue(rowMarks?.[assignment._id]), assignment.fullMarks) * 5;
    paScore10 = p5 + a5;
  } else if (hasP) {
    paScore10 = pct(getMainMarkValue(rowMarks?.[presentation._id]), presentation.fullMarks) * 10;
  } else if (hasA) {
    paScore10 = pct(getMainMarkValue(rowMarks?.[assignment._id]), assignment.fullMarks) * 10;
  }

  return roundPolicyTotal(ctScore + midScore30 + finalScore40 + paScore10 + attScore5);
}

function GradeBadge({ grade }) {
  const cls =
    grade === "A+"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : grade === "A" || grade === "A-"
        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
        : grade === "B+" || grade === "B" || grade === "B-"
          ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
          : grade === "C+" || grade === "C"
            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            : grade === "D"
              ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";

  return (
    <span
      className={`inline-flex min-w-[56px] items-center justify-center rounded-full border px-3 py-1.5 text-xs font-bold ${cls}`}
    >
      {grade}
    </span>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function ControlSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={onChange}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AdvancedBreakdownModal({
  open,
  student,
  assessment,
  cellValue,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onSubMarkChange,
}) {
  if (!open || !student || !assessment) return null;

  const items = advancedAssessmentItems(assessment);
  const subMarks = getSubMarkMap(cellValue);
  const total = calculateAdvancedObtained(assessment, subMarks);

  const grouped = items.reduce((acc, item) => {
    const section = item.section || "Other";
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-semibold text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                  Advanced Lab Final Entry
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Full Marks: {assessment.fullMarks}
                </span>
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                  Current Total: {total}
                </span>
              </div>

              <h2 className="mt-3 truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {student.roll} - {student.name}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {assessment.name} • Use Previous / Next to move through students quickly.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                ← Previous Student
              </button>

              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
              >
                Next Student →
              </button>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No advanced breakdown found for this assessment.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([section, sectionItems]) => (
                <div
                  key={section}
                  className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40"
                >
                  <div className="border-b border-slate-200 bg-white/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {section}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Enter marks carefully. Values are limited to each item’s full marks.
                        </p>
                      </div>

                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {sectionItems.length} item{sectionItems.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
                    {sectionItems.map((item) => (
                      <div
                        key={item.key}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                              {item.label}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Group: {item.group} • Full marks: {item.fullMarks}
                            </div>
                          </div>

                          <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-xs font-bold text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                            / {item.fullMarks}
                          </span>
                        </div>

                        <div className="mt-4">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={subMarks[item.key] ?? ""}
                            onChange={(e) =>
                              onSubMarkChange(item.key, e.target.value, item.fullMarks)
                            }
                            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            placeholder="Enter marks"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Tip: press Enter for next student, Shift + Enter for previous student, or use the Previous / Next buttons.
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                Total Obtained: {total} / {assessment.fullMarks}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TabMarks({ courseId, course }) {
  const [students, setStudents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [marksMap, setMarksMap] = useState({});
  const [attMarksMap, setAttMarksMap] = useState({});

  const [loading, setLoading] = useState(true);
  const [marksError, setMarksError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishingAssessmentId, setPublishingAssessmentId] = useState(null);

  const [tabMode, setTabMode] = useState("row");
  const [sortMode, setSortMode] = useState("entered");

  const [advancedModal, setAdvancedModal] = useState({
    open: false,
    assessmentId: null,
    studentIndex: 0,
  });

  const inputRefs = useRef([]);
  const originalStudentsRef = useRef([]);

  const topScrollbarRef = useRef(null);
  const bottomScrollRef = useRef(null);
  const tableRef = useRef(null);

  const [topScrollbarWidth, setTopScrollbarWidth] = useState(1400);

  const courseType = getCourseType(course);

  useEffect(() => {
    const topEl = topScrollbarRef.current;
    const bottomEl = bottomScrollRef.current;

    if (!topEl || !bottomEl) return;

    let syncingFrom = null;

    const handleTopScroll = () => {
      if (syncingFrom === "bottom") return;
      syncingFrom = "top";
      bottomEl.scrollLeft = topEl.scrollLeft;
      syncingFrom = null;
    };

    const handleBottomScroll = () => {
      if (syncingFrom === "top") return;
      syncingFrom = "bottom";
      topEl.scrollLeft = bottomEl.scrollLeft;
      syncingFrom = null;
    };

    topEl.addEventListener("scroll", handleTopScroll);
    bottomEl.addEventListener("scroll", handleBottomScroll);

    return () => {
      topEl.removeEventListener("scroll", handleTopScroll);
      bottomEl.removeEventListener("scroll", handleBottomScroll);
    };
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      const width =
        tableRef.current?.scrollWidth ||
        bottomScrollRef.current?.scrollWidth ||
        1400;

      setTopScrollbarWidth(width);
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());

    if (tableRef.current) observer.observe(tableRef.current);
    if (bottomScrollRef.current) observer.observe(bottomScrollRef.current);

    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [students.length, assessments.length]);

  const loadAllData = async () => {
    setLoading(true);
    setMarksError("");

    let studentsData = [];
    let assessmentsData = [];

    try {
      const res = await Promise.all([
        getCourseStudents(courseId),
        fetchAssessmentsForCourse(courseId),
      ]);

      studentsData = res[0] || [];
      assessmentsData = res[1] || [];

      setStudents(studentsData);
      originalStudentsRef.current = studentsData;
      setAssessments(assessmentsData);
    } catch (e) {
      console.error(e);
      setMarksError(
        e?.response?.data?.message || "Failed to load students/assessments"
      );
      setStudents([]);
      originalStudentsRef.current = [];
      setAssessments([]);
      setMarksMap({});
      setAttMarksMap({});
      setLoading(false);
      return;
    }

    try {
      const [marksData, attSummary] = await Promise.allSettled([
        fetchMarksForCourse(courseId),
        fetchAttendanceSummary(courseId),
      ]);

      const map = {};

      if (marksData.status === "fulfilled") {
        (marksData.value || []).forEach((m) => {
          const sid = String(m.student);
          const aid = String(m.assessment);
          if (!map[sid]) map[sid] = {};
          map[sid][aid] = {
            obtainedMarks: Number(m.obtainedMarks || 0),
            subMarks: buildSubMarkMap(m.subMarks || []),
          };
        });
      }

      if (attSummary.status === "fulfilled") {
        const attRows = attSummary.value || [];

        const newAttMap = {};
        attRows.forEach((r) => {
          newAttMap[String(r.student)] = Number(r.marks ?? 0);
        });
        setAttMarksMap(newAttMap);

        const attendanceAssessment = (assessmentsData || []).find((a) =>
          String(a.name || "").toLowerCase().includes("att")
        );

        if (attendanceAssessment) {
          attRows.forEach((r) => {
            const sid = String(r.student);
            if (!map[sid]) map[sid] = {};
            map[sid][attendanceAssessment._id] = {
              obtainedMarks: Number(r.marks ?? 0),
              subMarks: {},
            };
          });
        }
      } else {
        setAttMarksMap({});
      }

      setMarksMap(map);
    } catch (e) {
      console.error(e);
      setMarksError("Failed to load marks/attendance summary");
      setMarksMap({});
      setAttMarksMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const sortedAssessments = useMemo(() => {
    return [...assessments].sort((a, b) => {
      const ao = Number(a.order ?? 0);
      const bo = Number(b.order ?? 0);
      if (ao !== bo) return ao - bo;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  }, [assessments]);

  const labRegularAssessments = useMemo(() => {
    return sortedAssessments.filter((a) => {
      const n = String(a.name || "").toLowerCase();
      return (
        a?.structureType !== "lab_final" &&
        !n.includes("mid") &&
        !n.includes("final") &&
        !n.includes("att")
      );
    });
  }, [sortedAssessments]);

  const advancedLabFinalAssessments = useMemo(() => {
    return sortedAssessments.filter((a) => a?.structureType === "lab_final");
  }, [sortedAssessments]);

  const advancedExportColumns = useMemo(() => {
    return advancedLabFinalAssessments.flatMap((assessment) =>
      getAdvancedExportColumns(assessment).map((col) => ({
        assessmentId: assessment._id,
        assessmentName: assessment.name,
        key: col.key,
        label: col.label,
        fullMarks: col.fullMarks,
      }))
    );
  }, [advancedLabFinalAssessments]);

  const ctAssessments = useMemo(() => {
    return sortedAssessments.filter(
      (a) => a?.structureType !== "lab_final" && isCtAssessment(a.name)
    );
  }, [sortedAssessments]);

  const nonCtAssessments = useMemo(() => {
    if (courseType === "lab") {
      return sortedAssessments.filter((a) => {
        const n = String(a?.name || "").toLowerCase();

        return (
          a?.structureType === "lab_final" ||
          n.includes("mid") ||
          n.includes("final") ||
          n.includes("att")
        );
      });
    }

    return sortedAssessments.filter(
      (a) => a?.structureType === "lab_final" || !isCtAssessment(a.name)
    );
  }, [sortedAssessments, courseType]);

  const enteredCount = useMemo(() => {
    let count = 0;
    Object.values(marksMap).forEach((row) => {
      Object.values(row || {}).forEach((cell) => {
        if (Number(getMainMarkValue(cell)) > 0) count += 1;
      });
    });
    return count;
  }, [marksMap]);

  const sortedStudents = useMemo(() => {
    const base = [...students];
    if (sortMode === "roll_asc") {
      return base.sort((a, b) => String(a.roll || "").localeCompare(String(b.roll || "")));
    }
    if (sortMode === "roll_desc") {
      return base.sort((a, b) => String(b.roll || "").localeCompare(String(a.roll || "")));
    }

    return [...originalStudentsRef.current];
  }, [students, sortMode]);

  const activeAdvancedAssessment = useMemo(() => {
    if (!advancedModal.assessmentId) return null;
    return assessments.find(
      (a) => String(a._id) === String(advancedModal.assessmentId)
    ) || null;
  }, [advancedModal.assessmentId, assessments]);

  const activeAdvancedStudent = useMemo(() => {
    return sortedStudents[advancedModal.studentIndex] || null;
  }, [sortedStudents, advancedModal.studentIndex]);

  const activeAdvancedCell = useMemo(() => {
    if (!activeAdvancedStudent || !activeAdvancedAssessment) return null;
    return (
      marksMap?.[activeAdvancedStudent.id]?.[activeAdvancedAssessment._id] || {
        obtainedMarks: 0,
        subMarks: {},
      }
    );
  }, [marksMap, activeAdvancedStudent, activeAdvancedAssessment]);

  const handleMarkChange = (studentId, assessmentId, value) => {
    const numericValue = value === "" ? "" : Number(value);

    setMarksMap((prev) => {
      const row = prev[studentId] || {};
      const oldCell = row[assessmentId] || { obtainedMarks: 0, subMarks: {} };

      return {
        ...prev,
        [studentId]: {
          ...row,
          [assessmentId]: {
            ...oldCell,
            obtainedMarks: numericValue === "" ? 0 : numericValue,
          },
        },
      };
    });
  };

  const handleAdvancedSubMarkChange = (
    studentId,
    assessment,
    subKey,
    value,
    fullMarks
  ) => {
    const raw = value === "" ? 0 : Number(value);
    const safeValue = clamp(raw, 0, Number(fullMarks || 0));

    setMarksMap((prev) => {
      const row = prev[studentId] || {};
      const oldCell = row[assessment._id] || { obtainedMarks: 0, subMarks: {} };
      const nextSubMarks = {
        ...(oldCell.subMarks || {}),
        [subKey]: safeValue,
      };
      const total = calculateAdvancedObtained(assessment, nextSubMarks);

      return {
        ...prev,
        [studentId]: {
          ...row,
          [assessment._id]: {
            obtainedMarks: total,
            subMarks: nextSubMarks,
          },
        },
      };
    });
  };

  const openAdvancedModal = (student, assessment) => {
    const index = sortedStudents.findIndex((s) => String(s.id) === String(student.id));
    setAdvancedModal({
      open: true,
      assessmentId: assessment._id,
      studentIndex: index >= 0 ? index : 0,
    });
  };

  const closeAdvancedModal = () => {
    setAdvancedModal({
      open: false,
      assessmentId: null,
      studentIndex: 0,
    });
  };

  const goPrevAdvancedStudent = () => {
    setAdvancedModal((prev) => ({
      ...prev,
      studentIndex: Math.max(0, prev.studentIndex - 1),
    }));
  };

  const goNextAdvancedStudent = () => {
    setAdvancedModal((prev) => ({
      ...prev,
      studentIndex: Math.min(sortedStudents.length - 1, prev.studentIndex + 1),
    }));
  };

  const handleKeyDown = (e) => {
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);

    if (Number.isNaN(row) || Number.isNaN(col)) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      inputRefs.current?.[row]?.[col + 1]?.focus();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      inputRefs.current?.[row]?.[col - 1]?.focus();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      inputRefs.current?.[row + 1]?.[col]?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      inputRefs.current?.[row - 1]?.[col]?.focus();
    }
  };

  useEffect(() => {
    if (!advancedModal.open) return;

    const onKey = (e) => {
      if (e.key === "Escape") {
        closeAdvancedModal();
        return;
      }

      if (e.key === "Enter") {
        const tag = String(e.target?.tagName || "").toLowerCase();
        const isInputLike =
          tag === "input" || tag === "textarea" || tag === "select";

        if (isInputLike) {
          e.preventDefault();

          if (e.shiftKey) {
            goPrevAdvancedStudent();
          } else {
            goNextAdvancedStudent();
          }
          return;
        }
      }

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevAdvancedStudent();
      }

      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goNextAdvancedStudent();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advancedModal.open, sortedStudents.length]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMarksError("");

      const payload = [];

      Object.entries(marksMap).forEach(([studentId, row]) => {
        Object.entries(row || {}).forEach(([assessmentId, cell]) => {
          const assessment = assessments.find((a) => String(a._id) === String(assessmentId));
          const obtainedMarks = Number(getMainMarkValue(cell) || 0);

          if (!assessment) return;

          const subMarksMap = getSubMarkMap(cell);
          const subMarks = Object.entries(subMarksMap).map(([key, obtained]) => ({
            key,
            obtainedMarks: Number(obtained || 0),
          }));

          payload.push({
            studentId,
            assessmentId,
            obtainedMarks,
            subMarks:
              assessment?.structureType === "lab_final" ? subMarks : [],
          });
        });
      });

      await saveMarksForCourseRequest(courseId, payload);

      Swal.fire({
        icon: "success",
        title: "Saved",
        text: "Marks saved successfully.",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e) {
      console.error(e);
      setMarksError(e?.response?.data?.message || "Failed to save marks");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (assessment) => {
    const assessmentId = assessment?._id;
    const wasPublished = Boolean(assessment?.isPublished);

    try {
      setPublishingAssessmentId(assessmentId);
      await publishAssessmentRequest(courseId, assessmentId);

      setAssessments((prev) =>
        prev.map((a) =>
          String(a._id) === String(assessmentId)
            ? { ...a, isPublished: true, publishedAt: new Date().toISOString() }
            : a
        )
      );

      Swal.fire({
        icon: "success",
        title: wasPublished ? "Republished" : "Published",
        text: wasPublished
          ? "Assessment republished successfully."
          : "Assessment published successfully.",
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: "error",
        title: wasPublished ? "Republish failed" : "Publish failed",
        text: e?.response?.data?.message || "Failed to publish assessment",
      });
    } finally {
      setPublishingAssessmentId(null);
    }
  };

  const handleExportExcel = () => {
    const header = [
      "Roll",
      "Student",
      ...(courseType === "lab"
        ? labRegularAssessments.map((a) => `${a.name} (${a.fullMarks})`)
        : ctAssessments.map((a) => `${a.name} (${a.fullMarks})`)),
      courseType === "lab" ? "Lab Assessment (Main) /25" : "CT Main /15",
      ...nonCtAssessments.map((a) => `${a.name} (${a.fullMarks})`),
      ...advancedExportColumns.map((col) => `${col.label} (${col.fullMarks})`),
      "Total /100",
      "Grade",
    ];

    const rows = sortedStudents.map((s) => {
      const row = marksMap[s.id] || {};
      const total = computeTotal100(
        course,
        assessments,
        row,
        Number(attMarksMap[s.id] || 0)
      );

      const advancedBreakdownValues = advancedExportColumns.map((col) => {
        const cell = row[col.assessmentId];
        const subMarksMap = getSubMarkMap(cell);
        return Number(subMarksMap?.[col.key] || 0);
      });

      return [
        s.roll || "",
        s.name || "",
        ...(courseType === "lab"
          ? labRegularAssessments.map((a) => getMainMarkValue(row[a._id]))
          : ctAssessments.map((a) => getMainMarkValue(row[a._id]))),
        courseType === "lab"
          ? getLabMain(assessments, row)
          : roundPolicyTotal(computeCtScore(course, assessments, row)),
        ...nonCtAssessments.map((a) => getMainMarkValue(row[a._id])),
        ...advancedBreakdownValues,
        Number(total).toFixed(1),
        gradeFromTotal(total),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    const colWidths = header.map((h) => {
      const len = String(h || "").length;
      return { wch: Math.min(Math.max(len + 4, 12), 30) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Marks");

    const excelBuffer = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    });

    const blob = new Blob([excelBuffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
    });

    const code = course?.code || "course";
    const section = course?.section || "section";
    const semester = course?.semester || "semester";
    const year = course?.year || "year";

    saveAs(blob, `${code}_Sec${section}_${semester}_${year}_Marksheet.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-6 py-5 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Marks Entry
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {courseType === "lab"
                  ? "Lab Assessment Main is calculated from regular lab assessments only. Advanced Lab Final now has a faster student-to-student entry flow."
                  : "Theory course marks entry with CT policy, Mid, Final, Assignment, Presentation, and Attendance."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MiniStat label="Students" value={students.length} />
              <MiniStat label="Assessments" value={assessments.length} />
              <MiniStat label="Entered Cells" value={enteredCount} />
              <MiniStat
                label="Advanced Finals"
                value={advancedLabFinalAssessments.length}
              />
            </div>
          </div>

          {marksError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {marksError}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ControlSelect
            label="Tab Mode"
            value={tabMode}
            onChange={(e) => setTabMode(e.target.value)}
            options={[
              { value: "row", label: "Row-wise Entry" },
              { value: "column", label: "Column-wise Entry" },
            ]}
          />

          <ControlSelect
            label="Student Sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            options={[
              { value: "entered", label: "Default / Entered Order" },
              { value: "roll_asc", label: "Roll Ascending" },
              { value: "roll_desc", label: "Roll Descending" },
            ]}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Marks Table
          </h4>
        </div>

        <div className="p-4 md:p-6">
          <div className="space-y-3">
            <div
              ref={topScrollbarRef}
              className="overflow-x-auto rounded-xl border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
            >
              <div
                style={{ width: `${topScrollbarWidth}px`, height: "18px" }}
                className="min-w-full"
              />
            </div>

            <div
              ref={bottomScrollRef}
              className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700"
            >
              <table ref={tableRef} className="min-w-full text-sm">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="sticky left-0 z-30 min-w-[110px] bg-slate-50 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Roll
                    </th>

                    <th className="sticky left-[110px] z-30 min-w-[220px] bg-slate-50 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Student
                    </th>

                    {(courseType === "lab" ? labRegularAssessments : ctAssessments).map(
                      (a) => (
                        <th
                          key={a._id}
                          className="min-w-[170px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                        >
                          <div className="space-y-2">
                            <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                              {a.name}
                            </div>
                            <div className="text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                              Full marks: {a.fullMarks}
                            </div>
                            <button
                              onClick={() => handlePublish(a)}
                              disabled={publishingAssessmentId === a._id}
                              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                              {publishingAssessmentId === a._id
                                ? a.isPublished
                                  ? "Republishing..."
                                  : "Publishing..."
                                : a.isPublished
                                  ? "Republish"
                                  : "Publish"}
                            </button>
                          </div>
                        </th>
                      )
                    )}

                    <th className="min-w-[150px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      {courseType === "lab" ? "Lab Assessment (Main)" : "CT Main"}
                    </th>

                    {nonCtAssessments.map((a) => (
                      <th
                        key={a._id}
                        className="min-w-[190px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                      >
                        <div className="space-y-2">
                          <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                            {a.name}
                          </div>
                          <div className="text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                            Full marks: {a.fullMarks}
                          </div>
                          {a?.structureType === "lab_final" && (
                            <div className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-[11px] font-semibold normal-case text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                              Faster entry enabled
                            </div>
                          )}
                          <button
                            onClick={() => handlePublish(a)}
                            disabled={publishingAssessmentId === a._id}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {publishingAssessmentId === a._id
                              ? a.isPublished
                                ? "Republishing..."
                                : "Publishing..."
                              : a.isPublished
                                ? "Republish"
                                : "Publish"}
                          </button>
                        </div>
                      </th>
                    ))}

                    <th className="min-w-[110px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Total
                    </th>

                    <th className="min-w-[100px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Grade
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sortedStudents.map((s, rowIndex) => {
                    const row = marksMap[s.id] || {};
                    const total = computeTotal100(
                      course,
                      assessments,
                      row,
                      Number(attMarksMap[s.id] || 0)
                    );

                    return (
                      <tr
                        key={s.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          {s.roll}
                        </td>

                        <td className="sticky left-[110px] z-10 whitespace-nowrap bg-white px-4 py-3 dark:bg-slate-900">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {s.name}
                          </div>
                        </td>

                        {(courseType === "lab" ? labRegularAssessments : ctAssessments).map(
                          (a, colIndex) => {
                            const isAttendanceCol = String(a.name || "")
                              .toLowerCase()
                              .includes("att");

                            const cell = row[a._id];

                            return (
                              <td key={a._id} className="px-4 py-3">
                                <input
                                  type="number"
                                  disabled={isAttendanceCol}
                                  className={[
                                    "h-11 w-24 rounded-xl border px-3 text-sm shadow-sm transition",
                                    "focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500",
                                    isAttendanceCol
                                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500",
                                  ].join(" ")}
                                  value={getMainMarkValue(cell) || ""}
                                  onChange={(e) =>
                                    handleMarkChange(s.id, a._id, e.target.value)
                                  }
                                  onKeyDown={handleKeyDown}
                                  data-row={rowIndex}
                                  data-col={colIndex}
                                  ref={(el) => {
                                    if (!inputRefs.current[rowIndex]) {
                                      inputRefs.current[rowIndex] = [];
                                    }
                                    inputRefs.current[rowIndex][colIndex] = el;
                                  }}
                                />
                              </td>
                            );
                          }
                        )}

                        <td className="px-4 py-3">
                          <div
                            title={
                              courseType === "lab"
                                ? "Calculated from average of all regular lab assessments and converted to 25"
                                : "Calculated from selected CT policy"
                            }
                            className="inline-flex min-w-[72px] items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                          >
                            {courseType === "lab"
                              ? getLabMain(assessments, row)
                              : roundPolicyTotal(computeCtScore(course, assessments, row))}
                          </div>
                        </td>

                        {nonCtAssessments.map((a, index) => {
                          const firstPartCount =
                            courseType === "lab"
                              ? labRegularAssessments.length
                              : ctAssessments.length;

                          const actualColIndex = firstPartCount + index + 1;
                          const isAttendanceCol = String(a.name || "")
                            .toLowerCase()
                            .includes("att");
                          const cell = row[a._id];

                          if (a?.structureType === "lab_final") {
                            return (
                              <td key={a._id} className="px-4 py-3">
                                <div className="flex flex-col gap-2">
                                  <div className="inline-flex min-w-[78px] items-center justify-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-bold text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                                    {Number(getMainMarkValue(cell) || 0).toFixed(1)}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => openAdvancedModal(s, a)}
                                    className="rounded-xl border border-fuchsia-200 bg-white px-3 py-2 text-xs font-semibold text-fuchsia-700 shadow-sm transition hover:bg-fuchsia-50 dark:border-fuchsia-500/20 dark:bg-slate-900 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/10"
                                  >
                                    Open Breakdown
                                  </button>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td key={a._id} className="px-4 py-3">
                              <input
                                type="number"
                                disabled={isAttendanceCol}
                                className={[
                                  "h-11 w-24 rounded-xl border px-3 text-sm shadow-sm transition",
                                  "focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500",
                                  isAttendanceCol
                                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                    : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500",
                                ].join(" ")}
                                value={getMainMarkValue(cell) || ""}
                                onChange={(e) =>
                                  handleMarkChange(s.id, a._id, e.target.value)
                                }
                                onKeyDown={handleKeyDown}
                                data-row={rowIndex}
                                data-col={actualColIndex}
                                ref={(el) => {
                                  if (!inputRefs.current[rowIndex]) {
                                    inputRefs.current[rowIndex] = [];
                                  }
                                  inputRefs.current[rowIndex][actualColIndex] = el;
                                }}
                              />
                            </td>
                          );
                        })}

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                            {Number(total).toFixed(1)}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <GradeBadge grade={gradeFromTotal(total)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {!loading && sortedStudents.length > 0 && assessments.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Marks"}
              </button>

              <button
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Export Excel
              </button>
            </div>
          )}
        </div>
      </div>

      <AdvancedBreakdownModal
        open={advancedModal.open}
        student={activeAdvancedStudent}
        assessment={activeAdvancedAssessment}
        cellValue={activeAdvancedCell}
        onClose={closeAdvancedModal}
        onPrev={goPrevAdvancedStudent}
        onNext={goNextAdvancedStudent}
        hasPrev={advancedModal.studentIndex > 0}
        hasNext={advancedModal.studentIndex < sortedStudents.length - 1}
        onSubMarkChange={(subKey, value, fullMarks) => {
          if (!activeAdvancedStudent || !activeAdvancedAssessment) return;
          handleAdvancedSubMarkChange(
            activeAdvancedStudent.id,
            activeAdvancedAssessment,
            subKey,
            value,
            fullMarks
          );
        }}
      />
    </div>
  );
}