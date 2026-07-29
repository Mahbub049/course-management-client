import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { getCourseStudents } from "../../services/enrollmentService";
import {
  fetchMarksForCourse,
  saveMarksForCourseRequest,
  syncMarksFromObeRequest,
} from "../../services/markService";
import {
  fetchAssessmentsForCourse,
  publishAssessmentRequest,
  unpublishAssessmentRequest,
  updateAssessmentStudentVisibilityRequest,
  createAssessmentRequest,
} from "../../services/assessmentService";
import { fetchAttendanceSummary } from "../../services/attendanceSummaryService";
import { getObeBlueprints, getObeSetup } from "../../services/obeService";
import {
  chooseDefaultMarksSheet,
  importCategory,
  inspectMarksSheet,
  normalizeImportLabel,
  parseMarksSheet,
  parseMarksWorkbook,
} from "../../utils/marksheetExcelImport";
import { premiumSwal } from "../../utils/premiumDialog";

function getCourseType(course) {
  const t = (course?.courseType || course?.type || "").toLowerCase();
  if (t === "hybrid") return "hybrid";
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

function isAbsentInputValue(value) {
  return String(value ?? "").trim().toUpperCase() === "A";
}

function isHalfMarkDraftAllowed(value) {
  const raw = String(value ?? "").trim();

  if (raw === "" || isAbsentInputValue(raw)) return true;

  // Allowed:
  // 7
  // 7.
  // 7.5
  // .5
  // Not allowed:
  // 7.2
  // 7.25
  // abc
  return /^(?:\d+|\d+\.|\d+\.5|\.5)$/.test(raw);
}

function toHalfMarkNumber(value) {
  const raw = String(value ?? "").trim();

  if (raw === "" || isAbsentInputValue(raw)) return 0;
  if (raw === ".5") return 0.5;
  if (raw.endsWith(".")) return Number(raw.slice(0, -1) || 0);

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatHalfMarkValue(value) {
  const n = Number(value ?? 0);

  if (!Number.isFinite(n)) return "";

  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function normalizeHalfMarkInputValue(value) {
  const raw = String(value ?? "").trim();

  if (raw === "") return "";
  if (isAbsentInputValue(raw)) return "A";

  return formatHalfMarkValue(toHalfMarkNumber(raw));
}

function getMarkStatus(cellValue) {
  if (!cellValue || typeof cellValue !== "object") return "present";
  return String(cellValue.status || "present").toLowerCase();
}

function isIncompleteCell(cellValue) {
  const status = getMarkStatus(cellValue);
  return status === "absent" || status === "incomplete";
}

function getStructuredLabPeriod(assessment) {
  if (assessment?.structureType !== "lab_final") return "";
  return String(assessment?.labFinalConfig?.period || "final").toLowerCase() ===
    "mid"
    ? "mid"
    : "final";
}

function isFinalAssessment(assessment) {
  const name = String(assessment?.name || "").toLowerCase();
  if (assessment?.structureType === "lab_final") {
    return getStructuredLabPeriod(assessment) === "final";
  }
  return name.includes("final");
}

function isAttendanceAssessment(assessment) {
  const name = String(assessment?.name || "").toLowerCase();
  return name.includes("att") || name.includes("attendance");
}

function studentHasFinalIncomplete(assessments, rowMarks) {
  return (assessments || []).some((assessment) => {
    if (!isFinalAssessment(assessment)) return false;
    return isIncompleteCell(rowMarks?.[assessment._id]);
  });
}

function gradeForStudent(course, assessments, rowMarks, total) {
  if (studentHasFinalIncomplete(assessments, rowMarks)) return "I";
  return gradeFromTotal(total);
}

function getMarkDisplayValue(cellValue) {
  if (isIncompleteCell(cellValue)) return "A";
  if (cellValue == null) return "";

  if (
    typeof cellValue === "object" &&
    Object.prototype.hasOwnProperty.call(cellValue, "inputValue")
  ) {
    return cellValue.inputValue;
  }

  return getMainMarkValue(cellValue);
}



function formatMarkForReport(cellValue) {
  if (isIncompleteCell(cellValue)) return "A";
  return Number(getMainMarkValue(cellValue) || 0).toFixed(2);
}

function roundPolicyTotal(total) {
  const n = Number(total || 0);

  if (!Number.isFinite(n) || n <= 0) return 0;

  // Ceil to nearest 0.5
  // 19.00 -> 19
  // 19.25 -> 19.5
  // 19.50 -> 19.5
  // 19.75 -> 20
  return Math.ceil((n - 1e-9) * 2) / 2;
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

function getCtMainWeight(course) {
  return Number(normalizeCtPolicy(course).totalWeight || 0);
}

function getHybridAssignmentWeight(course) {
  return Math.max(0, 25 - getCtMainWeight(course));
}

function findAssessmentByName(assessments = [], matcher) {
  return (assessments || []).find((assessment) =>
    matcher(String(assessment?.name || "").toLowerCase())
  );
}

function findHybridTheoryMid(assessments = []) {
  return (
    findAssessmentByName(assessments, (n) => n.includes("theory") && n.includes("mid")) ||
    findAssessmentByName(assessments, (n) => n.includes("mid") && !n.includes("lab") && !n.includes("final"))
  );
}

function findHybridLabMid(assessments = []) {
  return findAssessmentByName(assessments, (n) => n.includes("lab") && n.includes("mid"));
}

function findHybridTheoryFinal(assessments = []) {
  return (
    findAssessmentByName(assessments, (n) => n.includes("theory") && n.includes("final")) ||
    findAssessmentByName(assessments, (n) => n.includes("final") && !n.includes("lab") && !n.includes("mid"))
  );
}

function findHybridLabFinal(assessments = []) {
  return findAssessmentByName(assessments, (n) => n.includes("lab") && n.includes("final"));
}

function isHybridTheoryMidAssessment(assessment) {
  const n = String(assessment?.name || "").toLowerCase();
  return n.includes("theory") && n.includes("mid");
}

function isHybridLabMidAssessment(assessment) {
  const n = String(assessment?.name || "").toLowerCase();
  return n.includes("lab") && n.includes("mid");
}

function isHybridTheoryFinalAssessment(assessment) {
  const n = String(assessment?.name || "").toLowerCase();
  return n.includes("theory") && n.includes("final");
}

function isHybridLabFinalAssessment(assessment) {
  const n = String(assessment?.name || "").toLowerCase();
  return n.includes("lab") && n.includes("final");
}

function hasHybridMidParts(assessments = []) {
  return (assessments || []).some(
    (assessment) =>
      isHybridTheoryMidAssessment(assessment) ||
      isHybridLabMidAssessment(assessment)
  );
}

function hasHybridFinalParts(assessments = []) {
  return (assessments || []).some(
    (assessment) =>
      isHybridTheoryFinalAssessment(assessment) ||
      isHybridLabFinalAssessment(assessment)
  );
}

function shouldRenderHybridMidTotalAfter(assessment, assessments = []) {
  if (!hasHybridMidParts(assessments)) return false;

  const hasLabMid = (assessments || []).some(isHybridLabMidAssessment);

  if (hasLabMid) return isHybridLabMidAssessment(assessment);
  return isHybridTheoryMidAssessment(assessment);
}

function shouldRenderHybridFinalTotalAfter(assessment, assessments = []) {
  if (!hasHybridFinalParts(assessments)) return false;

  const hasLabFinal = (assessments || []).some(isHybridLabFinalAssessment);

  if (hasLabFinal) return isHybridLabFinalAssessment(assessment);
  return isHybridTheoryFinalAssessment(assessment);
}

function getHybridPartScore(rowMarks, assessment, weight) {
  if (!assessment) return 0;
  return pct(getMainMarkValue(rowMarks?.[assessment._id]), assessment.fullMarks) * weight;
}

function computeHybridMidTotal(assessments = [], rowMarks = {}) {
  return roundPolicyTotal(
    getHybridPartScore(rowMarks, findHybridTheoryMid(assessments), 20) +
      getHybridPartScore(rowMarks, findHybridLabMid(assessments), 10)
  );
}

function computeHybridFinalTotal(assessments = [], rowMarks = {}) {
  return roundPolicyTotal(
    getHybridPartScore(rowMarks, findHybridTheoryFinal(assessments), 30) +
      getHybridPartScore(rowMarks, findHybridLabFinal(assessments), 10)
  );
}

function getMainColumnLabel(courseType) {
  return courseType === "lab" ? "Lab Assessment (Main)" : "CT Avg";
}

function getMainColumnFullMarks(course, courseType) {
  return courseType === "lab" ? 25 : getCtMainWeight(course);
}

function isWholeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9;
}

function formatMarksAmount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function isAssessmentCellFilled(assessment, cellValue) {
  if (isAttendanceAssessment(assessment)) return true;
  if (isIncompleteCell(cellValue)) return true;
  if (!cellValue || typeof cellValue !== "object") return false;

  if (Object.prototype.hasOwnProperty.call(cellValue, "inputValue")) {
    return String(cellValue.inputValue ?? "").trim() !== "";
  }

  return Object.prototype.hasOwnProperty.call(cellValue, "obtainedMarks");
}

function isRowCompleteForFinalCheck(inputAssessments = [], rowMarks = {}) {
  if (!inputAssessments.length) return false;
  return inputAssessments.every((assessment) =>
    isAssessmentCellFilled(assessment, rowMarks?.[assessment._id])
  );
}

function getGradeImprovementAdvice(total) {
  const t = Number(total || 0);
  if (!Number.isFinite(t)) return null;

  const thresholds = [
    { grade: "D", min: 40 },
    { grade: "C", min: 45 },
    { grade: "C+", min: 50 },
    { grade: "B-", min: 55 },
    { grade: "B", min: 60 },
    { grade: "B+", min: 65 },
    { grade: "A-", min: 70 },
    { grade: "A", min: 75 },
    { grade: "A+", min: 80 },
  ];

  const next = thresholds.find((item) => item.min > t);
  if (!next) return null;

  const needed = round2(next.min - t);
  if (needed <= 0 || needed > 1) return null;

  return `Increase ${formatMarksAmount(needed)} mark${needed === 1 ? "" : "s"} to reach ${next.grade}`;
}

function getFinalCompletionNotice(course, assessments, rowMarks, attendanceMarks5, inputAssessments, planTotal) {
  if (Number(planTotal || 0) < 100) return null;
  if (!isRowCompleteForFinalCheck(inputAssessments, rowMarks)) return null;

  const total = computeTotal100(course, assessments, rowMarks, attendanceMarks5);

  if (!isWholeNumber(total)) {
    return {
      type: "error",
      message: "Fraction not allowed after all assessments are filled.",
    };
  }

  const advice = getGradeImprovementAdvice(total);
  if (advice) {
    return {
      type: "advice",
      message: advice,
    };
  }

  return null;
}

function isHybridGenericMidAssessment(assessment) {
  const n = String(assessment?.name || "").toLowerCase();
  return n.includes("mid") && !n.includes("final") && !n.includes("lab") && !n.includes("theory");
}

function isHybridGenericFinalAssessment(assessment) {
  const n = String(assessment?.name || "").toLowerCase();
  return n.includes("final") && !n.includes("mid") && !n.includes("lab") && !n.includes("theory");
}

function getMarkInputAssessments(courseType, assessments = []) {
  const list = Array.isArray(assessments) ? assessments : [];

  if (courseType === "lab") {
    return list.filter((assessment) => {
      const n = String(assessment?.name || "").toLowerCase();
      return (
        assessment?.structureType === "lab_final" ||
        isRegularLabAssessment(assessment) ||
        n.includes("mid") ||
        n.includes("final") ||
        isAttendanceAssessment(assessment)
      );
    });
  }

  return list.filter((assessment) => assessment?.structureType === "lab_final" || assessment);
}

function getAssessmentPlanSummary(course, assessments = []) {
  const courseType = getCourseType(course);
  const list = Array.isArray(assessments) ? assessments : [];
  const hasAttendance = list.some(isAttendanceAssessment);

  let regularTotal = 0;
  let midTotal = 0;
  let finalTotal = 0;

  if (courseType === "lab") {
    if (list.some(isRegularLabAssessment)) regularTotal += 25;
    if (hasAttendance) regularTotal += 5;

    if (
      list.some(
        (a) =>
          (a?.structureType === "lab_final" &&
            getStructuredLabPeriod(a) === "mid") ||
          (a?.structureType !== "lab_final" &&
            String(a?.name || "").toLowerCase().includes("mid"))
      )
    ) {
      midTotal += 30;
    }

    if (
      list.some(
        (a) =>
          (a?.structureType === "lab_final" &&
            getStructuredLabPeriod(a) === "final") ||
          (a?.structureType !== "lab_final" &&
            String(a?.name || "").toLowerCase().includes("final"))
      )
    ) {
      finalTotal += 40;
    }
  } else if (courseType === "hybrid") {
    if (list.some((a) => isCtAssessment(a?.name))) regularTotal += getCtMainWeight(course);
    if (list.some((a) => String(a?.name || "").toLowerCase().includes("assign"))) {
      regularTotal += getHybridAssignmentWeight(course);
    }
    if (hasAttendance) regularTotal += 5;

    if (list.some(isHybridGenericMidAssessment)) {
      midTotal += 30;
    } else {
      if (list.some(isHybridTheoryMidAssessment)) midTotal += 20;
      if (list.some(isHybridLabMidAssessment)) midTotal += 10;
    }

    if (list.some(isHybridGenericFinalAssessment)) {
      finalTotal += 40;
    } else {
      if (list.some(isHybridTheoryFinalAssessment)) finalTotal += 30;
      if (list.some(isHybridLabFinalAssessment)) finalTotal += 10;
    }
  } else {
    if (list.some((a) => isCtAssessment(a?.name))) regularTotal += getCtMainWeight(course);

    const hasAssignmentOrPresentation = list.some((a) => {
      const n = String(a?.name || "").toLowerCase();
      return n.includes("assign") || n.includes("present");
    });
    if (hasAssignmentOrPresentation) regularTotal += 10;
    if (hasAttendance) regularTotal += 5;

    if (list.some((a) => String(a?.name || "").toLowerCase().includes("mid"))) {
      midTotal += 30;
    }
    if (
      list.some(
        (a) =>
          a?.structureType === "lab_final" ||
          String(a?.name || "").toLowerCase().includes("final")
      )
    ) {
      finalTotal += 40;
    }
  }

  const total = round2(regularTotal + midTotal + finalTotal);
  const errors = [];
  const regularLabel = courseType === "lab" ? "Lab Assessment + Attendance" : "CT + Assignment + Attendance";

  if (regularTotal > 30) {
    errors.push(`${regularLabel} cannot cross 30. Current: ${formatMarksAmount(regularTotal)}.`);
  }
  if (midTotal > 30) {
    errors.push(`Mid cannot cross 30. Current: ${formatMarksAmount(midTotal)}.`);
  }
  if (finalTotal > 40) {
    errors.push(`Final cannot cross 40. Current: ${formatMarksAmount(finalTotal)}.`);
  }
  if (total > 100) {
    errors.push(`Total assessment marks cannot cross 100. Current: ${formatMarksAmount(total)}.`);
  }

  return {
    total,
    regularTotal: round2(regularTotal),
    midTotal: round2(midTotal),
    finalTotal: round2(finalTotal),
    errors,
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
  if (isIncompleteCell(cellValue)) return 0;

  if (typeof cellValue === "object") {
    return Number(cellValue.obtainedMarks || 0);
  }

  if (isAbsentInputValue(cellValue)) return 0;

  const numeric = Number(cellValue || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getSubMarkMap(cellValue) {
  if (!cellValue || typeof cellValue !== "object") return {};
  return cellValue.subMarks || {};
}

function getSubMarkInputMap(cellValue) {
  if (!cellValue || typeof cellValue !== "object") return {};
  return cellValue.subMarkInputs || {};
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

  if (mode === "components") {
    const syncLockedKeys = new Set(
      (assessment?.syncLockedComponentKeys || []).map((key) => String(key))
    );

    (config.genericComponents || []).forEach((component) => {
      const isSubmissionSynced =
        syncLockedKeys.has(String(component?.key || "")) ||
        component?.sourceType === "submission";
      const sourceType = isSubmissionSynced
        ? "submission"
        : String(component?.sourceType || "manual");
      const sectionLabels = {
        submission: "Synced Marks",
        project: "Project",
        exam: "Lab Exam",
        viva: "Viva",
        manual: "Marks Entry",
      };

      items.push({
        key: component.key,
        label: component.name,
        fullMarks: Number(component.marks || 0),
        group: sectionLabels[sourceType] || "Marks Entry",
        section: sectionLabels[sourceType] || "Marks Entry",
        sourceType,
        linkedAssessmentId: component.linkedAssessmentId || null,
        synced: isSubmissionSynced,
        readOnly: false,
      });
    });

    return items;
  }

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
            sourceType: "project",
          });
        });
      } else {
        items.push({
          key: component.key,
          label: component.name,
          fullMarks: Number(component.marks || 0),
          group: "Project",
          section: "Project",
          sourceType: "project",
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
        sourceType: "exam",
      });
    });
  }

  return items;
}


function normalizeStudentNameForImport(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExcelImportTargets(assessments = []) {
  const targets = [];

  (assessments || []).forEach((assessment) => {
    if (!assessment?._id || assessment?.structureType === "lab_submission") return;

    if (assessment?.structureType === "lab_final") {
      advancedAssessmentItems(assessment).forEach((item) => {
        targets.push({
          key: `sub:${assessment._id}:${item.key}`,
          type: "submark",
          assessmentId: String(assessment._id),
          assessment,
          subKey: String(item.key),
          label: `${assessment.name} › ${item.label}`,
          shortLabel: item.label,
          fullMarks: Number(item.fullMarks || 0),
          category:
            importCategory(item.label) !== "other"
              ? importCategory(item.label)
              : importCategory(assessment.name),
          locked: false,
          synced: Boolean(item.synced),
          lockedReason: item.synced
            ? "This component is connected to a sync source; importing is still allowed and a later sync may replace it."
            : "",
        });
      });
      return;
    }

    targets.push({
      key: `assessment:${assessment._id}`,
      type: "assessment",
      assessmentId: String(assessment._id),
      assessment,
      label: assessment.name,
      shortLabel: assessment.name,
      fullMarks: Number(assessment.fullMarks || 0),
      category: importCategory(assessment.name),
      locked: false,
      synced: Boolean(assessment.syncLocked),
      lockedReason: assessment.syncLocked
        ? "This assessment is connected to a sync source; importing is still allowed and a later sync may replace it."
        : "",
    });
  });

  return targets;
}

function importTargetScore(column, target) {
  if (!column || !target || target.locked) return -1;

  const sourceName = normalizeImportLabel(
    `${column.parentHeader || ""} ${column.childHeader || ""}`
  );
  const targetName = normalizeImportLabel(
    `${target.assessment?.name || ""} ${target.shortLabel || ""}`
  );
  const sourceCategory = column.category;
  const targetCategory = target.category;
  const sourceMarks = Number(column.maxMarks);
  const targetMarks = Number(target.fullMarks);
  const sameMarks =
    Number.isFinite(sourceMarks) &&
    sourceMarks > 0 &&
    Number.isFinite(targetMarks) &&
    Math.abs(sourceMarks - targetMarks) < 1e-9;

  let score = 0;

  if (sourceName && targetName && sourceName === targetName) score += 120;

  const sourceParent = normalizeImportLabel(column.parentHeader || "");
  const targetAssessmentName = normalizeImportLabel(target.assessment?.name || target.label);
  if (sourceParent && sourceParent === targetAssessmentName) score += 90;

  const compatibleCategory =
    sourceCategory !== "other" &&
    (sourceCategory === targetCategory ||
      (sourceCategory === "ct_aggregate" && targetCategory === "ct") ||
      (sourceCategory === "ct" && targetCategory === "ct_aggregate"));

  if (compatibleCategory) {
    score += 60;
  }

  if (sameMarks) score += 35;

  const sourceTokens = new Set(sourceName.split(" ").filter(Boolean));
  const targetTokens = new Set(targetName.split(" ").filter(Boolean));
  let common = 0;
  sourceTokens.forEach((token) => {
    if (targetTokens.has(token)) common += 1;
  });
  score += common * 8;

  if (target.type === "submark") {
    const child = normalizeImportLabel(column.childHeader || "");
    const subLabel = normalizeImportLabel(target.shortLabel || "");
    if (child && subLabel && child === subLabel) score += 100;
    if (column.isAggregate) score -= 80;
  } else if (column.isAggregate) {
    score += 25;
  }

  if (sourceCategory === "grand_total") score = -1;

  return score;
}

function buildAutoExcelImportMappings(columns = [], targets = []) {
  const mappings = {};
  const usedTargets = new Set();
  const orderedColumns = [...columns].sort(
    (a, b) => Number(b.priority || 0) - Number(a.priority || 0)
  );

  orderedColumns.forEach((column) => {
    const candidates = targets
      .filter((target) => !usedTargets.has(target.key))
      .map((target) => ({ target, score: importTargetScore(column, target) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0] || null;

    // An aggregate CT value (for example “Best of Two CT”) must not be
    // guessed into CT-01 when several individual CT fields exist. In that
    // situation the detailed CT columns are allowed to match instead.
    if (column.category === "ct_aggregate") {
      const ctCandidates = candidates.filter((item) =>
        ["ct", "ct_aggregate"].includes(item.target.category)
      );
      if (ctCandidates.length > 1 && Number(best?.score || 0) < 150) {
        mappings[column.key] = "ignore";
        return;
      }
    }

    if (best && best.score >= 75) {
      mappings[column.key] = best.target.key;
      usedTargets.add(best.target.key);
    } else {
      mappings[column.key] = "ignore";
    }
  });

  return mappings;
}

function getImportValueKind(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { kind: "blank", value: null };
  if (raw.toUpperCase() === "A" || raw.toLowerCase() === "absent") {
    return { kind: "absent", value: 0 };
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { kind: "invalid", value: null };
  if (numeric < 0) return { kind: "invalid", value: numeric };
  if (Math.abs(numeric * 2 - Math.round(numeric * 2)) > 1e-9) {
    return { kind: "invalid_step", value: numeric };
  }
  return { kind: "number", value: numeric };
}

function isExistingImportTargetFilled(target, marksMap, studentId) {
  const cell = marksMap?.[studentId]?.[target.assessmentId];
  if (!cell) return false;

  if (target.type === "submark") {
    const subMarks = getSubMarkMap(cell);
    return Object.prototype.hasOwnProperty.call(subMarks, target.subKey);
  }

  return isAssessmentCellFilled(target.assessment, cell);
}

function suggestedCreateFullMarks(column) {
  const fullMarks = Number(column?.maxMarks ?? column?.suggestedFullMarks);
  if (Number.isFinite(fullMarks) && fullMarks > 0) return fullMarks;

  const defaults = {
    attendance: 5,
    assignment: 10,
    ct_aggregate: 15,
    ct: 15,
    mid: 30,
    final: 40,
    lab_evaluation: 25,
  };

  return defaults[column?.category] ?? "";
}

function getExcelImportSourceValue(row, column, columns = []) {
  const direct = row?.values?.[column.key];
  if (String(direct ?? "").trim() !== "") return direct;
  if (!column?.isAggregate) return direct;

  const parent = normalizeImportLabel(column.parentHeader || "");
  const siblings = columns.filter(
    (item) =>
      item.key !== column.key &&
      !item.isAggregate &&
      normalizeImportLabel(item.parentHeader || "") === parent
  );
  if (!siblings.length) return direct;

  const values = siblings
    .map((item) => row?.values?.[item.key])
    .filter((value) => String(value ?? "").trim() !== "");
  if (!values.length) return direct;

  const absentOnly = values.every(
    (value) => ["a", "absent"].includes(String(value).trim().toLowerCase())
  );
  if (absentOnly) return "A";

  const numericValues = values.map(Number).filter(Number.isFinite);
  if (!numericValues.length) return direct;
  return round2(numericValues.reduce((sum, value) => sum + value, 0));
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

function isRegularLabAssessment(assessment) {
  const n = String(assessment?.name || "").toLowerCase();

  return (
    assessment?.structureType !== "lab_final" &&
    assessment?.structureType !== "lab_submission" &&
    !n.includes("mid") &&
    !n.includes("final") &&
    !n.includes("att")
  );
}

function computeLabAssessmentScore25(assessments, rowMarks) {
  const regularLabAssessments = (Array.isArray(assessments) ? assessments : []).filter(
    isRegularLabAssessment
  );

  if (!regularLabAssessments.length) return 0;

  const totalFullMarks = regularLabAssessments.reduce(
    (sum, assessment) => sum + Number(assessment.fullMarks || 0),
    0
  );

  if (totalFullMarks <= 0) return 0;

  const totalObtainedMarks = regularLabAssessments.reduce((sum, assessment) => {
    const fullMarks = Number(assessment.fullMarks || 0);
    const obtained = getMainMarkValue(rowMarks?.[assessment._id]);

    return sum + clamp(obtained, 0, fullMarks);
  }, 0);

  return (totalObtainedMarks / totalFullMarks) * 25;
}

function getLabMain(assessments, rowMarks) {
  return roundPolicyTotal(computeLabAssessmentScore25(assessments, rowMarks));
}

function computeTotal100(course, assessments, rowMarks, attendanceMarks5 = 0) {
  const courseType = getCourseType(course);
  const list = Array.isArray(assessments) ? assessments : [];
  const name = (a) => String(a?.name || "").toLowerCase();

  const attScore5 = clamp(attendanceMarks5, 0, 5);

  if (courseType === "lab") {
    const structuredMid = list.find(
      (a) =>
        a?.structureType === "lab_final" && getStructuredLabPeriod(a) === "mid"
    );
    const regularMid = list.find(
      (a) => a?.structureType !== "lab_final" && name(a).includes("mid")
    );
    const mid = structuredMid || regularMid;

    const structuredFinal = list.find(
      (a) =>
        a?.structureType === "lab_final" && getStructuredLabPeriod(a) === "final"
    );

    const regularFinal = list.find(
      (a) => a?.structureType !== "lab_final" && name(a).includes("final")
    );

    const finalAssessment = structuredFinal || regularFinal;

    const labScore25 = roundPolicyTotal(
      computeLabAssessmentScore25(list, rowMarks)
    );

    const midScore30 = mid
      ? pct(getMainMarkValue(rowMarks?.[mid._id]), mid.fullMarks) * 30
      : 0;

    const finalScore40 = finalAssessment
      ? pct(getMainMarkValue(rowMarks?.[finalAssessment._id]), finalAssessment.fullMarks) * 40
      : 0;

    return roundPolicyTotal(labScore25 + midScore30 + finalScore40 + attScore5);
  }

  if (courseType === "hybrid") {
    const theoryMid = findHybridTheoryMid(list);
    const labMid = findHybridLabMid(list);
    const theoryFinal = findHybridTheoryFinal(list);
    const labFinal = findHybridLabFinal(list);
    const assignment = list.find((a) => name(a).includes("assign"));

    const ctScore = computeCtScore(course, list, rowMarks);
    const assignmentWeight = getHybridAssignmentWeight(course);

    const theoryMidScore20 = theoryMid
      ? pct(getMainMarkValue(rowMarks?.[theoryMid._id]), theoryMid.fullMarks) * 20
      : 0;

    const labMidScore10 = labMid
      ? pct(getMainMarkValue(rowMarks?.[labMid._id]), labMid.fullMarks) * 10
      : 0;

    const theoryFinalScore30 = theoryFinal
      ? pct(getMainMarkValue(rowMarks?.[theoryFinal._id]), theoryFinal.fullMarks) * 30
      : 0;

    const labFinalScore10 = labFinal
      ? pct(getMainMarkValue(rowMarks?.[labFinal._id]), labFinal.fullMarks) * 10
      : 0;

    const assignmentScore = assignment
      ? pct(getMainMarkValue(rowMarks?.[assignment._id]), assignment.fullMarks) * assignmentWeight
      : 0;

    return roundPolicyTotal(
      ctScore +
        theoryMidScore20 +
        labMidScore10 +
        theoryFinalScore30 +
        labFinalScore10 +
        assignmentScore +
        attScore5
    );
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
              : grade === "I"
                ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300"
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
  onSubMarkBlur,
}) {
  if (!open || !student || !assessment) return null;

  const items = advancedAssessmentItems(assessment);
  const subMarks = getSubMarkMap(cellValue);
  const subMarkInputs = getSubMarkInputMap(cellValue);
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
                  Structured Lab {getStructuredLabPeriod(assessment) === "mid" ? "Mid" : "Final"} Entry
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
              No structured breakdown found for this assessment.
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
                              {item.synced ? " • Synced source • Manual editing allowed" : ""}
                            </div>
                          </div>

                          <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-xs font-bold text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                            / {item.fullMarks}
                          </span>
                        </div>

                        <div className="mt-4">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={subMarkInputs[item.key] ?? subMarks[item.key] ?? ""}
                            onChange={(e) =>
                              onSubMarkChange(item.key, e.target.value, item.fullMarks)
                            }
                            onBlur={() => onSubMarkBlur(item.key, item.fullMarks)}
                            title={
                              item.synced
                                ? "This value is connected to Marks Sync, but manual editing is allowed. Running sync again may replace the manual value."
                                : ""
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


function MarksExcelImportModal({
  open,
  fileName,
  sheetNames,
  sheetName,
  onSheetChange,
  preview,
  targets,
  mappings,
  onMappingChange,
  createConfigs,
  onCreateConfigChange,
  showAllColumns,
  setShowAllColumns,
  sheetInspection,
  sheetSetup,
  setupOpen,
  setSetupOpen,
  onSheetSetupChange,
  onApplySheetSetup,
  importPolicy,
  setImportPolicy,
  onAutoMatch,
  onCreateRecommended,
  onClose,
  onImport,
  busy,
}) {
  if (!open) return null;

  const columns = preview?.columns || [];
  const rows = preview?.rows || [];
  const visibleColumns = columns.filter((column) => {
    if (showAllColumns) return true;
    const mapping = mappings[column.key];
    return column.recommended || (mapping && mapping !== "ignore");
  });

  const mappedCount = Object.values(mappings || {}).filter(
    (value) => value && value !== "ignore" && value !== "create"
  ).length;
  const createCount = Object.values(mappings || {}).filter(
    (value) => value === "create"
  ).length;
  const ignoredCount = Math.max(0, columns.length - mappedCount - createCount);
  const hasSelectedHeaderRow =
    sheetSetup?.headerRow !== "" && Number.isInteger(Number(sheetSetup?.headerRow));
  const selectedRollColumn = (sheetInspection?.columns || []).find(
    (item) => Number(item.value) === Number(sheetSetup?.rollCol)
  );
  const selectedNameColumn = (sheetInspection?.columns || []).find(
    (item) => Number(item.value) === Number(sheetSetup?.nameCol)
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="relative overflow-hidden border-b border-slate-200 bg-slate-50/80 px-5 py-5 sm:px-7 sm:py-6 dark:border-slate-800 dark:bg-slate-900">
          
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-300">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 16v3h14v-3" strokeLinecap="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">Smart Excel Import</div>
                <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">Review the workbook mapping</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                  Existing assessments are matched automatically. You can remap any column, create missing assessment fields, and choose whether existing marks are protected.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white disabled:opacity-50" aria-label="Close import modal">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Students", rows.length, "text-emerald-700 dark:text-emerald-300"],
              ["Mapped", mappedCount, "text-sky-700 dark:text-sky-300"],
              ["Create", createCount, "text-indigo-700 dark:text-indigo-300"],
              ["Ignored", ignoredCount, "text-slate-700 dark:text-slate-300"],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                <div className={`mt-1 text-xl font-black ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5" strokeLinecap="round"/></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Workbook</div>
                  <div className="mt-1 truncate text-sm font-extrabold text-slate-900 dark:text-white" title={fileName}>{fileName || "Excel workbook"}</div>
                  <select value={sheetName} onChange={(e) => onSheetChange(e.target.value)} className="mt-3 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    {sheetNames.map((name) => <option value={name} key={name}>{name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Existing marks policy</div>
              <div className="mt-3 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900">
                <button type="button" onClick={() => setImportPolicy("blank_only")} className={`rounded-lg px-3 py-2.5 text-xs font-extrabold transition ${importPolicy === "blank_only" ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>Fill blanks only</button>
                <button type="button" onClick={() => setImportPolicy("replace")} className={`rounded-lg px-3 py-2.5 text-xs font-extrabold transition ${importPolicy === "replace" ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-300" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>Replace existing</button>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">Blank Excel cells never erase portal marks.</p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/35">
            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Detected sheet structure</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span>Header row: {hasSelectedHeaderRow ? Number(sheetSetup.headerRow) + 1 : "Not selected"}</span>
                  <span>Student ID: {selectedRollColumn?.label || "Not selected"}</span>
                  <span>Name: {Number(sheetSetup?.nameCol) >= 0 ? selectedNameColumn?.label || "Not selected" : "Optional / not used"}</span>
                  {!preview?.error && <span>{columns.length} mark column(s) detected</span>}
                </div>
              </div>
              <button type="button" onClick={() => setSetupOpen(!setupOpen)} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h8M16 17h4" strokeLinecap="round"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="17" r="2"/></svg>
                {setupOpen ? "Hide setup" : "Adjust detection"}
              </button>
            </div>

            {setupOpen && (
              <div className="border-t border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/45">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Header row</span>
                    <select value={sheetSetup?.headerRow ?? ""} onChange={(e) => onSheetSetupChange("headerRow", e.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                      {(sheetInspection?.headerRows || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Student ID / Roll column</span>
                    <select value={sheetSetup?.rollCol ?? ""} onChange={(e) => onSheetSetupChange("rollCol", e.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                      <option value="">Select ID column</option>
                      {(sheetInspection?.columns || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Student name column</span>
                    <select value={sheetSetup?.nameCol ?? -1} onChange={(e) => onSheetSetupChange("nameCol", e.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                      <option value={-1}>No name column / match by ID only</option>
                      {(sheetInspection?.columns || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">Use this when a workbook has title rows, unusual headers, or different Student ID/Name column names. Applying it re-detects every remaining Excel column for manual mapping.</p>
                  <button type="button" onClick={onApplySheetSetup} disabled={busy || sheetSetup?.rollCol === "" || sheetSetup?.rollCol == null} className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 text-xs font-extrabold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">Apply & detect columns</button>
                </div>
              </div>
            )}
          </div>

          {preview?.error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">{preview.error}</div>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onAutoMatch} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 7h10M7 12h7M7 17h4" strokeLinecap="round"/><path d="M17 14l2 2 3-4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Auto Match
                  </button>
                  <button type="button" onClick={onCreateRecommended} title="Prepare detected mark columns as new assessments" className="inline-flex h-9 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/15">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                    Create Detected
                  </button>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <input type="checkbox" checked={showAllColumns} onChange={(e) => setShowAllColumns(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
                  Show every detected Excel column
                </label>
              </div>

              <div className="mt-4 space-y-3">
                {visibleColumns.map((column, index) => {
                  const mapping = mappings[column.key] || "ignore";
                  const config = createConfigs[column.key] || {};
                  const target = targets.find((item) => item.key === mapping);
                  const status = mapping === "create" ? "create" : mapping === "ignore" ? "ignore" : "mapped";
                  return (
                    <div key={column.key} className={`rounded-2xl border p-4 transition ${status === "mapped" ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5" : status === "create" ? "border-indigo-200 bg-indigo-50/50 dark:border-indigo-500/20 dark:bg-indigo-500/5" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/45"}`}>
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.9fr)] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-2 text-[10px] font-black text-slate-500 dark:bg-slate-700 dark:text-slate-300">{column.letter || index + 1}</span>
                            <div className="min-w-0 truncate text-sm font-extrabold text-slate-900 dark:text-white" title={column.sourceLabel}>{column.sourceLabel}</div>
                            {column.recommended && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">Detected marks</span>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                            <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-700/70">Type: {String(column.category || "other").replace(/_/g, " ")}</span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-700/70">Header max: <strong className="text-slate-700 dark:text-slate-300">{column.maxMarks ?? "—"}</strong></span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-700/70">Suggested full marks: <strong className="text-slate-700 dark:text-slate-300">{column.suggestedFullMarks ?? "—"}</strong></span>
                            <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-700/70">Values found: <strong className="text-slate-700 dark:text-slate-300">{column.nonEmptyCount ?? 0}</strong></span>
                            {target?.synced && <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">sync-connected target</span>}
                          </div>
                          {!!column.sampleValues?.length && <div className="mt-2 truncate text-[11px] text-slate-500 dark:text-slate-400" title={column.sampleValues.join(", ")}>Sample: {column.sampleValues.join(", ")}</div>}
                        </div>

                        <div>
                          <select value={mapping} onChange={(e) => onMappingChange(column.key, e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                            <option value="ignore">Ignore this Excel column</option>
                            <option value="create">＋ Create a new assessment from this header</option>
                            <optgroup label="Map to an existing assessment">
                              {targets.map((item) => <option key={item.key} value={item.key} disabled={item.locked}>{item.label} ({item.fullMarks}){item.synced ? " — sync connected" : ""}</option>)}
                            </optgroup>
                          </select>

                          {mapping === "create" && (
                            <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-2.5 dark:border-indigo-500/20 dark:bg-indigo-500/5">
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Suggested from Excel — edit before importing</div>
                              <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                                <input value={config.name || ""} onChange={(e) => onCreateConfigChange(column.key, "name", e.target.value)} placeholder="Assessment name" className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                                <input type="number" min="0.5" step="0.5" value={config.fullMarks ?? ""} onChange={(e) => onCreateConfigChange(column.key, "fullMarks", e.target.value)} placeholder="Full marks" className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!visibleColumns.length && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">No mark columns are visible. Turn on “Show every detected Excel column” or adjust the sheet structure.</div>}
              {!!preview?.duplicateRolls?.length && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">{preview.duplicateRolls.length} duplicate student row(s) will be ignored.</div>}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="text-xs leading-5 text-slate-500">Roll/ID is the primary match. Review every “Create” row before importing.</div>
          <div className="flex gap-2 self-end">
            <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Cancel</button>
            <button type="button" onClick={onImport} disabled={busy || Boolean(preview?.error)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Importing..." : "Confirm & Import Marks"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getObeBlueprintCategory(blueprint = {}) {
  const explicit = String(blueprint?.assessmentType || "").trim().toLowerCase();
  if (["ct", "assignment", "mid", "final", "attendance"].includes(explicit)) {
    return explicit;
  }
  const category = importCategory(blueprint?.assessmentName || "");
  return category === "ct_aggregate" ? "ct" : category;
}

function scoreObeBlueprintTarget(blueprint, assessment) {
  if (!blueprint || !assessment) return -1;
  const sourceName = normalizeImportLabel(blueprint.assessmentName || "");
  const targetName = normalizeImportLabel(assessment.name || "");
  const sourceCategory = getObeBlueprintCategory(blueprint);
  const targetCategory = importCategory(assessment.name || "");
  const sameMarks =
    Math.abs(Number(blueprint.totalMarks || 0) - Number(assessment.fullMarks || 0)) < 1e-9;

  let score = 0;
  if (sourceName && targetName && sourceName === targetName) score += 140;
  if (sourceCategory !== "other" && sourceCategory === targetCategory) score += 70;
  if (sameMarks) score += 55;
  if (sourceName && targetName && (sourceName.includes(targetName) || targetName.includes(sourceName))) {
    score += 24;
  }
  if (assessment?.structureType === "lab_final") score += 8;
  return score;
}

function buildObeFetchDefaults(blueprints = [], assessments = [], courseType = "theory") {
  const mappings = {};
  const createConfigs = {};
  const usedAssessmentIds = new Set();

  (blueprints || []).forEach((blueprint) => {
    const candidates = (assessments || [])
      .filter((assessment) => !usedAssessmentIds.has(String(assessment._id)))
      .map((assessment) => ({
        assessment,
        score: scoreObeBlueprintTarget(blueprint, assessment),
      }))
      .filter(
        ({ assessment, score }) =>
          score > 0 &&
          Math.abs(Number(blueprint.totalMarks || 0) - Number(assessment.fullMarks || 0)) < 1e-9
      )
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (best && best.score >= 105) {
      mappings[String(blueprint._id)] = `assessment:${best.assessment._id}`;
      usedAssessmentIds.add(String(best.assessment._id));
    } else {
      mappings[String(blueprint._id)] = "create";
    }

    const type = getObeBlueprintCategory(blueprint);
    createConfigs[String(blueprint._id)] = {
      name:
        courseType === "lab" && type === "mid"
          ? "Lab Mid"
          : courseType === "lab" && type === "final"
            ? "Lab Final"
            : String(blueprint.assessmentName || "Assessment").trim(),
      fullMarks: Number(blueprint.totalMarks || 0),
      useQuestionBreakdown:
        courseType === "lab" && ["mid", "final"].includes(type),
    };
  });

  return { mappings, createConfigs };
}

function buildMarksAssessmentFromObeBlueprint(blueprint, config, courseType, order) {
  const type = getObeBlueprintCategory(blueprint);
  const fullMarks = Number(config?.fullMarks ?? blueprint?.totalMarks ?? 0);
  const name = String(config?.name || blueprint?.assessmentName || "Assessment").trim();

  if (!name || !Number.isFinite(fullMarks) || fullMarks <= 0) {
    throw new Error(`${blueprint?.assessmentName || "OBE assessment"} needs a valid marksheet name and full marks.`);
  }

  if (
    courseType === "lab" &&
    config?.useQuestionBreakdown &&
    ["mid", "final"].includes(type)
  ) {
    const expected = type === "mid" ? 30 : 40;
    if (fullMarks !== expected) {
      throw new Error(`Lab ${type === "mid" ? "Mid" : "Final"} must be ${expected} marks.`);
    }
    const items = Array.isArray(blueprint?.items) ? blueprint.items : [];
    const itemTotal = round2(items.reduce((sum, item) => sum + Number(item?.marks || 0), 0));
    if (!items.length || Math.abs(itemTotal - expected) > 0.01) {
      throw new Error(`${blueprint.assessmentName} cannot be created with question breakdown because its OBE items do not total ${expected}.`);
    }

    return {
      name,
      fullMarks,
      order,
      structureType: "lab_final",
      labFinalConfig: {
        period: type === "mid" ? "mid" : "final",
        mode: "components",
        totalMarks: expected,
        projectMarks: 0,
        labExamMarks: 0,
        genericComponents: items.map((item, index) => ({
          key: String(item.key || `q${index + 1}`),
          name: String(item.label || item.coCode || `Q${index + 1}`),
          marks: Number(item.marks || 0),
          sourceType: "manual",
        })),
        projectComponents: [],
        examQuestions: [],
      },
    };
  }

  return {
    name,
    fullMarks,
    order,
    structureType: "regular",
  };
}

function ObeFetchModal({
  open,
  courseType,
  blueprints,
  assessments,
  mappings,
  createConfigs,
  overwriteExisting,
  setOverwriteExisting,
  onMappingChange,
  onCreateConfigChange,
  onClose,
  onFetch,
  busy,
}) {
  if (!open) return null;

  const selected = (blueprints || []).filter(
    (blueprint) => mappings?.[String(blueprint._id)] && mappings[String(blueprint._id)] !== "skip"
  );
  const createCount = selected.filter(
    (blueprint) => mappings[String(blueprint._id)] === "create"
  ).length;
  const mappedCount = selected.length - createCount;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="relative overflow-hidden border-b border-slate-200 bg-slate-50/80 px-5 py-5 sm:px-7 dark:border-slate-800 dark:bg-slate-900">
          
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-300">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 7h12M4 12h8M4 17h5" strokeLinecap="round" />
                  <path d="M17 13v6m0 0 3-3m-3 3-3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">OBE → Marksheet</div>
                <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">Review assessment mapping before fetching</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                  Match each OBE assessment to an existing marksheet field or create the missing field directly. OBE question/CO items are shown so you can verify the source before anything is changed.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white disabled:opacity-50" aria-label="Close">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2 sm:max-w-xl">
            {[
              ["OBE assessments", blueprints?.length || 0, "text-indigo-700 dark:text-indigo-300"],
              ["Mapped existing", mappedCount, "text-sky-700 dark:text-sky-300"],
              ["Create missing", createCount, "text-emerald-700 dark:text-emerald-300"],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
                <div className={`mt-1 text-xl font-black ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          {!blueprints?.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
              No OBE assessment blueprint is available yet. Open OBE / CO-PO and create or import the setup/assessment blueprint first.
            </div>
          ) : (
            <div className="space-y-4">
              {blueprints.map((blueprint, index) => {
                const id = String(blueprint._id);
                const mapping = mappings?.[id] || "skip";
                const config = createConfigs?.[id] || {};
                const items = Array.isArray(blueprint.items) ? blueprint.items : [];
                const category = getObeBlueprintCategory(blueprint);
                return (
                  <div key={id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/40">
                    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.72fr)] lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-indigo-50 px-2 text-[11px] font-black text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{index + 1}</span>
                          <h4 className="text-base font-extrabold text-slate-900 dark:text-white">{blueprint.assessmentName}</h4>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-300">{category}</span>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">{Number(blueprint.totalMarks || 0)} marks</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {items.length ? items.map((item) => (
                            <span key={item.key} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                              <strong className="text-slate-900 dark:text-slate-100">{item.label || item.key}</strong>
                              {item.coCode ? <span className="text-indigo-700 dark:text-indigo-300">{item.coCode}</span> : null}
                              <span className="text-slate-500">·</span>
                              <span>{Number(item.marks || 0)}</span>
                            </span>
                          )) : <span className="text-xs text-slate-500">No question/item breakdown saved.</span>}
                        </div>
                        {courseType !== "lab" && items.length > 0 && (
                          <p className="mt-3 text-xs leading-5 text-slate-500">The question-wise OBE marks stay in OBE. The normal marksheet receives the saved total for this assessment.</p>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-700 dark:bg-slate-900/70">
                        <label className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-500">Destination</label>
                        <select value={mapping} onChange={(e) => onMappingChange(id, e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                          <option value="skip">Skip this OBE assessment</option>
                          <option value="create">＋ Create marksheet assessment from OBE</option>
                          {(assessments || []).map((assessment) => (
                            <option key={assessment._id} value={`assessment:${assessment._id}`}>
                              {assessment.name} ({Number(assessment.fullMarks || 0)}){assessment.structureType === "lab_final" ? " · structured" : ""}
                            </option>
                          ))}
                        </select>

                        {mapping === "create" && (
                          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                              <input value={config.name || ""} onChange={(e) => onCreateConfigChange(id, "name", e.target.value)} placeholder="Assessment name" className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                              <input type="number" min="0.5" step="0.5" value={config.fullMarks ?? ""} onChange={(e) => onCreateConfigChange(id, "fullMarks", e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                            </div>
                            {courseType === "lab" && ["mid", "final"].includes(category) && items.length > 0 && (
                              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-500" checked={config.useQuestionBreakdown !== false} onChange={(e) => onCreateConfigChange(id, "useQuestionBreakdown", e.target.checked)} />
                                <span className="text-xs leading-5 text-slate-700 dark:text-slate-300"><strong className="text-indigo-700 dark:text-indigo-300">Create question/component breakdown</strong><br />Uses the OBE item marks so Lab Mid/Final stays question-wise in the marksheet too.</span>
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">Existing marks policy</div>
                <div className="mt-1 text-xs text-slate-500">Choose whether fetched OBE totals may replace marks already saved in the marksheet.</div>
              </div>
              <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900">
                <button type="button" onClick={() => setOverwriteExisting(false)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${!overwriteExisting ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}`}>Fill blanks only</button>
                <button type="button" onClick={() => setOverwriteExisting(true)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${overwriteExisting ? "bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}>Replace existing</button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="text-xs text-slate-500">Nothing is created or overwritten until you confirm this screen.</div>
          <div className="flex gap-2 self-end">
            <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Cancel</button>
            <button type="button" onClick={onFetch} disabled={busy || !selected.length} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Fetching..." : "Create / Map & Fetch Marks"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssessmentPublishingControls({
  assessment,
  publishingAssessmentId,
  unpublishingAssessmentId,
  visibilityAssessmentId,
  onPublish,
  onUnpublish,
  onToggleVisibility,
}) {
  const assessmentId = String(assessment?._id || "");
  const isPublished = Boolean(assessment?.isPublished);
  const showMarksToStudents = assessment?.showMarksToStudents !== false;
  const isPublishing = String(publishingAssessmentId || "") === assessmentId;
  const isUnpublishing =
    String(unpublishingAssessmentId || "") === assessmentId;
  const isUpdatingVisibility =
    String(visibilityAssessmentId || "") === assessmentId;
  const isBusy = isPublishing || isUnpublishing || isUpdatingVisibility;

  const statusLabel = !isPublished
    ? "Unpublished"
    : showMarksToStudents
      ? "Mark shown"
      : "Mark hidden";

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 normal-case">
      <span
        className={[
          "inline-flex h-6 items-center rounded-lg border px-1.5 text-[9px] font-bold leading-none",
          !isPublished
            ? "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            : showMarksToStudents
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
        ].join(" ")}
        title={
          !isPublished
            ? "This assessment is not visible to students."
            : showMarksToStudents
              ? "The individual assessment mark is visible to students."
              : "The individual mark is hidden; total and grade remain visible."
        }
      >
        {statusLabel}
      </span>

      <button
        type="button"
        onClick={() => onPublish(assessment)}
        disabled={isBusy}
        className="inline-flex h-6 items-center rounded-lg border border-indigo-200 bg-indigo-50 px-1.5 text-[9px] font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
        title={isPublished ? "Publish the latest saved marks again." : "Publish this assessment to students."}
      >
        {isPublishing
          ? isPublished
            ? "Republishing..."
            : "Publishing..."
          : isPublished
            ? "Republish"
            : "Publish"}
      </button>

      {isPublished && (
        <button
          type="button"
          onClick={() => onUnpublish(assessment)}
          disabled={isBusy}
          className="inline-flex h-6 items-center rounded-lg border border-rose-200 bg-rose-50 px-1.5 text-[9px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
          title="Remove this assessment from the student view."
        >
          {isUnpublishing ? "Unpublishing..." : "Unpublish"}
        </button>
      )}

      {isPublished && (
        <button
          type="button"
          onClick={() => onToggleVisibility(assessment)}
          disabled={isBusy}
          className={[
            "inline-flex h-6 items-center rounded-lg border px-1.5 text-[9px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
            showMarksToStudents
              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
          ].join(" ")}
          title={
            showMarksToStudents
              ? "Hide only this assessment mark. The total and grade will remain visible."
              : "Show this assessment mark to students again."
          }
        >
          {isUpdatingVisibility
            ? "Updating..."
            : showMarksToStudents
              ? "Hide mark"
              : "Show mark"}
        </button>
      )}
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
  const [syncingObeMarks, setSyncingObeMarks] = useState(false);
  const [publishingAssessmentId, setPublishingAssessmentId] = useState(null);
  const [unpublishingAssessmentId, setUnpublishingAssessmentId] = useState(null);
  const [visibilityAssessmentId, setVisibilityAssessmentId] = useState(null);

  const [tabMode, setTabMode] = useState("row");
  const [sortMode, setSortMode] = useState("entered");
  const [studentSearch, setStudentSearch] = useState("");

  const [advancedModal, setAdvancedModal] = useState({
    open: false,
    assessmentId: null,
    studentIndex: 0,
  });

  const inputRefs = useRef([]);
  const originalStudentsRef = useRef([]);
  const excelImportInputRef = useRef(null);

  const [excelImport, setExcelImport] = useState({
    open: false,
    fileName: "",
    workbook: null,
    sheetNames: [],
    sheetName: "",
    preview: null,
    mappings: {},
    createConfigs: {},
    showAllColumns: true,
    sheetInspection: null,
    sheetSetup: { headerRow: "", rollCol: "", nameCol: -1 },
    setupOpen: false,
    importPolicy: "blank_only",
    busy: false,
  });

  const [obeFetch, setObeFetch] = useState({
    open: false,
    busy: false,
    blueprints: [],
    setup: null,
    mappings: {},
    createConfigs: {},
    overwriteExisting: true,
  });

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
            status: m.status || "present",
            subMarks: buildSubMarkMap(m.subMarks || []),
          };
        });
      }

      if (attSummary.status === "fulfilled") {
        const attRows = attSummary.value || [];

        const attendanceAssessment = (assessmentsData || []).find(
          isAttendanceAssessment
        );

        const newAttMap = {};

        attRows.forEach((r) => {
          const sid = String(r.student);

          if (!map[sid]) map[sid] = {};

          const existingAttendanceCell = attendanceAssessment
            ? map[sid]?.[attendanceAssessment._id]
            : null;

          const attendanceValue = existingAttendanceCell
            ? Number(existingAttendanceCell.obtainedMarks || 0)
            : Number(r.marks ?? 0);

          newAttMap[sid] = attendanceValue;

          if (attendanceAssessment && !existingAttendanceCell) {
            map[sid][attendanceAssessment._id] = {
              obtainedMarks: attendanceValue,
              status: "present",
              subMarks: {},
            };
          }
        });

        setAttMarksMap(newAttMap);
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
    return sortedAssessments.filter(isRegularLabAssessment);
  }, [sortedAssessments]);

  const advancedLabFinalAssessments = useMemo(() => {
    return sortedAssessments.filter((a) => a?.structureType === "lab_final");
  }, [sortedAssessments]);



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

  const nonCtDisplayColumns = useMemo(() => {
    const columns = [];

    nonCtAssessments.forEach((assessment) => {
      columns.push({
        type: "assessment",
        key: assessment._id,
        assessment,
      });

      if (courseType === "hybrid" && shouldRenderHybridMidTotalAfter(assessment, sortedAssessments)) {
        columns.push({
          type: "hybrid_mid_total",
          key: "hybrid_mid_total",
          label: "Mid Term",
          fullMarks: 30,
        });
      }

      if (courseType === "hybrid" && shouldRenderHybridFinalTotalAfter(assessment, sortedAssessments)) {
        columns.push({
          type: "hybrid_final_total",
          key: "hybrid_final_total",
          label: "Final Term",
          fullMarks: 40,
        });
      }
    });

    return columns;
  }, [nonCtAssessments, courseType, sortedAssessments]);

  const markInputAssessments = useMemo(() => {
    return getMarkInputAssessments(courseType, sortedAssessments);
  }, [courseType, sortedAssessments]);

  const excelImportTargets = useMemo(
    () => buildExcelImportTargets(sortedAssessments),
    [sortedAssessments]
  );

  const assessmentPlanSummary = useMemo(() => {
    return getAssessmentPlanSummary(course, sortedAssessments);
  }, [course, sortedAssessments]);

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

  const visibleStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();

    if (!q) return sortedStudents;

    return sortedStudents.filter((student) => {
      const roll = String(student.roll || "").toLowerCase();
      const name = String(student.name || "").toLowerCase();
      const email = String(student.email || "").toLowerCase();

      return roll.includes(q) || name.includes(q) || email.includes(q);
    });
  }, [sortedStudents, studentSearch]);

  useEffect(() => {
    inputRefs.current = [];
  }, [studentSearch, sortMode]);

  const gradeCounts = useMemo(() => {
    const counts = {
      "A+": 0,
      A: 0,
      "A-": 0,
      "B+": 0,
      B: 0,
      "B-": 0,
      "C+": 0,
      C: 0,
      D: 0,
      F: 0,
      I: 0,
    };

    sortedStudents.forEach((s) => {
      const row = marksMap[s.id] || {};
      const total = computeTotal100(
        course,
        assessments,
        row,
        Number(attMarksMap[s.id] || 0)
      );
      const grade = gradeForStudent(course, assessments, row, total);

      if (counts[grade] !== undefined) {
        counts[grade] += 1;
      }
    });

    return counts;
  }, [sortedStudents, marksMap, attMarksMap, course, assessments]);

  const activeAdvancedAssessment = useMemo(() => {
    if (!advancedModal.assessmentId) return null;
    return assessments.find(
      (a) => String(a._id) === String(advancedModal.assessmentId)
    ) || null;
  }, [advancedModal.assessmentId, assessments]);

  const activeAdvancedStudent = useMemo(() => {
    return visibleStudents[advancedModal.studentIndex] || null;
  }, [visibleStudents, advancedModal.studentIndex]);

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
    const rawValue = String(value ?? "").trim();
    const isAbsent = isAbsentInputValue(rawValue);

    if (!isHalfMarkDraftAllowed(rawValue)) {
      return;
    }

    const numericValue = rawValue === "" || isAbsent ? 0 : toHalfMarkNumber(rawValue);

    const assessment = assessments.find(
      (a) => String(a._id) === String(assessmentId)
    );

    if (assessment && isAttendanceAssessment(assessment)) {
      setAttMarksMap((prev) => ({
        ...prev,
        [studentId]: clamp(numericValue, 0, Number(assessment.fullMarks || 5)),
      }));
    }

    setMarksMap((prev) => {
      const row = prev[studentId] || {};
      const oldCell = row[assessmentId] || {
        obtainedMarks: 0,
        status: "present",
        subMarks: {},
      };

      return {
        ...prev,
        [studentId]: {
          ...row,
          [assessmentId]: {
            ...oldCell,
            obtainedMarks: numericValue,
            inputValue: isAbsent ? "A" : rawValue,
            status: isAbsent ? "absent" : "present",
          },
        },
      };
    });
  };

  const handleMarkBlur = (studentId, assessmentId) => {
    const currentRow = marksMap[studentId] || {};
    const oldCellFromState = currentRow[assessmentId];

    if (!oldCellFromState || isIncompleteCell(oldCellFromState)) return;

    const normalized = normalizeHalfMarkInputValue(
      oldCellFromState.inputValue ?? oldCellFromState.obtainedMarks ?? ""
    );

    const assessment = assessments.find(
      (a) => String(a._id) === String(assessmentId)
    );

    const normalizedNumber = normalized === "" ? 0 : toHalfMarkNumber(normalized);
    const nextCell = {
      ...oldCellFromState,
      obtainedMarks: normalizedNumber,
      inputValue: normalized,
      status: "present",
    };
    const nextRowForNotice = {
      ...currentRow,
      [assessmentId]: nextCell,
    };

    const wasComplete = isRowCompleteForFinalCheck(markInputAssessments, currentRow);
    const isCompleteNow = isRowCompleteForFinalCheck(markInputAssessments, nextRowForNotice);
    const completionNotice =
      !wasComplete && isCompleteNow
        ? getFinalCompletionNotice(
            course,
            assessments,
            nextRowForNotice,
            Number(attMarksMap[studentId] || 0),
            markInputAssessments,
            assessmentPlanSummary.total
          )
        : null;

    if (assessment && isAttendanceAssessment(assessment)) {
      setAttMarksMap((prev) => ({
        ...prev,
        [studentId]: clamp(normalizedNumber, 0, Number(assessment.fullMarks || 5)),
      }));
    }

    setMarksMap((prev) => {
      const row = prev[studentId] || {};
      const oldCell = row[assessmentId];

      if (!oldCell || isIncompleteCell(oldCell)) return prev;

      return {
        ...prev,
        [studentId]: {
          ...row,
          [assessmentId]: {
            ...oldCell,
            obtainedMarks: normalizedNumber,
            inputValue: normalized,
            status: "present",
          },
        },
      };
    });

    if (completionNotice) {
      window.setTimeout(() => {
        Swal.fire({
          icon: completionNotice.type === "error" ? "warning" : "info",
          title:
            completionNotice.type === "error"
              ? "Fraction not allowed"
              : "Grade improvement suggestion",
          text: completionNotice.message,
          timer: 2600,
          showConfirmButton: false,
        });
      }, 0);
    }
  };

  const handleAdvancedAbsentToggle = (studentId, assessmentId) => {
    setMarksMap((prev) => {
      const row = prev[studentId] || {};
      const oldCell = row[assessmentId] || {
        obtainedMarks: 0,
        status: "present",
        subMarks: {},
      };

      const currentlyAbsent = isIncompleteCell(oldCell);

      return {
        ...prev,
        [studentId]: {
          ...row,
          [assessmentId]: currentlyAbsent
            ? {
              ...oldCell,
              status: "present",
            }
            : {
              obtainedMarks: 0,
              status: "absent",
              subMarks: {},
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
    const rawValue = String(value ?? "").trim();

    if (!isHalfMarkDraftAllowed(rawValue)) {
      return;
    }

    const full = Number(fullMarks || 0);
    const numericValue = rawValue === "" ? 0 : toHalfMarkNumber(rawValue);
    const safeValue = clamp(numericValue, 0, full);

    setMarksMap((prev) => {
      const row = prev[studentId] || {};
      const oldCell = row[assessment._id] || {
        obtainedMarks: 0,
        status: "present",
        subMarks: {},
        subMarkInputs: {},
      };

      const nextSubMarks = {
        ...(oldCell.subMarks || {}),
        [subKey]: safeValue,
      };

      const nextSubMarkInputs = {
        ...(oldCell.subMarkInputs || {}),
        [subKey]:
          numericValue > full && full > 0
            ? formatHalfMarkValue(full)
            : rawValue,
      };

      const total = calculateAdvancedObtained(assessment, nextSubMarks);

      return {
        ...prev,
        [studentId]: {
          ...row,
          [assessment._id]: {
            ...oldCell,
            obtainedMarks: total,
            status: "present",
            subMarks: nextSubMarks,
            subMarkInputs: nextSubMarkInputs,
          },
        },
      };
    });
  };

  const handleAdvancedSubMarkBlur = (studentId, assessment, subKey, fullMarks) => {
    setMarksMap((prev) => {
      const row = prev[studentId] || {};
      const oldCell = row[assessment._id];

      if (!oldCell || isIncompleteCell(oldCell)) return prev;

      const full = Number(fullMarks || 0);

      const oldInput =
        oldCell.subMarkInputs?.[subKey] ??
        oldCell.subMarks?.[subKey] ??
        "";

      const normalized = normalizeHalfMarkInputValue(oldInput);
      const numericValue = normalized === "" ? 0 : toHalfMarkNumber(normalized);
      const safeValue = clamp(numericValue, 0, full);

      const nextSubMarks = {
        ...(oldCell.subMarks || {}),
        [subKey]: safeValue,
      };

      const nextSubMarkInputs = {
        ...(oldCell.subMarkInputs || {}),
        [subKey]: normalized === "" ? "" : formatHalfMarkValue(safeValue),
      };

      const total = calculateAdvancedObtained(assessment, nextSubMarks);

      return {
        ...prev,
        [studentId]: {
          ...row,
          [assessment._id]: {
            ...oldCell,
            obtainedMarks: total,
            status: "present",
            subMarks: nextSubMarks,
            subMarkInputs: nextSubMarkInputs,
          },
        },
      };
    });
  };

  const openAdvancedModal = (student, assessment) => {
    const index = visibleStudents.findIndex((s) => String(s.id) === String(student.id));
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
      studentIndex: Math.min(visibleStudents.length - 1, prev.studentIndex + 1),
    }));
  };

  const getFocusableCells = () => {
    const cells = [];

    inputRefs.current.forEach((rowRefs, rowIndex) => {
      if (!Array.isArray(rowRefs)) return;

      rowRefs.forEach((el, colIndex) => {
        if (!el || el.disabled) return;
        cells.push({ row: rowIndex, col: colIndex, el });
      });
    });

    return cells;
  };

  const focusCellByPosition = (row, col) => {
    const target = inputRefs.current?.[row]?.[col];
    if (!target || target.disabled) return false;

    target.focus();
    target.select?.();
    return true;
  };

  const moveTabFocus = (row, col, reverse = false) => {
    const focusableCells = getFocusableCells();

    if (!focusableCells.length) return;

    const orderedCells = [...focusableCells].sort((a, b) => {
      if (tabMode === "column") {
        if (a.col !== b.col) return a.col - b.col;
        return a.row - b.row;
      }

      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

    const currentIndex = orderedCells.findIndex(
      (cell) => cell.row === row && cell.col === col
    );

    if (currentIndex === -1) return;

    const nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;
    const nextCell = orderedCells[nextIndex];

    if (!nextCell) return;

    nextCell.el.focus();
    nextCell.el.select?.();
  };

  const handleKeyDown = (e) => {
    const row = Number(e.currentTarget.dataset.row);
    const col = Number(e.currentTarget.dataset.col);

    if (Number.isNaN(row) || Number.isNaN(col)) return;

    if (e.key === "Tab") {
      e.preventDefault();
      moveTabFocus(row, col, e.shiftKey);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      moveTabFocus(row, col, e.shiftKey);
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusCellByPosition(row, col + 1);
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusCellByPosition(row, col - 1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCellByPosition(row + 1, col);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCellByPosition(row - 1, col);
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
  }, [advancedModal.open, visibleStudents.length]);



  const handleFetchFromObe = async () => {
    try {
      setSyncingObeMarks(true);
      setMarksError("");

      const [setupData, blueprintRows] = await Promise.all([
        getObeSetup(courseId).catch(() => null),
        getObeBlueprints(courseId),
      ]);

      const usableBlueprints = (Array.isArray(blueprintRows) ? blueprintRows : []).filter(
        (blueprint) =>
          courseType !== "lab" || ["mid", "final"].includes(String(blueprint?.assessmentType || "").toLowerCase())
      );

      if (!usableBlueprints.length) {
        await premiumSwal({
          icon: "info",
          title: "No OBE assessment blueprint found",
          html: `
            <div class="premium-dialog-card" style="padding:16px">
              <div class="premium-dialog-strong" style="font-weight:800">There is nothing to fetch yet.</div>
              <div class="premium-dialog-muted" style="margin-top:7px">Create the OBE assessment blueprint first, or import the course outline / OBE Excel from the OBE / CO-PO tab. Once the blueprint exists, this marksheet can create missing assessment fields and fetch the saved totals.</div>
            </div>
          `,
          confirmButtonText: "Open OBE / CO-PO",
          showCancelButton: true,
          cancelButtonText: "Close",
        }).then((result) => {
          if (result.isConfirmed && typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "obe");
            window.location.href = url.toString();
          }
        });
        return;
      }

      const defaults = buildObeFetchDefaults(usableBlueprints, assessments, courseType);
      setObeFetch({
        open: true,
        busy: false,
        blueprints: usableBlueprints,
        setup: setupData,
        mappings: defaults.mappings,
        createConfigs: defaults.createConfigs,
        overwriteExisting: true,
      });
    } catch (error) {
      console.error(error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to load OBE/CO-PO assessments.";
      setMarksError(message);
      premiumSwal({
        icon: "error",
        title: "Could not prepare OBE fetch",
        text: message,
        confirmButtonText: "Close",
      });
    } finally {
      setSyncingObeMarks(false);
    }
  };

  const closeObeFetch = () => {
    if (obeFetch.busy) return;
    setObeFetch((prev) => ({ ...prev, open: false }));
  };

  const updateObeFetchMapping = (blueprintId, value) => {
    setObeFetch((prev) => ({
      ...prev,
      mappings: { ...prev.mappings, [blueprintId]: value },
    }));
  };

  const updateObeFetchCreateConfig = (blueprintId, field, value) => {
    setObeFetch((prev) => ({
      ...prev,
      createConfigs: {
        ...prev.createConfigs,
        [blueprintId]: {
          ...(prev.createConfigs?.[blueprintId] || {}),
          [field]: value,
        },
      },
    }));
  };

  const executeObeFetch = async () => {
    const selectedBlueprints = (obeFetch.blueprints || []).filter((blueprint) => {
      const mapping = obeFetch.mappings?.[String(blueprint._id)];
      return mapping && mapping !== "skip";
    });

    if (!selectedBlueprints.length) {
      premiumSwal({
        icon: "warning",
        title: "Select at least one OBE assessment",
        text: "Choose an existing marksheet field or Create from OBE for at least one assessment.",
      });
      return;
    }

    const existingAssessmentIds = selectedBlueprints
      .map((blueprint) => obeFetch.mappings[String(blueprint._id)])
      .filter((value) => value?.startsWith("assessment:"))
      .map((value) => value.replace("assessment:", ""));
    const duplicateAssessment = existingAssessmentIds.find(
      (id, index) => existingAssessmentIds.indexOf(id) !== index
    );
    if (duplicateAssessment) {
      premiumSwal({
        icon: "warning",
        title: "Duplicate marksheet mapping",
        text: "Two OBE assessments are mapped to the same marksheet field. Select a different destination for one of them.",
      });
      return;
    }

    setObeFetch((prev) => ({ ...prev, busy: true }));
    setSyncingObeMarks(true);

    let createdCount = 0;
    try {
      const mappingRows = [];
      let nextOrder =
        Math.max(0, ...(assessments || []).map((assessment) => Number(assessment.order || 0))) + 1;

      for (const blueprint of selectedBlueprints) {
        const blueprintId = String(blueprint._id);
        const mapping = obeFetch.mappings[blueprintId];

        if (mapping === "create") {
          const payload = buildMarksAssessmentFromObeBlueprint(
            blueprint,
            obeFetch.createConfigs?.[blueprintId] || {},
            courseType,
            nextOrder
          );
          nextOrder += 1;

          const response = await createAssessmentRequest(courseId, payload);
          const created = Array.isArray(response?.assessments)
            ? response.assessments.length === 1
              ? response.assessments[0]
              : null
            : response;
          if (!created?._id) {
            throw new Error(
              response?.assessments?.length > 1
                ? `${blueprint.assessmentName} created more than one marksheet field. Open Assessments and map the OBE assessment manually.`
                : `Could not create ${payload.name}.`
            );
          }
          createdCount += 1;
          mappingRows.push({ blueprintId, assessmentId: String(created._id) });
          continue;
        }

        if (mapping?.startsWith("assessment:")) {
          mappingRows.push({
            blueprintId,
            assessmentId: mapping.replace("assessment:", ""),
          });
        }
      }

      if (!mappingRows.length) {
        throw new Error("No OBE-to-marksheet mapping was selected.");
      }

      const result = await syncMarksFromObeRequest(courseId, {
        mappings: mappingRows,
        overwriteExisting: obeFetch.overwriteExisting,
      });
      await loadAllData();
      setObeFetch((prev) => ({ ...prev, open: false, busy: false }));

      const matched = Array.isArray(result?.matchedAssessments)
        ? result.matchedAssessments
        : [];
      const skipped = Array.isArray(result?.skippedBlueprints)
        ? result.skippedBlueprints
        : [];
      const importedRecords = Number(result?.importedRecords || 0);
      const protectedRecords = Number(result?.protectedExistingRecords || 0);

      await premiumSwal({
        icon: importedRecords > 0 || createdCount > 0 ? "success" : "info",
        title:
          importedRecords > 0 || createdCount > 0
            ? "OBE fetch completed"
            : "Nothing needed to change",
        html: `
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
            <div class="premium-dialog-card" style="padding:13px"><div class="premium-dialog-muted" style="font-size:10px;font-weight:800;text-transform:uppercase">Marks imported</div><div class="premium-dialog-success" style="font-size:22px;font-weight:900;margin-top:3px">${importedRecords}</div></div>
            <div class="premium-dialog-card" style="padding:13px"><div class="premium-dialog-muted" style="font-size:10px;font-weight:800;text-transform:uppercase">Assessments created</div><div class="premium-dialog-accent" style="font-size:22px;font-weight:900;margin-top:3px">${createdCount}</div></div>
            <div class="premium-dialog-card" style="padding:13px"><div class="premium-dialog-muted" style="font-size:10px;font-weight:800;text-transform:uppercase">Mappings used</div><div class="premium-dialog-sky" style="font-size:22px;font-weight:900;margin-top:3px">${matched.length}</div></div>
            <div class="premium-dialog-card" style="padding:13px"><div class="premium-dialog-muted" style="font-size:10px;font-weight:800;text-transform:uppercase">Existing protected</div><div style="font-size:22px;font-weight:900;margin-top:3px;color:#fde68a">${protectedRecords}</div></div>
          </div>
          ${skipped.length ? `<div class="premium-dialog-warning" style="margin-top:12px;padding:11px 13px"><strong>${skipped.length} OBE item(s) were not fetched.</strong> Review the selected mapping if something is missing.</div>` : ""}
        `,
        confirmButtonText: "Done",
      });
    } catch (error) {
      console.error(error);
      if (createdCount) await loadAllData().catch(() => {});
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to fetch marks from OBE/CO-PO.";
      setMarksError(message);
      setObeFetch((prev) => ({ ...prev, busy: false }));
      premiumSwal({
        icon: "error",
        title: "OBE fetch could not be completed",
        text: message,
        confirmButtonText: "Review mapping",
      });
    } finally {
      setSyncingObeMarks(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMarksError("");

      if (assessmentPlanSummary.errors.length) {
        const message = assessmentPlanSummary.errors.join(" ");
        setMarksError(message);
        Swal.fire({
          icon: "warning",
          title: "Assessment total problem",
          text: message,
        });
        return;
      }

      const completedFractionRows = sortedStudents.filter((student) => {
        const row = marksMap[student.id] || {};
        const notice = getFinalCompletionNotice(
          course,
          assessments,
          row,
          Number(attMarksMap[student.id] || 0),
          markInputAssessments,
          assessmentPlanSummary.total
        );
        return notice?.type === "error";
      });

      if (completedFractionRows.length) {
        const firstStudent = completedFractionRows[0];
        const message = `${firstStudent.roll || firstStudent.name || "A student"} has a fractional final total after all assessments are filled. Final total must be a whole number.`;
        setMarksError(message);
        Swal.fire({
          icon: "warning",
          title: "Fraction not allowed",
          text: message,
        });
        return;
      }

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
            status: isIncompleteCell(cell) ? getMarkStatus(cell) : "present",
            subMarks:
              assessment?.structureType === "lab_final" && !isIncompleteCell(cell)
                ? subMarks
                : [],
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
            ? {
                ...a,
                isPublished: true,
                publishedAt: new Date().toISOString(),
                showMarksToStudents: a.showMarksToStudents !== false,
              }
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

  const handleUnpublish = async (assessment) => {
    const assessmentId = assessment?._id;

    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Unpublish this assessment?",
      text: "Students will no longer see this assessment, and it will be excluded from their displayed total and grade until you publish it again.",
      showCancelButton: true,
      confirmButtonText: "Yes, unpublish",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#e11d48",
    });

    if (!confirmation.isConfirmed) return;

    try {
      setUnpublishingAssessmentId(assessmentId);
      await unpublishAssessmentRequest(courseId, assessmentId);

      setAssessments((prev) =>
        prev.map((a) =>
          String(a._id) === String(assessmentId)
            ? { ...a, isPublished: false, publishedAt: null }
            : a
        )
      );

      Swal.fire({
        icon: "success",
        title: "Unpublished",
        text: "The assessment is no longer visible at the student end.",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: "error",
        title: "Unpublish failed",
        text: e?.response?.data?.message || "Failed to unpublish assessment",
      });
    } finally {
      setUnpublishingAssessmentId(null);
    }
  };

  const handleToggleStudentMarkVisibility = async (assessment) => {
    const assessmentId = assessment?._id;
    const showMarksToStudents = assessment?.showMarksToStudents === false;

    try {
      setVisibilityAssessmentId(assessmentId);
      await updateAssessmentStudentVisibilityRequest(
        courseId,
        assessmentId,
        showMarksToStudents
      );

      setAssessments((prev) =>
        prev.map((a) =>
          String(a._id) === String(assessmentId)
            ? { ...a, showMarksToStudents }
            : a
        )
      );

      Swal.fire({
        icon: "success",
        title: showMarksToStudents ? "Exam mark visible" : "Exam mark hidden",
        text: showMarksToStudents
          ? "Students can see this individual assessment mark again."
          : "This individual mark is hidden, but it still contributes to the student's total and grade.",
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        icon: "error",
        title: "Visibility update failed",
        text:
          e?.response?.data?.message ||
          "Failed to update the assessment visibility",
      });
    } finally {
      setVisibilityAssessmentId(null);
    }
  };


  const buildExcelCreateConfigs = (preview) => {
    const configs = {};
    (preview?.columns || []).forEach((column) => {
      configs[column.key] = {
        name: column.createName || "Assessment",
        fullMarks: suggestedCreateFullMarks(column),
      };
    });
    return configs;
  };

  const openExcelImportForSheet = (
    workbook,
    sheetName,
    extra = {},
    manualSetup = null
  ) => {
    const firstInspection = inspectMarksSheet(workbook, sheetName, {
      headerRow: manualSetup?.headerRow,
    });
    const setup = manualSetup || firstInspection.suggested || {
      headerRow: "",
      rollCol: "",
      nameCol: -1,
    };
    const inspection = inspectMarksSheet(workbook, sheetName, {
      headerRow: setup.headerRow,
    });
    const preview = parseMarksSheet(workbook, sheetName, {
      courseType,
      headerRow: setup.headerRow,
      rollCol: setup.rollCol,
      nameCol: setup.nameCol,
    });
    const mappings = preview?.error
      ? {}
      : buildAutoExcelImportMappings(preview.columns, excelImportTargets);
    const createConfigs = buildExcelCreateConfigs(preview);

    if (!preview?.error && excelImportTargets.length === 0) {
      (preview.columns || []).forEach((column) => {
        if (column.recommended && column.category !== "grand_total") {
          mappings[column.key] = "create";
        }
      });
    }

    setExcelImport((prev) => ({
      ...prev,
      ...extra,
      open: true,
      workbook,
      sheetName,
      preview,
      mappings,
      createConfigs,
      showAllColumns: true,
      sheetInspection: inspection,
      sheetSetup: {
        headerRow: setup.headerRow ?? "",
        rollCol: setup.rollCol ?? "",
        nameCol: setup.nameCol ?? -1,
      },
      setupOpen: Boolean(preview?.error),
      busy: false,
    }));
  };

  const handleExcelImportFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseMarksWorkbook(buffer);
      if (!parsed.sheetNames.length) {
        throw new Error("The Excel workbook does not contain any worksheet.");
      }

      const defaultSheet = chooseDefaultMarksSheet(parsed.sheetNames, course);
      openExcelImportForSheet(parsed.workbook, defaultSheet, {
        fileName: file.name,
        sheetNames: parsed.sheetNames,
        importPolicy: "blank_only",
      });
    } catch (error) {
      console.error(error);
      premiumSwal({
        icon: "error",
        title: "Excel import failed",
        text: error?.message || "The workbook could not be read.",
      });
    }
  };

  const handleExcelImportSheetChange = (sheetName) => {
    if (!excelImport.workbook) return;
    openExcelImportForSheet(excelImport.workbook, sheetName, {
      fileName: excelImport.fileName,
      sheetNames: excelImport.sheetNames,
      importPolicy: excelImport.importPolicy,
    });
  };

  const handleExcelImportSheetSetupChange = (field, value) => {
    setExcelImport((prev) => {
      const numericValue = value === "" ? "" : Number(value);
      const nextSetup = {
        ...(prev.sheetSetup || {}),
        [field]: numericValue,
      };
      const nextInspection =
        field === "headerRow" && prev.workbook
          ? inspectMarksSheet(prev.workbook, prev.sheetName, {
              headerRow: numericValue,
            })
          : prev.sheetInspection;

      return {
        ...prev,
        sheetSetup: nextSetup,
        sheetInspection: nextInspection,
      };
    });
  };

  const handleApplyExcelImportSheetSetup = () => {
    if (!excelImport.workbook) return;
    if (excelImport.sheetSetup?.rollCol === "" || excelImport.sheetSetup?.rollCol == null) {
      premiumSwal({
        icon: "warning",
        title: "Student ID column required",
        text: "Choose the Excel column that contains Student ID or Roll before detecting mark columns.",
      });
      return;
    }

    openExcelImportForSheet(
      excelImport.workbook,
      excelImport.sheetName,
      {
        fileName: excelImport.fileName,
        sheetNames: excelImport.sheetNames,
        importPolicy: excelImport.importPolicy,
      },
      excelImport.sheetSetup
    );
  };

  const handleExcelImportMappingChange = (columnKey, value) => {
    setExcelImport((prev) => ({
      ...prev,
      mappings: { ...prev.mappings, [columnKey]: value },
    }));
  };

  const handleExcelImportCreateConfigChange = (columnKey, field, value) => {
    setExcelImport((prev) => ({
      ...prev,
      createConfigs: {
        ...prev.createConfigs,
        [columnKey]: {
          ...(prev.createConfigs?.[columnKey] || {}),
          [field]: value,
        },
      },
    }));
  };

  const handleExcelImportAutoMatch = () => {
    const columns = excelImport.preview?.columns || [];
    setExcelImport((prev) => ({
      ...prev,
      mappings: buildAutoExcelImportMappings(columns, excelImportTargets),
    }));
  };

  const handleExcelImportCreateRecommended = () => {
    const columns = excelImport.preview?.columns || [];
    setExcelImport((prev) => {
      const nextMappings = { ...(prev.mappings || {}) };
      const nextConfigs = { ...(prev.createConfigs || {}) };

      const alreadyMappedColumns = columns.filter((column) => {
        const mapping = nextMappings[column.key];
        return mapping && mapping !== "ignore" && mapping !== "create";
      });

      columns.forEach((column) => {
        if (!column.recommended || column.category === "grand_total") return;
        if (nextMappings[column.key] && nextMappings[column.key] !== "ignore") return;

        const isGenericColumn = column.category === "other";
        const sameCategoryAlreadyMapped =
          !isGenericColumn &&
          alreadyMappedColumns.some(
            (other) =>
              other.key !== column.key &&
              other.category === column.category
          );
        const compatibleExistingTarget =
          !isGenericColumn &&
          excelImportTargets.some((target) =>
            target.category === column.category ||
            (column.category === "ct_aggregate" && target.category === "ct") ||
            (column.category === "ct" && target.category === "ct_aggregate")
          );
        const aggregateCtAlreadyCovered =
          column.category === "ct_aggregate" &&
          alreadyMappedColumns.some((other) => other.category === "ct");
        const aggregateGroupAlreadyCovered =
          column.isAggregate &&
          alreadyMappedColumns.some(
            (other) =>
              normalizeImportLabel(other.parentHeader || "") ===
              normalizeImportLabel(column.parentHeader || "")
          );

        if (
          sameCategoryAlreadyMapped ||
          compatibleExistingTarget ||
          aggregateCtAlreadyCovered ||
          aggregateGroupAlreadyCovered
        ) {
          return;
        }

        nextMappings[column.key] = "create";
        nextConfigs[column.key] = nextConfigs[column.key] || {
          name: column.createName || "Assessment",
          fullMarks: suggestedCreateFullMarks(column),
        };
      });

      return {
        ...prev,
        mappings: nextMappings,
        createConfigs: nextConfigs,
      };
    });
  };

  const closeExcelImport = () => {
    if (excelImport.busy) return;
    setExcelImport((prev) => ({ ...prev, open: false }));
  };

  const executeExcelMarksImport = async () => {
    const preview = excelImport.preview;
    if (!preview || preview.error) return;

    const activeColumns = (preview.columns || []).filter((column) => {
      const mapping = excelImport.mappings?.[column.key];
      return mapping && mapping !== "ignore";
    });

    if (!activeColumns.length) {
      premiumSwal({
        icon: "warning",
        title: "Nothing selected",
        text: "Map at least one Excel column to an assessment, or choose Create new assessment.",
      });
      return;
    }

    const existingTargetKeys = activeColumns
      .map((column) => excelImport.mappings[column.key])
      .filter((value) => value && value !== "create" && value !== "ignore");
    const duplicateTarget = existingTargetKeys.find(
      (key, index) => existingTargetKeys.indexOf(key) !== index
    );
    if (duplicateTarget) {
      const target = excelImportTargets.find((item) => item.key === duplicateTarget);
      premiumSwal({
        icon: "warning",
        title: "Duplicate mapping",
        text: `${target?.label || "One marksheet field"} is mapped from more than one Excel column. Use one source column per target.`,
      });
      return;
    }

    const createOrder = {
      ct_aggregate: 10,
      lab_component: 10,
      ct: 11,
      lab_evaluation: 12,
      mid: 20,
      attendance: 30,
      assignment: 40,
      presentation: 41,
      project: 42,
      final: 50,
      other: 60,
    };
    const createColumns = activeColumns
      .filter((column) => excelImport.mappings[column.key] === "create")
      .sort(
        (a, b) =>
          Number(createOrder[a.category] ?? 60) -
          Number(createOrder[b.category] ?? 60)
      );

    const createNameKeys = createColumns.map((column) =>
      normalizeImportLabel(excelImport.createConfigs?.[column.key]?.name || "")
    );
    const duplicateCreateName = createNameKeys.find(
      (key, index) => key && createNameKeys.indexOf(key) !== index
    );
    if (duplicateCreateName) {
      premiumSwal({
        icon: "warning",
        title: "Duplicate new assessment",
        text: "Two Excel columns are trying to create the same assessment. Keep only one or use manual mapping.",
      });
      return;
    }

    for (const column of createColumns) {
      const config = excelImport.createConfigs?.[column.key] || {};
      const name = String(config.name || "").trim();
      const fullMarks = Number(config.fullMarks);
      if (!name || !Number.isFinite(fullMarks) || fullMarks <= 0) {
        premiumSwal({
          icon: "warning",
          title: "New assessment incomplete",
          text: `${column.sourceLabel} needs a valid assessment name and full marks.`,
        });
        return;
      }
      if (
        courseType === "hybrid" &&
        ["mid", "final"].includes(column.category)
      ) {
        premiumSwal({
          icon: "warning",
          title: "Hybrid exam needs setup first",
          text: "For a hybrid course, create the Theory/Lab Mid or Final fields from Assessments first, then map the Excel columns to those fields.",
        });
        return;
      }
    }

    const studentByRoll = new Map(
      (students || [])
        .filter((student) => student?.roll != null)
        .map((student) => [String(student.roll).trim(), student])
    );
    const matchedRows = (preview.rows || []).filter((row) =>
      studentByRoll.has(String(row.roll || "").trim())
    );
    if (!matchedRows.length) {
      premiumSwal({
        icon: "error",
        title: "No students matched",
        text: "None of the Excel Roll/ID values match students enrolled in this course.",
      });
      return;
    }

    if (excelImport.importPolicy === "replace") {
      const confirmation = await premiumSwal({
        icon: "warning",
        title: "Replace existing marks?",
        text: "Mapped Excel values will replace marks that are already present. Blank Excel cells will still be ignored.",
        showCancelButton: true,
        confirmButtonText: "Yes, replace marks",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#d97706",
      });
      if (!confirmation.isConfirmed) return;
    }

    setExcelImport((prev) => ({ ...prev, busy: true }));

    let createdCount = 0;
    let anyAssessmentCreated = false;

    try {
      const targetMap = new Map(excelImportTargets.map((target) => [target.key, target]));
      const effectiveMappings = { ...(excelImport.mappings || {}) };
      let nextOrder =
        Math.max(0, ...(sortedAssessments || []).map((item) => Number(item.order || 0))) + 1;

      for (const column of createColumns) {
        const config = excelImport.createConfigs[column.key];
        const response = await createAssessmentRequest(courseId, {
          name: String(config.name).trim(),
          fullMarks: Number(config.fullMarks),
          order: nextOrder,
          structureType: "regular",
        });
        nextOrder += 1;

        const created = response?.assessments
          ? response.assessments.length === 1
            ? response.assessments[0]
            : null
          : response;

        if (!created?._id) {
          throw new Error(
            response?.assessments?.length > 1
              ? "One Excel column produced multiple assessment fields. Please create those assessment fields manually and map them instead."
              : `Could not create ${config.name}.`
          );
        }

        anyAssessmentCreated = true;
        createdCount += 1;
        const target = {
          key: `assessment:${created._id}`,
          type: "assessment",
          assessmentId: String(created._id),
          assessment: created,
          label: created.name,
          shortLabel: created.name,
          fullMarks: Number(created.fullMarks || 0),
          category: importCategory(created.name),
          locked: false,
        };
        targetMap.set(target.key, target);
        effectiveMappings[column.key] = target.key;
      }

      const recordMap = new Map();
      let importedCells = 0;
      let skippedExisting = 0;
      let skippedInvalid = 0;
      let skippedOverMax = 0;
      let nameMismatchCount = 0;
      const unmatchedStudentRolls = new Set();
      const overwrittenCells = { count: 0 };

      const ensureRecord = (studentId, target) => {
        const key = `${studentId}:${target.assessmentId}`;
        if (!recordMap.has(key)) {
          recordMap.set(key, {
            studentId,
            assessmentId: target.assessmentId,
            assessment: target.assessment,
            regularValue: null,
            regularStatus: "present",
            subMarks: new Map(),
          });
        }
        return recordMap.get(key);
      };

      (preview.rows || []).forEach((row) => {
        const student = studentByRoll.get(String(row.roll || "").trim());
        if (!student) {
          unmatchedStudentRolls.add(String(row.roll || ""));
          return;
        }

        if (
          row.name &&
          student.name &&
          normalizeStudentNameForImport(row.name) !==
            normalizeStudentNameForImport(student.name)
        ) {
          nameMismatchCount += 1;
        }

        activeColumns.forEach((column) => {
          const targetKey = effectiveMappings[column.key];
          const target = targetMap.get(targetKey);
          if (!target || target.locked) return;

          const parsedValue = getImportValueKind(
            getExcelImportSourceValue(row, column, preview.columns || [])
          );
          if (parsedValue.kind === "blank") {
            return;
          }
          if (["invalid", "invalid_step"].includes(parsedValue.kind)) {
            skippedInvalid += 1;
            return;
          }
          if (target.type === "submark" && parsedValue.kind === "absent") {
            skippedInvalid += 1;
            return;
          }
          if (
            parsedValue.kind === "number" &&
            Number.isFinite(Number(target.fullMarks)) &&
            Number(target.fullMarks) >= 0 &&
            Number(parsedValue.value) > Number(target.fullMarks)
          ) {
            skippedOverMax += 1;
            return;
          }

          const alreadyFilled = isExistingImportTargetFilled(
            target,
            marksMap,
            student.id
          );
          if (alreadyFilled && excelImport.importPolicy === "blank_only") {
            skippedExisting += 1;
            return;
          }
          if (alreadyFilled && excelImport.importPolicy === "replace") {
            overwrittenCells.count += 1;
          }

          const record = ensureRecord(student.id, target);
          if (target.type === "submark") {
            record.subMarks.set(target.subKey, Number(parsedValue.value || 0));
          } else {
            record.regularStatus = parsedValue.kind === "absent" ? "absent" : "present";
            record.regularValue = Number(parsedValue.value || 0);
          }
          importedCells += 1;
        });
      });

      const payload = [];
      recordMap.forEach((record) => {
        if (record.assessment?.structureType === "lab_final") {
          if (!record.subMarks.size) return;
          payload.push({
            studentId: record.studentId,
            assessmentId: record.assessmentId,
            obtainedMarks: 0,
            status: "present",
            subMarks: [...record.subMarks.entries()].map(([key, obtainedMarks]) => ({
              key,
              obtainedMarks,
            })),
          });
          return;
        }

        if (record.regularValue == null) return;
        payload.push({
          studentId: record.studentId,
          assessmentId: record.assessmentId,
          obtainedMarks: record.regularValue,
          status: record.regularStatus,
          subMarks: [],
        });
      });

      if (payload.length) {
        await saveMarksForCourseRequest(courseId, payload);
      }

      await loadAllData();
      setExcelImport((prev) => ({ ...prev, open: false, busy: false }));

      const detailLines = [
        `${importedCells} Excel mark cell(s) imported`,
        createdCount ? `${createdCount} assessment(s) created` : "",
        overwrittenCells.count ? `${overwrittenCells.count} existing mark(s) replaced` : "",
        skippedExisting ? `${skippedExisting} existing mark(s) protected` : "",
        unmatchedStudentRolls.size ? `${unmatchedStudentRolls.size} student roll(s) not enrolled` : "",
        nameMismatchCount ? `${nameMismatchCount} name difference(s); matched safely by roll` : "",
        skippedInvalid ? `${skippedInvalid} invalid/non-.5 value(s) skipped` : "",
        skippedOverMax ? `${skippedOverMax} over-maximum value(s) skipped` : "",
      ].filter(Boolean);

      premiumSwal({
        icon: importedCells || createdCount ? "success" : "info",
        title: importedCells || createdCount ? "Excel import complete" : "Nothing was changed",
        html: detailLines.map((line) => `<div>${line}</div>`).join(""),
      });
    } catch (error) {
      console.error(error);
      if (anyAssessmentCreated) {
        await loadAllData().catch(() => {});
      }
      setExcelImport((prev) => ({ ...prev, busy: false }));
      premiumSwal({
        icon: "error",
        title: "Import could not be completed",
        text:
          error?.response?.data?.message ||
          error?.message ||
          "The selected assessments or marks could not be imported.",
      });
    }
  };

  const handleExportExcel = () => {
    const assessmentList = Array.isArray(sortedAssessments)
      ? sortedAssessments
      : [];

    const assessmentName = (assessment) =>
      String(assessment?.name || "").toLowerCase().trim();

    const findMidAssessment = () => {
      const structuredMid = assessmentList.find(
        (assessment) =>
          assessment?.structureType === "lab_final" &&
          getStructuredLabPeriod(assessment) === "mid"
      );

      if (structuredMid) return structuredMid;

      return assessmentList.find((assessment) => {
        const name = assessmentName(assessment);
        return name.includes("mid") && !name.includes("final");
      });
    };

    const findFinalAssessment = () => {
      const structuredFinal = assessmentList.find(
        (assessment) =>
          assessment?.structureType === "lab_final" &&
          getStructuredLabPeriod(assessment) === "final"
      );

      if (structuredFinal) return structuredFinal;

      return assessmentList.find((assessment) =>
        assessmentName(assessment).includes("final")
      );
    };

    const getScaledAssessmentValue = (row, assessment, targetMarks) => {
      if (!assessment) return 0;

      const cell = row?.[assessment._id];
      if (isIncompleteCell(cell)) return "A";

      const fullMarks = Number(assessment.fullMarks || 0);
      if (fullMarks <= 0) return 0;

      return roundPolicyTotal(
        pct(getMainMarkValue(cell), fullMarks) * Number(targetMarks || 0)
      );
    };

    const getTheoryMidValue = (row) => {
      if (courseType !== "hybrid") {
        return getScaledAssessmentValue(row, findMidAssessment(), 30);
      }

      const genericMid = assessmentList.find(isHybridGenericMidAssessment);
      if (genericMid) return getScaledAssessmentValue(row, genericMid, 30);

      if (hasHybridMidParts(assessmentList)) {
        return roundPolicyTotal(computeHybridMidTotal(assessmentList, row));
      }

      return getScaledAssessmentValue(row, findMidAssessment(), 30);
    };

    const getTheoryFinalValue = (row) => {
      if (courseType !== "hybrid") {
        return getScaledAssessmentValue(row, findFinalAssessment(), 40);
      }

      const genericFinal = assessmentList.find(isHybridGenericFinalAssessment);
      if (genericFinal) return getScaledAssessmentValue(row, genericFinal, 40);

      if (hasHybridFinalParts(assessmentList)) {
        return roundPolicyTotal(computeHybridFinalTotal(assessmentList, row));
      }

      return getScaledAssessmentValue(row, findFinalAssessment(), 40);
    };

    const getAssignmentValue = (row) => {
      const assignment = assessmentList.find((assessment) =>
        assessmentName(assessment).includes("assign")
      );
      const presentation = assessmentList.find((assessment) =>
        assessmentName(assessment).includes("present")
      );

      if (courseType === "hybrid") {
        if (!assignment) return 0;
        return roundPolicyTotal(
          pct(
            getMainMarkValue(row?.[assignment._id]),
            Number(assignment.fullMarks || 0)
          ) * getHybridAssignmentWeight(course)
        );
      }

      if (assignment && presentation) {
        const assignmentScore =
          pct(
            getMainMarkValue(row?.[assignment._id]),
            Number(assignment.fullMarks || 0)
          ) * 5;
        const presentationScore =
          pct(
            getMainMarkValue(row?.[presentation._id]),
            Number(presentation.fullMarks || 0)
          ) * 5;

        return roundPolicyTotal(assignmentScore + presentationScore);
      }

      const single = assignment || presentation;
      if (!single) return 0;

      return roundPolicyTotal(
        pct(
          getMainMarkValue(row?.[single._id]),
          Number(single.fullMarks || 0)
        ) * 10
      );
    };

    const isLabCourse = courseType === "lab";

    // Keep the exported marksheet deliberately compact and predictable.
    // These exact headers are also suitable for header-based import/fill tools.
    const header = isLabCourse
      ? ["Roll", "Student", "Lab Evaluation", "Final", "Mid Term", "Attendance"]
      : [
          "Roll",
          "Student",
          "Class Test",
          "Mid Term",
          "Final",
          "Attendance",
          "Assignment",
        ];

    const rows = sortedStudents.map((student) => {
      const row = marksMap[student.id] || {};
      const attendance = roundPolicyTotal(Number(attMarksMap[student.id] || 0));

      if (isLabCourse) {
        return [
          student.roll || "",
          student.name || "",
          getLabMain(assessmentList, row),
          getScaledAssessmentValue(row, findFinalAssessment(), 40),
          getScaledAssessmentValue(row, findMidAssessment(), 30),
          attendance,
        ];
      }

      return [
        student.roll || "",
        student.name || "",
        roundPolicyTotal(computeCtScore(course, assessmentList, row)),
        getTheoryMidValue(row),
        getTheoryFinalValue(row),
        attendance,
        getAssignmentValue(row),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    ws["!cols"] = header.map((columnName) => ({
      wch:
        columnName === "Student"
          ? 28
          : columnName === "Roll"
            ? 16
            : Math.max(14, columnName.length + 3),
    }));

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

  const handleExportPdf = () => {
    const doc = new jsPDF("landscape", "mm", "a4");

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const getLocalUserName = () => {
      // 1. Get name from top bar: "Signed in as Mahbub Sarwar"
      const pageText = document.body.innerText || "";
      const match = pageText.match(/Signed in as\s+([A-Za-z.\s]+)/i);

      if (match?.[1]) {
        return match[1]
          .replace("Teacher", "")
          .replace("Dark", "")
          .replace("Logout", "")
          .trim();
      }

      // 2. Get name from sidebar bottom, but ignore arrows/icons
      const allLines = pageText
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);

      const teacherAccountIndex = allLines.findIndex((x) =>
        x.includes("Teacher Account")
      );

      if (teacherAccountIndex > 0) {
        return allLines[teacherAccountIndex - 1].trim();
      }

      // 3. Try localStorage
      const keys = Object.keys(localStorage);

      for (const key of keys) {
        try {
          const value = localStorage.getItem(key);
          if (!value) continue;

          const parsed = JSON.parse(value);

          const possibleName =
            parsed?.name ||
            parsed?.displayName ||
            parsed?.fullName ||
            parsed?.user?.name ||
            parsed?.user?.displayName ||
            parsed?.teacher?.name ||
            parsed?.teacher?.displayName;

          if (possibleName) return possibleName;
        } catch {
          // ignore non-json values
        }
      }

      return "";
    };

    const teacherName =
      getLocalUserName() ||
      course?.teacherName ||
      course?.facultyName ||
      "Course Teacher";

    const rawSection = String(course?.section || "");
    const sectionParts = rawSection.includes("/") ? rawSection.split("/") : [];

    const intakeValue = course?.intake || sectionParts[0] || "";
    const sectionValue = sectionParts[1] || course?.section || "";

    const gradeScale = [
      ["80% and above", "A+", "(A Plus)", "4.00"],
      ["75% to less than 80%", "A", "(A regular)", "3.75"],
      ["70% to less than 75%", "A-", "(A Minus)", "3.50"],
      ["65% to less than 70%", "B+", "(B Plus)", "3.25"],
      ["60% to less than 65%", "B", "(B regular)", "3.00"],
      ["55% to less than 60%", "B-", "(B Minus)", "2.75"],
      ["50% to less than 55%", "C+", "(C Plus)", "2.50"],
      ["45% to less than 50%", "C", "(C regular)", "2.25"],
      ["40% to less than 45%", "D", "", "2.00"],
      ["Less than 40%", "F", "", "0.00"],
      ["Absent / Incomplete", "I", "", "0.00"],
    ];

    const getAssessmentByName = (keywords = []) => {
      return sortedAssessments.find((a) => {
        const n = String(a.name || "").toLowerCase();
        return keywords.some((k) => n.includes(k));
      });
    };

    const midAssessment =
      sortedAssessments.find(
        (a) =>
          a?.structureType === "lab_final" && getStructuredLabPeriod(a) === "mid"
      ) || getAssessmentByName(["mid"]);
    const finalAssessment =
      sortedAssessments.find(
        (a) =>
          a?.structureType === "lab_final" && getStructuredLabPeriod(a) === "final"
      ) || getAssessmentByName(["final"]);

    const assignmentAssessment = getAssessmentByName(["assign", "present"]);
    const hybridTheoryMid = findHybridTheoryMid(sortedAssessments);
    const hybridLabMid = findHybridLabMid(sortedAssessments);
    const hybridTheoryFinal = findHybridTheoryFinal(sortedAssessments);
    const hybridLabFinal = findHybridLabFinal(sortedAssessments);
    const hybridAssignment = getAssessmentByName(["assign"]);
    const ctWeight = getCtMainWeight(course);
    const hybridAssignmentWeight = getHybridAssignmentWeight(course);

    const header =
      courseType === "lab"
        ? [
          "SL",
          "Student ID",
          "Student Name",
          "Intake",
          "Lab Assessments\n25",
          "Mid Term\n30",
          "Final Term\n40",
          "Attendance\n5",
          "Total Marks\n100",
          "Letter Grade",
        ]
        : courseType === "hybrid"
          ? [
            "SL",
            "Student ID",
            "Student Name",
            "Intake",
            `Class Test\n${ctWeight}`,
            `Assignment\n${hybridAssignmentWeight}`,
            "Theory Mid\n20",
            "Lab Mid\n10",
            "Mid Term\n30",
            "Theory Final\n30",
            "Lab Final\n10",
            "Final Term\n40",
            "Attendance\n5",
            "Total Marks\n100",
            "Letter Grade",
          ]
          : [
            "SL",
            "Student ID",
            "Student Name",
            "Intake",
            "Class Test\n15",
            "Assignment /\nPresentation\n10",
            "Mid Term\n30",
            "Final\n40",
            "Attendance\n5",
            "Total Marks\n100",
            "Letter Grade",
          ];

    const body = sortedStudents.map((s, index) => {
      const row = marksMap[s.id] || {};
      const attendance = Number(attMarksMap[s.id] || 0);

      const total = computeTotal100(course, assessments, row, attendance);
      const grade = gradeForStudent(course, assessments, row, total);

      if (courseType === "lab") {
        return [
          index + 1,
          s.roll || "",
          s.name || "",
          intakeValue,
          getLabMain(assessments, row).toFixed(2),
          midAssessment
            ? Number(getMainMarkValue(row[midAssessment._id]) || 0).toFixed(2)
            : "0.00",
          finalAssessment
            ? formatMarkForReport(row[finalAssessment._id])
            : "0.00",
          attendance.toFixed(2),
          Number(total).toFixed(2),
          grade,
        ];
      }

      if (courseType === "hybrid") {
        const scaled = (assessment, weight) =>
          assessment
            ? (pct(getMainMarkValue(row[assessment._id]), assessment.fullMarks) * weight).toFixed(2)
            : "0.00";

        return [
          index + 1,
          s.roll || "",
          s.name || "",
          intakeValue,
          roundPolicyTotal(computeCtScore(course, assessments, row)).toFixed(2),
          scaled(hybridAssignment, hybridAssignmentWeight),
          scaled(hybridTheoryMid, 20),
          scaled(hybridLabMid, 10),
          Number(computeHybridMidTotal(assessments, row)).toFixed(2),
          scaled(hybridTheoryFinal, 30),
          scaled(hybridLabFinal, 10),
          Number(computeHybridFinalTotal(assessments, row)).toFixed(2),
          attendance.toFixed(2),
          Number(total).toFixed(2),
          grade,
        ];
      }

      return [
        index + 1,
        s.roll || "",
        s.name || "",
        intakeValue,
        roundPolicyTotal(computeCtScore(course, assessments, row)).toFixed(2),
        assignmentAssessment
          ? Number(getMainMarkValue(row[assignmentAssessment._id]) || 0).toFixed(2)
          : "0.00",
        midAssessment
          ? Number(getMainMarkValue(row[midAssessment._id]) || 0).toFixed(2)
          : "0.00",
        finalAssessment
          ? formatMarkForReport(row[finalAssessment._id])
          : "0.00",
        attendance.toFixed(2),
        Number(total).toFixed(2),
        grade,
      ];
    });

    const addHeader = () => {
      try {
        doc.addImage("/logo.png", "PNG", 18, 10, 16, 18);
      } catch (e) {
        console.warn("Logo could not be added:", e);
      }

      doc.setFont("times", "bold");
      doc.setFontSize(16);
      doc.text("Bangladesh University of Business and Technology", pageWidth / 2, 14, {
        align: "center",
      });

      doc.setFont("times", "normal");
      doc.setFontSize(11);
      doc.text("Rupnagar, Mirpur-02, Dhaka-1216", pageWidth / 2, 21, {
        align: "center",
      });

      doc.setFont("times", "normal");
      doc.setFontSize(14);
      doc.text("Result Sheet", pageWidth / 2, 29, { align: "center" });

      let y = 40;

      const leftInfo = [
        ["Program", course?.program || course?.department || ""],
        ["Semester", `${course?.semester || ""} ${course?.year || ""}`],
        [
          "Course No & Title",
          `[ ${course?.code || ""} ] ${course?.title || course?.name || ""}-${courseType === "lab" ? "Lab" : courseType === "hybrid" ? "Hybrid" : "Theory"
          }`,
        ],
        ["Intake & Section", `Intake # ${intakeValue}, Section # ${sectionValue}`],
        ["Teacher's Name", teacherName],
      ];

      leftInfo.forEach(([label, value]) => {
        doc.setFont("times", "bolditalic");
        doc.setFontSize(9);
        doc.text(label, 18, y);
        doc.text(":", 58, y);

        doc.setFont("times", "normal");
        doc.setFontSize(9);
        doc.text(String(value || ""), 64, y);
        y += 6;
      });

      autoTable(doc, {
        startY: 35,
        margin: { left: pageWidth - 95 },
        body: gradeScale,
        theme: "plain",
        styles: {
          font: "times",
          fontSize: 7.2,
          cellPadding: 0.4,
          textColor: [0, 0, 0],
        },
        columnStyles: {
          0: { cellWidth: 36 },
          1: { cellWidth: 9 },
          2: { cellWidth: 25 },
          3: { cellWidth: 11, halign: "right" },
        },
      });
    };

    const addFooter = (pageNumber, totalPages) => {
      const y = pageHeight - 22;

      doc.setFont("times", "bold");
      doc.setFontSize(9);

      doc.line(45, y, 85, y);
      doc.text(teacherName, 65, y + 5, { align: "center" });

      doc.line(pageWidth - 90, y, pageWidth - 50, y);
      doc.text("Chairman", pageWidth - 70, y + 5, { align: "center" });

      doc.setFont("times", "normal");
      doc.setFontSize(8);
      doc.text(`Print Date : ${new Date().toLocaleString()}`, 18, pageHeight - 8);
      doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 35, pageHeight - 8);
    };

    const getGradeCount = () => {
      const counts = {
        "A+": 0,
        A: 0,
        "A-": 0,
        "B+": 0,
        B: 0,
        "B-": 0,
        "C+": 0,
        C: 0,
        D: 0,
        F: 0,
        I: 0,
      };

      sortedStudents.forEach((s) => {
        const row = marksMap[s.id] || {};
        const attendance = Number(attMarksMap[s.id] || 0);
        const total = computeTotal100(course, assessments, row, attendance);
        const grade = gradeForStudent(course, assessments, row, total);
        counts[grade] = (counts[grade] || 0) + 1;
      });

      return counts;
    };

    const c = getGradeCount();

    const summaryBody = [
      ["A+", c["A+"] || 0, "C+", c["C+"] || 0],
      ["A", c.A || 0, "C", c.C || 0],
      ["A-", c["A-"] || 0, "D", c.D || 0],
      ["B+", c["B+"] || 0, "F", c.F || 0],
      ["B", c.B || 0, "I", c.I || 0],
      ["B-", c["B-"] || 0, "", ""],
    ];

    addHeader();

    autoTable(doc, {
      startY: 75,
      head: [header],
      body,
      theme: "grid",
      margin: { left: 14, right: 14, top: 75, bottom: 35 },
      styles: {
        font: "times",
        fontSize: 8,
        cellPadding: 1.2,
        halign: "center",
        valign: "middle",
        lineColor: [0, 0, 0],
        lineWidth: 0.12,
        textColor: [0, 0, 0],
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: "normal",
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 30 },
        2: { cellWidth: 58, halign: "left" },
        3: { cellWidth: 16 },
      },
      didParseCell: (data) => {
        const totalColIndex = header.length - 2;
        const gradeColIndex = header.length - 1;

        if (
          data.section === "body" &&
          (data.column.index === totalColIndex || data.column.index === gradeColIndex)
        ) {
          data.cell.styles.fontStyle = "bold";
        }
      },
      willDrawPage: (data) => {
        if (data.pageNumber > 1) {
          addHeader();
        }
      },
    });

    let summaryY = doc.lastAutoTable.finalY + 8;

    if (summaryY > pageHeight - 65) {
      doc.addPage();
      addHeader();
      summaryY = 75;
    }

    doc.setFont("times", "bolditalic");
    doc.setFontSize(10);
    doc.text("Result Summary :", pageWidth / 2 - 48, summaryY + 5);

    autoTable(doc, {
      startY: summaryY,
      body: summaryBody,
      theme: "grid",
      margin: { left: pageWidth / 2 - 15 },
      tableWidth: 55,
      styles: {
        font: "times",
        fontSize: 8,
        cellPadding: 1.2,
        lineColor: [0, 0, 0],
        lineWidth: 0.12,
        textColor: [0, 0, 0],
      },
    });

    const totalPages = doc.internal.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(i, totalPages);
    }

    doc.save(
      `Mark_Sheet_${course?.code || "course"}_${intakeValue}_${sectionValue}.pdf`
    );
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-6 py-5 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Marks Entry
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {courseType === "lab"
                    ? "Lab Assessment Main is calculated from total obtained marks divided by total lab assessment marks, then converted to 25."
                    : courseType === "hybrid"
                      ? "Hybrid marks entry: CT policy, Theory Mid, Lab Mid, Theory Final, Lab Final, Assignment, and Attendance."
                      : "Theory course marks entry with CT policy, Mid, Final, Assignment, Presentation, and Attendance."}
                </p>
              </div>

              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:max-w-[620px]">
                <MiniStat label="Students" value={students.length} />
                <MiniStat label="Assessments" value={assessments.length} />
                <MiniStat label="Entered Cells" value={enteredCount} />
                <MiniStat
                  label="Advanced Finals"
                  value={advancedLabFinalAssessments.length}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Grade Count Summary
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  Total: {students.length}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-11">
                {["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F", "I"].map((grade) => (
                  <div
                    key={grade}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {grade}
                    </div>
                    <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                      {gradeCounts[grade]}
                    </div>
                  </div>
                ))}
              </div>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Search Student
            </label>
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search by roll, name, or email"
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Showing {visibleStudents.length} of {sortedStudents.length} students
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 md:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h4 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">Marks Table</h4>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Import a workbook, prepare missing assessment fields from OBE, or enter marks manually in the table below.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={excelImportInputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm"
                onChange={handleExcelImportFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => excelImportInputRef.current?.click()}
                disabled={loading || saving}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 16v3h14v-3" strokeLinecap="round"/></svg>
                Import Excel
              </button>

              {["theory", "lab"].includes(courseType) && (
                <button
                  type="button"
                  onClick={handleFetchFromObe}
                  disabled={loading || saving || syncingObeMarks}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
                  title="Review OBE questions, map or create marksheet assessments, then fetch saved OBE marks"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 6h10M4 12h7M4 18h4" strokeLinecap="round"/><path d="M17 8v10m0 0 3-3m-3 3-3-3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {syncingObeMarks ? "Loading OBE..." : "Fetch OBE Marks"}
                </button>
              )}

              <div
                className={[
                  "inline-flex h-10 items-center rounded-xl border px-3 text-xs font-bold",
                  assessmentPlanSummary.errors.length
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                    : assessmentPlanSummary.total === 100
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                ].join(" ")}
              >
                Created total: {formatMarksAmount(assessmentPlanSummary.total)} / 100
              </div>
            </div>
          </div>
          {assessmentPlanSummary.errors.length > 0 && (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {assessmentPlanSummary.errors.join(" ")}
            </div>
          )}
        </div>

        <div className="p-4 md:p-6">
          <div className="space-y-3 overflow-visible">
            <div
              ref={topScrollbarRef}
              className="overflow-x-auto rounded-xl border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
            >
              <div
                style={{ width: `${topScrollbarWidth}px`, height: "18px" }}
                className="min-w-full"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
              <div
                ref={bottomScrollRef}
                className="overflow-x-auto overflow-y-visible"
              >
                <table ref={tableRef} className="min-w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "220px" }} />
                    {(courseType === "lab" ? labRegularAssessments : ctAssessments).map((a) => (
                      <col key={`main-${a._id}`} style={{ width: "150px" }} />
                    ))}
                    <col style={{ width: "150px" }} />
                    {nonCtDisplayColumns.map((col) => (
                      <col
                        key={`extra-${col.key}`}
                        style={{ width: col.type === "assessment" ? "190px" : "150px" }}
                      />
                    ))}
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "100px" }} />
                  </colgroup>
                  <thead className="bg-slate-50 dark:bg-slate-800 relative z-30">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="sticky top-0 left-0 z-30 w-[110px] min-w-[110px] bg-slate-50 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Roll
                      </th>

                      <th className="sticky top-0 left-[110px] z-30 w-[220px] min-w-[220px] bg-slate-50 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Student
                      </th>

                      {(courseType === "lab" ? labRegularAssessments : ctAssessments).map(
                        (a) => (
                          <th
                            key={a._id}
                            className="sticky top-0 z-20 w-[150px] min-w-[150px] bg-slate-50 dark:bg-slate-800 px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300"
                          >
                            <div className="space-y-2">
                              <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                                {a.name}
                              </div>
                              <div className="text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                                Full marks: {a.fullMarks}
                              </div>
                              {a.syncLocked && (
                                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold normal-case text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  Marks Sync connected • Editable
                                </div>
                              )}
                              <AssessmentPublishingControls
                                assessment={a}
                                publishingAssessmentId={publishingAssessmentId}
                                unpublishingAssessmentId={unpublishingAssessmentId}
                                visibilityAssessmentId={visibilityAssessmentId}
                                onPublish={handlePublish}
                                onUnpublish={handleUnpublish}
                                onToggleVisibility={handleToggleStudentMarkVisibility}
                              />
                            </div>
                          </th>
                        )
                      )}

                      <th className="sticky top-0 z-20 w-[150px] min-w-[150px] bg-slate-50 dark:bg-slate-800 px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                            {getMainColumnLabel(courseType)}
                          </div>
                          <div className="text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                            Full marks: {getMainColumnFullMarks(course, courseType)}
                          </div>
                          <div className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold normal-case text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                            Auto calculated
                          </div>
                        </div>
                      </th>

                      {nonCtDisplayColumns.map((col) => {
                        if (col.type === "hybrid_mid_total" || col.type === "hybrid_final_total") {
                          return (
                            <th
                              key={col.key}
                              className="sticky top-0 z-20 w-[150px] min-w-[150px] bg-slate-50 dark:bg-slate-800 px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                            >
                              <div className="space-y-2">
                                <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                                  {col.label}
                                </div>
                                <div className="text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                                  Full marks: {col.fullMarks}
                                </div>
                                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold normal-case text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  Auto calculated
                                </div>
                              </div>
                            </th>
                          );
                        }

                        const a = col.assessment;

                        return (
                          <th
                            key={a._id}
                            className="sticky top-0 z-20 w-[190px] min-w-[190px] bg-slate-50 dark:bg-slate-800 px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                          >
                            <div className="space-y-2">
                              <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                                {a.name}
                              </div>
                              <div className="text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                                Full marks: {a.fullMarks}
                              </div>
                              {a.syncLocked && (
                                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold normal-case text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  Marks Sync connected • Editable
                                </div>
                              )}
                              {a?.structureType === "lab_final" && (
                                <div className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-[11px] font-semibold normal-case text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                                  Breakdown entry enabled
                                </div>
                              )}
                              <AssessmentPublishingControls
                                assessment={a}
                                publishingAssessmentId={publishingAssessmentId}
                                unpublishingAssessmentId={unpublishingAssessmentId}
                                visibilityAssessmentId={visibilityAssessmentId}
                                onPublish={handlePublish}
                                onUnpublish={handleUnpublish}
                                onToggleVisibility={handleToggleStudentMarkVisibility}
                              />
                            </div>
                          </th>
                        );
                      })}

                      <th className="sticky top-0 z-20 w-[130px] min-w-[130px] bg-slate-50 dark:bg-slate-800 px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                            Total
                          </div>
                          <div
                            className={[
                              "text-[11px] font-medium normal-case",
                              assessmentPlanSummary.total > 100
                                ? "text-rose-500 dark:text-rose-300"
                                : "text-slate-400 dark:text-slate-500",
                            ].join(" ")}
                          >
                            Full marks: {formatMarksAmount(assessmentPlanSummary.total)} / 100
                          </div>
                        </div>
                      </th>

                      <th className="sticky top-0 z-20 w-[100px] min-w-[100px] bg-slate-50 dark:bg-slate-800 px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Grade
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleStudents.map((s, rowIndex) => {
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
                          <td className="sticky left-0 z-10 w-[110px] min-w-[110px] whitespace-nowrap bg-white px-4 py-3 font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {s.roll}
                          </td>

                          <td className="sticky left-[110px] z-10 w-[220px] min-w-[220px] whitespace-nowrap bg-white px-4 py-3 dark:bg-slate-900">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {s.name}
                            </div>
                          </td>

                          {(courseType === "lab" ? labRegularAssessments : ctAssessments).map(
                            (a, colIndex) => {
                              const cell = row[a._id];

                              return (
                                <td key={a._id} className="w-[150px] min-w-[150px] px-4 py-3 text-center">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    title={
                                      a.syncLocked
                                        ? "This value is connected to Marks Sync, but manual editing is allowed. Running sync again may replace the manual value."
                                        : ""
                                    }
                                    className={[
                                      "h-11 w-24 rounded-xl border px-3 text-sm shadow-sm transition",
                                      "focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500",
                                      a.syncLocked
                                        ? "border-emerald-200 bg-emerald-50/50 text-slate-900 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-slate-100"
                                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500",
                                    ].join(" ")}
                                    value={cell == null ? "" : getMarkDisplayValue(cell)}
                                    onChange={(e) =>
                                      handleMarkChange(s.id, a._id, e.target.value)
                                    }
                                    onBlur={() => handleMarkBlur(s.id, a._id)}
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

                          <td className="w-[150px] min-w-[150px] px-4 py-3 text-center">
                            <div
                              title={
                                courseType === "lab"
                                  ? "Calculated from total obtained marks divided by total lab assessment marks and converted to 25"
                                  : "Calculated from selected CT policy"
                              }
                              className="inline-flex min-w-[72px] items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                            >
                              {courseType === "lab"
                                ? getLabMain(assessments, row)
                                : roundPolicyTotal(computeCtScore(course, assessments, row))}
                            </div>
                          </td>

                          {nonCtDisplayColumns.map((col) => {
                            if (col.type === "hybrid_mid_total") {
                              return (
                                <td key={col.key} className="w-[150px] min-w-[150px] px-4 py-3 text-center">
                                  <span className="inline-flex min-w-[78px] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                    {Number(computeHybridMidTotal(assessments, row)).toFixed(1)}
                                  </span>
                                </td>
                              );
                            }

                            if (col.type === "hybrid_final_total") {
                              return (
                                <td key={col.key} className="w-[150px] min-w-[150px] px-4 py-3 text-center">
                                  <span className="inline-flex min-w-[78px] items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                    {Number(computeHybridFinalTotal(assessments, row)).toFixed(1)}
                                  </span>
                                </td>
                              );
                            }

                            const a = col.assessment;
                            const firstPartCount =
                              courseType === "lab"
                                ? labRegularAssessments.length
                                : ctAssessments.length;

                            const assessmentIndex = nonCtAssessments.findIndex(
                              (item) => String(item._id) === String(a._id)
                            );
                            const actualColIndex = firstPartCount + assessmentIndex + 1;
                            const cell = row[a._id];

                            if (a?.structureType === "lab_final") {
                              return (
                                <td key={a._id} className="w-[190px] min-w-[190px] px-4 py-3 text-center">
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="inline-flex min-w-[78px] items-center justify-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-bold text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                                      {isIncompleteCell(cell)
                                        ? "A"
                                        : Number(getMainMarkValue(cell) || 0).toFixed(1)}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => openAdvancedModal(s, a)}
                                      disabled={isIncompleteCell(cell)}
                                      className="rounded-xl border border-fuchsia-200 bg-white px-3 py-2 text-xs font-semibold text-fuchsia-700 shadow-sm transition hover:bg-fuchsia-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-fuchsia-500/20 dark:bg-slate-900 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/10"
                                    >
                                      Open Breakdown
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleAdvancedAbsentToggle(s.id, a._id)}
                                      className={[
                                        "rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition",
                                        isIncompleteCell(cell)
                                          ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                          : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
                                      ].join(" ")}
                                    >
                                      {isIncompleteCell(cell) ? "Clear A" : "Mark A"}
                                    </button>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td key={a._id} className="w-[190px] min-w-[190px] px-4 py-3 text-center">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  title={
                                    a.syncLocked
                                      ? "This value is connected to Marks Sync, but manual editing is allowed. Running sync again may replace the manual value."
                                      : ""
                                  }
                                  className={[
                                    "h-11 w-24 rounded-xl border px-3 text-sm shadow-sm transition",
                                    "focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500",
                                    a.syncLocked
                                      ? "border-emerald-200 bg-emerald-50/50 text-slate-900 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-slate-100"
                                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500",
                                  ].join(" ")}
                                  value={cell == null ? "" : getMarkDisplayValue(cell)}
                                  onChange={(e) =>
                                    handleMarkChange(s.id, a._id, e.target.value)
                                  }
                                  onBlur={() => handleMarkBlur(s.id, a._id)}
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

                          <td className="w-[130px] min-w-[130px] px-4 py-3 text-center">
                            {(() => {
                              const rowNotice = getFinalCompletionNotice(
                                course,
                                assessments,
                                row,
                                Number(attMarksMap[s.id] || 0),
                                markInputAssessments,
                                assessmentPlanSummary.total
                              );

                              return (
                                <div className="flex flex-col items-center gap-1.5">
                                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                                    {Number(total).toFixed(1)}
                                  </span>

                                  {rowNotice && (
                                    <span
                                      className={[
                                        "max-w-[112px] rounded-lg px-2 py-1 text-[10px] font-semibold leading-tight",
                                        rowNotice.type === "error"
                                          ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                                          : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
                                      ].join(" ")}
                                    >
                                      {rowNotice.message}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          <td className="w-[100px] min-w-[100px] px-4 py-3 text-center">
                            <GradeBadge grade={gradeForStudent(course, assessments, row, total)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>


            {!loading && sortedStudents.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || assessments.length === 0}
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Marks"}
                </button>

                <button
                  onClick={handleExportExcel}
                  disabled={assessments.length === 0}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Export Excel
                </button>

                <button
                  onClick={handleExportPdf}
                  disabled={assessments.length === 0}
                  className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  Export Result PDF
                </button>
              </div>
            )}
          </div>
        </div>

        <ObeFetchModal
          open={obeFetch.open}
          courseType={courseType}
          blueprints={obeFetch.blueprints}
          assessments={assessments}
          mappings={obeFetch.mappings}
          createConfigs={obeFetch.createConfigs}
          overwriteExisting={obeFetch.overwriteExisting}
          setOverwriteExisting={(overwriteExisting) =>
            setObeFetch((prev) => ({ ...prev, overwriteExisting }))
          }
          onMappingChange={updateObeFetchMapping}
          onCreateConfigChange={updateObeFetchCreateConfig}
          onClose={closeObeFetch}
          onFetch={executeObeFetch}
          busy={obeFetch.busy}
        />

        <MarksExcelImportModal
          open={excelImport.open}
          fileName={excelImport.fileName}
          sheetNames={excelImport.sheetNames}
          sheetName={excelImport.sheetName}
          onSheetChange={handleExcelImportSheetChange}
          preview={excelImport.preview}
          targets={excelImportTargets}
          mappings={excelImport.mappings}
          onMappingChange={handleExcelImportMappingChange}
          createConfigs={excelImport.createConfigs}
          onCreateConfigChange={handleExcelImportCreateConfigChange}
          showAllColumns={excelImport.showAllColumns}
          setShowAllColumns={(showAllColumns) =>
            setExcelImport((prev) => ({ ...prev, showAllColumns }))
          }
          sheetInspection={excelImport.sheetInspection}
          sheetSetup={excelImport.sheetSetup}
          setupOpen={excelImport.setupOpen}
          setSetupOpen={(setupOpen) =>
            setExcelImport((prev) => ({ ...prev, setupOpen }))
          }
          onSheetSetupChange={handleExcelImportSheetSetupChange}
          onApplySheetSetup={handleApplyExcelImportSheetSetup}
          importPolicy={excelImport.importPolicy}
          setImportPolicy={(importPolicy) =>
            setExcelImport((prev) => ({ ...prev, importPolicy }))
          }
          onAutoMatch={handleExcelImportAutoMatch}
          onCreateRecommended={handleExcelImportCreateRecommended}
          onClose={closeExcelImport}
          onImport={executeExcelMarksImport}
          busy={excelImport.busy}
        />

        <AdvancedBreakdownModal
          open={advancedModal.open}
          student={activeAdvancedStudent}
          assessment={activeAdvancedAssessment}
          cellValue={activeAdvancedCell}
          onClose={closeAdvancedModal}
          onPrev={goPrevAdvancedStudent}
          onNext={goNextAdvancedStudent}
          hasPrev={advancedModal.studentIndex > 0}
          hasNext={advancedModal.studentIndex < visibleStudents.length - 1}
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
          onSubMarkBlur={(subKey, fullMarks) => {
            if (!activeAdvancedStudent || !activeAdvancedAssessment) return;
            handleAdvancedSubMarkBlur(
              activeAdvancedStudent.id,
              activeAdvancedAssessment,
              subKey,
              fullMarks
            );
          }}
        />
      </div>
    </div>
  );
}