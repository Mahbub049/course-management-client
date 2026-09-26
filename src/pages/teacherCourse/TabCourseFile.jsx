import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { saveAs } from "file-saver";

import {
  convertCourseFileOfficeToPdf,
  deleteCourseFileDocument,
  downloadCourseFileDocumentBlob,
  fetchCourseFileState,
  importLabSubmissionToCourseFile,
  saveCourseFileMappings,
  saveCourseFileSelection,
  saveCourseFileSetup,
  uploadCourseFileDocuments,
} from "../../services/courseFileService";
import { getObeExportPayload } from "../../services/obeService";
import { fetchAttendanceSheet } from "../../services/attendanceService";
import { exportObeWorkbook } from "../../utils/obeWorkbookExport";
import { createAttendancePdf } from "../../utils/attendancePdfExport";
import {
  BAND_LABEL,
  buildAnswerScriptRecordDocxFromTemplate,
  buildChecklistDocxFromTemplate,
  buildCourseFileZip,
  combineCourseFileBlobs,
  detectSectionFromCourseFile,
  getSelectedCandidate,
  readObeWorkbookCourseMeta,
  safeFileName,
} from "../../utils/courseFilePreparation";

const ALL_BANDS = ["best", "mediocre", "poor"];

const buttonBase =
  "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${buttonBase} border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700`;
const secondaryButton = `${buttonBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`;
const dangerButton = `${buttonBase} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300`;

function statusForItem(item, state) {
  const docs = state?.documents || [];
  const itemDocs = docs.filter((doc) => doc.itemKey === item.key);
  const sections = (state?.config?.sections || []).map((row) => String(row.section || "")).filter(Boolean);
  const ownerSection = String(state?.autoSources?.ownerSection || state?.course?.section || "");

  if (item.key === "questions") {
    const hasScope = (scopeKey, legacyScope, pattern) => itemDocs.some((doc) =>
      doc.scopeKey === scopeKey || doc.scopeKey === legacyScope || pattern.test(String(doc.label || ""))
    );
    const midQuestion = hasScope("questions:mid:paper", "questions:mid", /mid.*question|question.*mid/i);
    const midRubrics = hasScope("questions:mid:rubrics", "questions:mid", /mid.*(schema|rubric)|(schema|rubric).*mid/i);
    const finalQuestion = hasScope("questions:final:paper", "questions:final", /final.*question|question.*final/i);
    const finalRubrics = hasScope("questions:final:rubrics", "questions:final", /final.*(schema|rubric)|(schema|rubric).*final/i);
    const readyCount = [midQuestion, midRubrics, finalQuestion, finalRubrics].filter(Boolean).length;
    if (readyCount === 4) return { status: "Completed", detail: "Mid/Final questions and answer-schema rubrics attached" };
    if (readyCount > 0) return { status: "Partial", detail: `${readyCount}/4 required files attached` };
    return { status: "Pending", detail: "Mid/Final questions and answer-schema rubrics required" };
  }

  if (item.mode === "single") {
    return itemDocs.length ? { status: "Completed", detail: `${itemDocs.length} file${itemDocs.length === 1 ? "" : "s"}` } : { status: "Pending", detail: "No file yet" };
  }

  if (item.mode === "all_sections") {
    const covered = new Set(itemDocs.map((doc) => String(doc.section || "")).filter(Boolean));
    const automaticSections = Array.isArray(state?.autoSources?.sections) ? state.autoSources.sections : [];
    automaticSections.forEach((row) => {
      const section = String(row?.section || "");
      if (!section) return;
      if (item.key === "attendance" && state?.config?.autoAttendanceEnabled !== false && row?.attendanceReady) covered.add(section);
      if (item.key === "course_evaluation" && row?.obeReady) covered.add(section);
      if (item.key === "continuous_lab" && row?.continuousLabReady) covered.add(section);
    });
    // Backward compatibility for states returned by an older server while a
    // rolling deployment is in progress.
    if (!automaticSections.length) {
      if (item.key === "attendance" && state?.config?.autoAttendanceEnabled !== false && state?.autoSources?.attendanceReady && ownerSection) covered.add(ownerSection);
      if (item.key === "course_evaluation" && state?.autoSources?.obeReady && ownerSection) covered.add(ownerSection);
      if (item.key === "continuous_lab" && state?.autoSources?.continuousLabReady && ownerSection) covered.add(ownerSection);
    }
    const needed = sections.length || automaticSections.length || 1;
    const count = sections.length ? sections.filter((section) => covered.has(section)).length : covered.size;
    if (count >= needed) return { status: "Completed", detail: `${count}/${needed} sections` };
    if (count > 0) return { status: "Partial", detail: `${count}/${needed} sections` };
    return { status: "Pending", detail: `0/${needed} sections` };
  }

  const bands = new Set(itemDocs.map((doc) => doc.band).filter(Boolean));
  if (item.mode === "samples") {
    if (["mid", "final"].includes(item.key)) {
      const suggestions = scopeSuggestionsForItem(item.key, state);
      const suggestion = suggestions[0];
      const includedBands = new Set((state?.config?.selections || [])
        .filter((row) => row.scopeKey === suggestion?.scopeKey && row.included === true)
        .map((row) => row.band));
      if (ALL_BANDS.every((band) => includedBands.has(band))) return { status: "Completed", detail: "Excellent, mediocre and poor scripts confirmed" };
      if (includedBands.size) return { status: "Partial", detail: `${includedBands.size}/3 scripts confirmed` };
      return { status: "Pending", detail: "Confirm the selected answer scripts are included" };
    }

    if (item.key === "assignment") {
      const suggestions = scopeSuggestionsForItem("assignment", state);
      const hasRubrics = itemDocs.some((doc) => doc.scopeKey === "assignment:rubrics" || /rubric/i.test(String(doc.label || doc.originalFileName || "")));
      if (!suggestions.length) {
        if (hasRubrics) return { status: "Partial", detail: "Rubrics attached; no assignment assessment found" };
        return { status: "Pending", detail: "No assignment assessment found" };
      }
      let complete = 0;
      let partial = false;
      suggestions.forEach((suggestion) => {
        const scopedDocs = itemDocs.filter((doc) => doc.scopeKey === suggestion.scopeKey);
        const uploadedBands = new Set(scopedDocs.map((doc) => doc.band).filter(Boolean));
        const physicalBands = new Set((state?.config?.selections || [])
          .filter((row) => row.scopeKey === suggestion.scopeKey && row.included === true)
          .map((row) => row.band));
        const readyBands = new Set([...uploadedBands, ...physicalBands]);
        if (ALL_BANDS.every((band) => readyBands.has(band))) complete += 1;
        else if (readyBands.size) partial = true;
      });
      if (complete === suggestions.length && hasRubrics) return { status: "Completed", detail: `${complete}/${suggestions.length} assignment sample set${suggestions.length === 1 ? "" : "s"} + rubrics` };
      if (complete > 0 || partial || hasRubrics) {
        const rubricText = hasRubrics ? "rubrics attached" : "rubrics missing";
        return { status: "Partial", detail: `${complete}/${suggestions.length} sample set${suggestions.length === 1 ? "" : "s"} complete · ${rubricText}` };
      }
      return { status: "Pending", detail: "Confirm assignment samples and upload rubrics" };
    }

    if (ALL_BANDS.every((band) => bands.has(band))) return { status: "Completed", detail: "Best, mediocre and poor attached" };
    if (itemDocs.length) return { status: "Partial", detail: `${bands.size}/3 sample types` };
    return { status: "Pending", detail: "Sample reports/files not attached" };
  }

  if (item.mode === "samples_by_assessment") {
    const relevantSuggestions = (() => {
      if (item.key === "class_test") return state?.suggestions?.groups?.classTests || [];
      if (item.key === "lab_exam") return state?.suggestions?.groups?.labExams || [];
      return [];
    })();
    if (!relevantSuggestions.length) {
      return itemDocs.length ? { status: "Partial", detail: `${itemDocs.length} file(s)` } : { status: "Pending", detail: "No matching assessments found" };
    }
    let completeAssessments = 0;
    relevantSuggestions.forEach((suggestion) => {
      const scoped = itemDocs.filter((doc) => doc.scopeKey === suggestion.scopeKey);
      const includedBands = new Set((state?.config?.selections || [])
        .filter((row) => row.scopeKey === suggestion.scopeKey && row.included === true)
        .map((row) => row.band));
      const hasRequiredQuestion = item.key !== "class_test" || scoped.some((doc) => !doc.band && /question/i.test(String(doc.label || doc.originalFileName || "")));
      if (ALL_BANDS.every((band) => includedBands.has(band)) && hasRequiredQuestion) completeAssessments += 1;
    });
    if (completeAssessments === relevantSuggestions.length) return { status: "Completed", detail: `${completeAssessments}/${relevantSuggestions.length} assessments` };
    if (itemDocs.length || (state?.config?.selections || []).some((row) => relevantSuggestions.some((s) => s.scopeKey === row.scopeKey) && row.included === true)) return { status: "Partial", detail: `${completeAssessments}/${relevantSuggestions.length} assessments complete` };
    return { status: "Pending", detail: `0/${relevantSuggestions.length} assessments complete` };
  }

  return { status: itemDocs.length ? "Completed" : "Pending", detail: "" };
}

function statusClass(status) {
  if (status === "Completed") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (status === "Partial") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function scopeSuggestionsForItem(itemKey, state) {
  const groups = state?.suggestions?.groups || {};
  if (itemKey === "assignment") return groups.assignment || [];
  if (itemKey === "class_test") return groups.classTests || [];
  if (itemKey === "mid") return groups.mid || [];
  if (itemKey === "final") return groups.final || [];
  if (itemKey === "lab_report") return groups.labReports || [];
  if (itemKey === "lab_exam") return groups.labExams || [];
  if (itemKey === "project_report") return groups.projectReports || [];
  return [];
}

export default function TabCourseFile({ courseId, course }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [setupEditing, setSetupEditing] = useState(false);
  const [sectionCount, setSectionCount] = useState(1);
  const [sectionRows, setSectionRows] = useState([]);
  const [labMappings, setLabMappings] = useState({ labReportAssessmentIds: [], continuousLabAssessmentIds: [], projectReportAssessmentIds: [] });
  const genericInputRef = useRef(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [answerRecordEditor, setAnswerRecordEditor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchCourseFileState(courseId);
      let resolvedData = data;
      // Do not rely only on the Course File summary count for attendance. Archived
      // courses can contain legacy attendance that is still available through the
      // normal Attendance Sheet endpoint. Probe that endpoint directly so the
      // current teacher's archived attendance is detected exactly as the portal
      // itself would display it.
      if (data?.eligible && String(data?.course?.courseType || "theory").toLowerCase() !== "lab") {
        try {
          const attendanceSheet = await fetchAttendanceSheet(courseId);
          const sessionCount = Array.isArray(attendanceSheet?.sessions) ? attendanceSheet.sessions.length : 0;
          if (sessionCount > 0) {
            resolvedData = {
              ...data,
              autoSources: {
                ...(data.autoSources || {}),
                attendanceReady: true,
                attendanceRecordCount: Math.max(Number(data?.autoSources?.attendanceRecordCount || 0), sessionCount),
              },
            };
          }
        } catch (attendanceProbeError) {
          console.warn("Course-file attendance probe failed", attendanceProbeError);
        }
      }
      setState(resolvedData);
      if (resolvedData?.config?.sections?.length) {
        setSectionRows(resolvedData.config.sections.map((row) => ({ section: String(row.section || ""), shortCode: String(row.shortCode || "") })));
        setSectionCount(resolvedData.config.sections.length);
      } else {
        prepareDefaultSections(1, resolvedData);
      }
      const mappingsWereSaved = resolvedData?.config?.labMappingsInitialized === true;
      setLabMappings({
        labReportAssessmentIds: (mappingsWereSaved ? resolvedData?.config?.labReportAssessmentIds || [] : resolvedData?.suggestions?.defaults?.labReportAssessmentIds || []).map(String),
        continuousLabAssessmentIds: (mappingsWereSaved ? resolvedData?.config?.continuousLabAssessmentIds || [] : resolvedData?.suggestions?.defaults?.continuousLabAssessmentIds || []).map(String),
        projectReportAssessmentIds: (mappingsWereSaved ? resolvedData?.config?.projectReportAssessmentIds || [] : resolvedData?.suggestions?.defaults?.projectReportAssessmentIds || []).map(String),
      });
    } catch (error) {
      console.error(error);
      Swal.fire("Could not load Course File", error?.response?.data?.message || error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [courseId]);

  const prepareDefaultSections = (count, source = state) => {
    const n = Math.max(1, Math.min(30, Number(count) || 1));
    const current = String(source?.course?.section || course?.section || "");
    const shortcode = source?.teacher?.shortCode || "";
    const numeric = /^\d+$/.test(current);
    const rows = Array.from({ length: n }, (_, i) => {
      const section = numeric && n >= Number(current) ? String(i + 1) : i === 0 ? current || "1" : String(i + 1);
      return { section, shortCode: section === current ? shortcode : "" };
    });
    setSectionRows(rows);
    setSectionCount(n);
  };

  const resizeSections = (count) => {
    const n = Math.max(1, Math.min(30, Number(count) || 1));
    setSectionRows((prev) => {
      const next = prev.slice(0, n);
      const used = new Set(next.map((row) => String(row.section || "")));
      let candidate = 1;
      while (next.length < n) {
        while (used.has(String(candidate))) candidate += 1;
        next.push({ section: String(candidate), shortCode: "" });
        used.add(String(candidate));
        candidate += 1;
      }
      return next;
    });
    setSectionCount(n);
  };

  const removeSectionRow = (index) => {
    setSectionRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      setSectionCount(next.length);
      return next;
    });
  };

  const addSectionRow = () => resizeSections(Math.min(30, sectionRows.length + 1));

  const completion = useMemo(() => {
    const result = {};
    (state?.checklist || []).forEach((item) => { result[item.key] = statusForItem(item, state); });
    return result;
  }, [state]);

  const completedCount = useMemo(() => Object.values(completion).filter((row) => row.status === "Completed").length, [completion]);

  const handleSaveSetup = async () => {
    if (!sectionRows.length || sectionRows.some((row) => !String(row.section || "").trim())) {
      return Swal.fire("Section required", "Every row needs a section number/name.", "warning");
    }
    setBusy(true);
    try {
      await saveCourseFileSetup(courseId, sectionRows);
      setSetupEditing(false);
      await load();
      Swal.fire({ icon: "success", title: "Course-file sections saved", timer: 1300, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Could not save", error?.response?.data?.message || error.message, "error");
    } finally { setBusy(false); }
  };

  const startGenericUpload = (itemKey, options = {}) => {
    setPendingUpload({ itemKey, ...options });
    setTimeout(() => genericInputRef.current?.click(), 0);
  };

  const chooseSectionForFile = async (file, detected = "", allowedSections = null) => {
    const configuredSections = (state?.config?.sections || []).map((row) => String(row.section || ""));
    const sections = Array.isArray(allowedSections) && allowedSections.length ? configuredSections.filter((section) => allowedSections.includes(section)) : configuredSections;
    if (detected && sections.includes(String(detected))) return String(detected);
    if (sections.length === 1) return sections[0];
    const options = Object.fromEntries(sections.map((section) => [section, `Section ${section}`]));
    const result = await Swal.fire({
      title: `Select section for ${file.name}`,
      input: "select",
      inputOptions: options,
      inputPlaceholder: "Select section",
      showCancelButton: true,
      inputValidator: (value) => !value ? "Select a section" : undefined,
    });
    return result.isConfirmed ? String(result.value || "") : "";
  };

  const handleGenericFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const request = pendingUpload;
    setPendingUpload(null);
    if (!files.length || !request) return;

    setBusy(true);
    try {
      const metadata = [];
      if (request.sectioned) {
        const allSections = (state?.config?.sections || []).map((row) => String(row.section || ""));
        const ownerSection = String(state?.course?.section || "");
        const sections = request.otherSectionsOnly ? allSections.filter((section) => section !== ownerSection) : allSections;
        if (!sections.length) throw new Error("No other configured sections are available for this upload.");
        for (const file of files) {
          const detected = await detectSectionFromCourseFile(file, sections);
          const section = await chooseSectionForFile(file, detected, sections);
          if (!section) throw new Error(`Section mapping was cancelled for ${file.name}.`);
          const row = (state?.config?.sections || []).find((x) => String(x.section) === section);
          metadata.push({ section, facultyShortCode: row?.shortCode || "", includeInCombined: true, label: request.label || "", assessmentId: request.assessmentId || "", scopeKey: request.scopeKey || "", band: request.band || "" });
        }
      } else {
        metadata.push(...files.map(() => ({ section: request.section || "", includeInCombined: request.includeInCombined !== false, label: request.label || "", assessmentId: request.assessmentId || "", scopeKey: request.scopeKey || "", band: request.band || "" })));
      }
      const previousDocs = request.replaceSection
        ? (state?.documents || []).filter((doc) => doc.itemKey === request.itemKey && String(doc.section || "") === String(request.section || ""))
        : request.replaceScopeKey
          ? (state?.documents || []).filter((doc) => doc.itemKey === request.itemKey && String(doc.scopeKey || "") === String(request.scopeKey || "") && (!request.section || String(doc.section || "") === String(request.section || "")))
          : [];
      await uploadCourseFileDocuments(courseId, request.itemKey, files, metadata);
      for (const previous of previousDocs) {
        await deleteCourseFileDocument(courseId, previous.id || previous._id).catch(() => {});
      }
      await load();
      Swal.fire({ icon: "success", title: `${files.length} file${files.length === 1 ? "" : "s"} uploaded`, timer: 1200, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Upload failed", error?.response?.data?.message || error.message, "error");
    } finally { setBusy(false); }
  };

  const handleSampleFile = async (event, itemKey, suggestion, band, candidate) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !candidate) return;
    setBusy(true);
    try {
      await uploadCourseFileDocuments(courseId, itemKey, [file], [{
        section: String(state?.course?.section || ""),
        facultyShortCode: state?.teacher?.shortCode || "",
        assessmentId: suggestion.assessmentId || "",
        scopeKey: suggestion.scopeKey,
        band,
        studentId: candidate.studentId,
        studentRoll: candidate.roll,
        studentName: candidate.name,
        label: `${BAND_LABEL[band]} - ${suggestion.title}`,
        includeInCombined: true,
      }]);
      await load();
    } catch (error) {
      Swal.fire("Upload failed", error?.response?.data?.message || error.message, "error");
    } finally { setBusy(false); }
  };

  const handleCandidateChange = async (suggestion, band, studentId) => {
    const existing = (state?.config?.selections || []).find((row) => row.scopeKey === suggestion.scopeKey && row.band === band);
    const included = existing?.included === true;
    try {
      await saveCourseFileSelection(courseId, { scopeKey: suggestion.scopeKey, band, studentId, included });
      setState((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          selections: [
            ...(prev.config?.selections || []).filter((row) => !(row.scopeKey === suggestion.scopeKey && row.band === band)),
            { scopeKey: suggestion.scopeKey, band, studentId, included },
          ],
        },
      }));
    } catch (error) {
      Swal.fire("Could not save selection", error?.response?.data?.message || error.message, "error");
    }
  };

  const handleSampleIncluded = async (suggestion, band, candidate, included) => {
    if (!candidate?.studentId) return;
    try {
      await saveCourseFileSelection(courseId, { scopeKey: suggestion.scopeKey, band, studentId: candidate.studentId, included });
      setState((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          selections: [
            ...(prev.config?.selections || []).filter((row) => !(row.scopeKey === suggestion.scopeKey && row.band === band)),
            { scopeKey: suggestion.scopeKey, band, studentId: candidate.studentId, included },
          ],
        },
      }));
    } catch (error) {
      Swal.fire("Could not update script status", error?.response?.data?.message || error.message, "error");
    }
  };

  const handleUseSubmission = async (itemKey, suggestion, band, candidate) => {
    if (!candidate?.submissionId) return;
    setBusy(true);
    try {
      await importLabSubmissionToCourseFile(courseId, { submissionId: candidate.submissionId, itemKey, band, scopeKey: suggestion.scopeKey });
      await load();
      Swal.fire({ icon: "success", title: "Submitted file attached", timer: 1000, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Could not attach submission", error?.response?.data?.message || error.message, "error");
    } finally { setBusy(false); }
  };

  const handleDelete = async (doc) => {
    if (doc?.linkedFromSibling) {
      Swal.fire(
        "Linked from another section",
        `This file belongs to Section ${doc.section || "another section"}. Open that section's course file to replace or remove it.`,
        "info"
      );
      return;
    }
    const confirm = await Swal.fire({ title: "Remove this file?", text: doc.originalFileName, icon: "warning", showCancelButton: true, confirmButtonText: "Remove" });
    if (!confirm.isConfirmed) return;
    await deleteCourseFileDocument(courseId, doc.id || doc._id);
    await load();
  };

  const handleDownloadDoc = async (doc) => {
    try {
      const sourceCourseId = doc?.sourceCourseId || courseId;
      const blob = await downloadCourseFileDocumentBlob(sourceCourseId, doc.id || doc._id);
      saveAs(blob, doc.originalFileName || "document");
    } catch (error) {
      Swal.fire("Download failed", error?.response?.data?.message || error.message, "error");
    }
  };

  const handleExternalObeUpload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const configuredSections = (state?.config?.sections || []).map((row) => String(row.section || ""));
      for (const file of files) {
        const isPdf = /\.pdf$/i.test(file.name || "") || String(file.type || "").toLowerCase().includes("pdf");
        if (isPdf) {
          let section = await detectSectionFromCourseFile(file, configuredSections);
          if (!configuredSections.includes(section)) section = await chooseSectionForFile(file, section);
          if (!section) throw new Error(`Section mapping cancelled for ${file.name}`);
          const sectionRow = (state?.config?.sections || []).find((row) => String(row.section) === section);
          await uploadCourseFileDocuments(courseId, "course_evaluation", [file], [{
            section,
            facultyShortCode: sectionRow?.shortCode || "",
            label: "OBE / CO-PO PDF - kept exactly as uploaded",
            includeInCombined: true,
          }]);
          continue;
        }

        if (!/\.(xlsx|xlsm|xls)$/i.test(file.name || "")) {
          throw new Error(`${file.name} is not a supported CO-PO Excel or PDF file.`);
        }
        const inspected = await readObeWorkbookCourseMeta(file);
        if (!inspected.sheetNames.includes("GradeSheet") || !inspected.sheetNames.includes("Course Report")) {
          throw new Error(`${file.name} does not contain the official GradeSheet and Course Report worksheets.`);
        }
        let section = String(inspected.course.section || "");
        if (!configuredSections.includes(section)) section = await chooseSectionForFile(file, section);
        if (!section) throw new Error(`Section mapping cancelled for ${file.name}`);
        const sectionRow = (state?.config?.sections || []).find((row) => String(row.section) === section);

        // Use exactly the same final conversion rules used for this faculty's own
        // workbook, so every uploaded teacher workbook produces the same Course
        // Report / GradeSheet print layout.
        const reportBlob = await convertCourseFileOfficeToPdf(courseId, file, "Course Report");
        const gradeBlob = await convertCourseFileOfficeToPdf(courseId, file, "GradeSheet");
        const prefix = `${state.course?.intake || inspected.course.intake || ""}-${section}_${state.course?.code || inspected.course.code || "Course"}`;
        const reportFile = new File([reportBlob], `Course_Report_${safeFileName(prefix)}.pdf`, { type: "application/pdf" });
        const gradeFile = new File([gradeBlob], `GradeSheet_${safeFileName(prefix)}.pdf`, { type: "application/pdf" });
        await uploadCourseFileDocuments(courseId, "course_evaluation", [file, reportFile], [
          { section, facultyShortCode: sectionRow?.shortCode || "", label: "OBE CO-PO Workbook", includeInCombined: false },
          { section, facultyShortCode: sectionRow?.shortCode || "", label: "Course Report - converted with the portal's final Course Report layout", includeInCombined: true, sourceKind: "generated" },
        ]);
        await uploadCourseFileDocuments(courseId, "obe_gradesheet", [gradeFile], [
          { section, facultyShortCode: sectionRow?.shortCode || "", label: "OBE Grade Sheet - converted with the portal's final GradeSheet layout", includeInCombined: true, sourceKind: "generated" },
        ]);
      }
      await load();
      Swal.fire({ icon: "success", title: "CO-PO files processed", text: "Excel files use the same final portal conversion as the current section; uploaded PDFs are kept unchanged.", timer: 2200, showConfirmButton: false });
    } catch (error) {
      console.error(error);
      Swal.fire("Could not process CO-PO file", error?.response?.data?.message || error.message, "error");
    } finally { setBusy(false); }
  };


  const normalizeObeExportPayload = (payload = {}) => ({
    ...payload,
    blueprints: (payload.blueprints || []).map((blueprint) => ({
      ...blueprint,
      items: (blueprint.items || []).map((item) => {
        const label = String(item.label || "").trim();
        return {
          ...item,
          label: /^CO\d+\s+Allocation$/i.test(label)
            ? String(item.coCode || label.replace(/\s+Allocation$/i, "")).trim()
            : label,
        };
      }),
    })),
  });

  const getObeWorkbookForCourse = async (targetCourseId, courseMeta = {}) => {
    const payload = normalizeObeExportPayload(await getObeExportPayload(targetCourseId));
    const workbookBlob = (await exportObeWorkbook(payload)).blob;
    const workbookFile = new File([workbookBlob], `OBE_${targetCourseId}.xlsm`, {
      type: "application/vnd.ms-excel.sheet.macroEnabled.12",
    });
    const payloadCourse = payload?.course || {};
    const prefix = `${payloadCourse.intake || courseMeta.intake || ""}-${payloadCourse.section || courseMeta.section || ""}_${payloadCourse.code || courseMeta.code || state.course?.code || "Course"}`;
    return { workbookBlob, workbookFile, prefix, payload };
  };

  const getCurrentObeWorkbook = async () =>
    getObeWorkbookForCourse(courseId, state.course || {});

  const getObeFilesForCourse = async (source) => {
    const targetCourseId = source?.courseId || source?.id || courseId;
    const { workbookBlob, workbookFile, prefix } = await getObeWorkbookForCourse(targetCourseId, source || {});
    // Run sequentially. LibreOffice starts a real Office conversion process;
    // doing two conversions at once is slower on localhost and can fail on Windows.
    const reportBlob = await convertCourseFileOfficeToPdf(targetCourseId, workbookFile, "Course Report");
    const gradeBlob = await convertCourseFileOfficeToPdf(targetCourseId, workbookFile, "GradeSheet");
    return [
      { name: `OBE_CO_PO_${safeFileName(prefix)}.xlsm`, blob: workbookBlob, folder: "08 Course Evaluation", combined: false },
      { name: `Course_Report_${safeFileName(prefix)}.pdf`, blob: reportBlob, folder: "08 Course Evaluation", combined: true },
      { name: `GradeSheet_${safeFileName(prefix)}.pdf`, blob: gradeBlob, folder: "08 Course Evaluation", combined: true },
    ];
  };

  const getCurrentObeFiles = async () => getObeFilesForCourse({
    courseId,
    ...state.course,
  });

  const handleDownloadCurrentObe = async (type) => {
    setBusy(true);
    try {
      const { workbookBlob, workbookFile, prefix } = await getCurrentObeWorkbook();
      if (type === "excel") {
        saveAs(workbookBlob, `OBE_CO_PO_${safeFileName(prefix)}.xlsm`);
        return;
      }
      const sheetName = type === "report" ? "Course Report" : "GradeSheet";
      const blob = await convertCourseFileOfficeToPdf(courseId, workbookFile, sheetName);
      const name = type === "report"
        ? `Course_Report_${safeFileName(prefix)}.pdf`
        : `GradeSheet_${safeFileName(prefix)}.pdf`;
      saveAs(blob, name);
    } catch (error) {
      Swal.fire("Generation failed", error?.response?.data?.message || error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const buildAttendancePdfForCourse = async (source = {}) => {
    const targetCourseId = source?.courseId || source?.id || courseId;
    const data = await fetchAttendanceSheet(targetCourseId);
    const sessions = data?.sessions || [];
    if (!sessions.length) throw new Error(`No saved attendance is available for Section ${source?.section || state?.course?.section || ""} yet.`);
    const students = [...(data?.students || [])].sort((a, b) =>
      String(a?.roll || "").localeCompare(String(b?.roll || ""), undefined, { numeric: true, sensitivity: "base" })
    );
    const matrix = data?.matrix || {};
    const rows = students.map((student) => {
      let presentCount = 0;
      sessions.forEach((session) => {
        if (matrix?.[student.roll]?.[session.key]) presentCount += 1;
      });
      const percentage = sessions.length ? Number(((presentCount / sessions.length) * 100).toFixed(2)) : 0;
      return { roll: student.roll, name: student.name, presentCount, totalClasses: sessions.length, percentage };
    });
    const computed = { sessions, students, matrix, rows };
    const { doc, filename } = createAttendancePdf({ data, computed, teacherFallback: state?.teacher || {} });
    const fallbackName = `Attendance_${source?.code || state?.course?.code || "Course"}_${source?.intake || state?.course?.intake || ""}-${source?.section || state?.course?.section || ""}.pdf`;
    return { blob: doc.output("blob"), name: filename || fallbackName };
  };

  const buildCurrentAttendancePdf = async () => buildAttendancePdfForCourse({
    courseId,
    ...state.course,
  });

  const handleDownloadAutoAttendance = async () => {
    setBusy(true);
    try {
      const built = await buildCurrentAttendancePdf();
      saveAs(built.blob, built.name);
    } catch (error) {
      Swal.fire("Could not generate attendance PDF", error?.response?.data?.message || error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoAttendance = async (value) => {
    const enabled = value !== false;
    setState((prev) => ({ ...prev, config: { ...prev.config, autoAttendanceEnabled: enabled } }));
    try {
      await saveCourseFileMappings(courseId, { autoAttendanceEnabled: enabled });
    } catch (error) {
      setState((prev) => ({ ...prev, config: { ...prev.config, autoAttendanceEnabled: !enabled } }));
      Swal.fire("Could not update attendance source", error?.response?.data?.message || error.message, "error");
    }
  };

  const saveMappings = async () => {
    setBusy(true);
    try {
      await saveCourseFileMappings(courseId, labMappings);
      await load();
      Swal.fire({ icon: "success", title: "Lab mapping saved", timer: 1000, showConfirmButton: false });
    } catch (error) { Swal.fire("Could not save", error?.response?.data?.message || error.message, "error"); }
    finally { setBusy(false); }
  };

  const getClpFilesForCourse = async (source) => {
    const targetCourseId = source?.courseId || source?.id || courseId;
    const { workbookFile, prefix } = await getObeWorkbookForCourse(targetCourseId, source || {});
    const clpBlob = await convertCourseFileOfficeToPdf(targetCourseId, workbookFile, "CLP");
    return [
      { name: `Continuous_Lab_Performance_${safeFileName(prefix)}.pdf`, blob: clpBlob, folder: "04 Continuous Lab Performance", combined: true },
    ];
  };

  const getCurrentClpFiles = async () => getClpFilesForCourse({
    courseId,
    ...state.course,
  });

  const handleDownloadClp = async () => {
    setBusy(true);
    try {
      const files = await getCurrentClpFiles();
      const match = files[0];
      if (!match) throw new Error("The CLP worksheet could not be generated.");
      saveAs(match.blob, match.name);
    } catch (error) { Swal.fire("Generation failed", error?.response?.data?.message || error.message, "error"); }
    finally { setBusy(false); }
  };

  const handleExternalClpUpload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    const missingClpSheets = [];
    let processedCount = 0;
    try {
      const configuredSections = (state?.config?.sections || []).map((row) => String(row.section || "")).filter(Boolean);
      const ownerSection = String(state?.course?.section || "");
      const otherSections = configuredSections.filter((section) => section !== ownerSection);
      if (!otherSections.length) throw new Error("No other configured sections are available for CLP import.");

      for (const file of files) {
        const isPdf = /\.pdf$/i.test(file.name || "") || String(file.type || "").toLowerCase().includes("pdf");
        if (isPdf) {
          const detected = await detectSectionFromCourseFile(file, otherSections);
          const section = await chooseSectionForFile(file, detected, otherSections);
          if (!section) throw new Error(`Section mapping was cancelled for ${file.name}.`);
          const sectionRow = (state?.config?.sections || []).find((row) => String(row.section) === section);
          const previousDocs = (state?.documents || []).filter((doc) => doc.itemKey === "continuous_lab" && String(doc.section || "") === section);
          await uploadCourseFileDocuments(courseId, "continuous_lab", [file], [{
            section,
            facultyShortCode: sectionRow?.shortCode || "",
            label: "CLP PDF - manual upload",
            includeInCombined: true,
          }]);
          for (const previous of previousDocs) await deleteCourseFileDocument(courseId, previous.id || previous._id).catch(() => {});
          processedCount += 1;
          continue;
        }

        if (!/\.(xlsx|xlsm)$/i.test(file.name || "")) {
          throw new Error(`${file.name} is not a supported CLP workbook or PDF file. Use the new .xlsm/.xlsx OBE workbook or upload a CLP PDF manually.`);
        }

        const inspected = await readObeWorkbookCourseMeta(file);
        let section = String(inspected.course.section || "");
        if (!otherSections.includes(section)) section = await chooseSectionForFile(file, section, otherSections);
        if (!section) throw new Error(`Section mapping was cancelled for ${file.name}.`);

        const hasClpSheet = (inspected.sheetNames || []).some((name) => String(name || "").trim().toUpperCase() === "CLP");
        if (!hasClpSheet) {
          missingClpSheets.push({ fileName: file.name, section });
          continue;
        }

        const sectionRow = (state?.config?.sections || []).find((row) => String(row.section) === section);
        const clpBlob = await convertCourseFileOfficeToPdf(courseId, file, "CLP");
        const prefix = `${state.course?.intake || inspected.course.intake || ""}-${section}_${state.course?.code || inspected.course.code || "Course"}`;
        const clpPdf = new File([clpBlob], `Continuous_Lab_Performance_${safeFileName(prefix)}.pdf`, { type: "application/pdf" });
        const previousDocs = (state?.documents || []).filter((doc) => doc.itemKey === "continuous_lab" && String(doc.section || "") === section);
        await uploadCourseFileDocuments(courseId, "continuous_lab", [clpPdf], [
          { section, facultyShortCode: sectionRow?.shortCode || "", label: "CLP PDF - generated from CLP worksheet", includeInCombined: true, sourceKind: "generated" },
        ]);
        for (const previous of previousDocs) await deleteCourseFileDocument(courseId, previous.id || previous._id).catch(() => {});
        processedCount += 1;
      }

      await load();
      if (missingClpSheets.length) {
        const missingText = missingClpSheets.map((row) => `${row.fileName} (Section ${row.section})`).join("<br>");
        await Swal.fire({
          icon: processedCount ? "warning" : "info",
          title: processedCount ? "CLP files processed with missing sheets" : "CLP worksheet missing",
          html: `${processedCount ? `${processedCount} file(s) processed.<br><br>` : ""}<b>The following workbook(s) do not contain a CLP worksheet:</b><br>${missingText}<br><br>Those sections remain <b>Missing</b>. Upload their CLP PDF manually if needed.`,
          confirmButtonText: "OK",
        });
      } else {
        Swal.fire({ icon: "success", title: "CLP files processed", text: "Excel workbooks were detected and their CLP worksheets were converted to PDF automatically.", timer: 2200, showConfirmButton: false });
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Could not process CLP file", error?.response?.data?.message || error.message, "error");
    } finally { setBusy(false); }
  };

  const getAnswerRecordRows = (period) => {
    const saved = state?.config?.answerScriptRecords?.[period] || [];
    if (saved.length) {
      return ALL_BANDS.map((band) => {
        const row = saved.find((item) => item.band === band);
        return row ? {
          ...row,
          band,
          roll: row.studentRoll || row.roll || "",
          name: row.studentName || row.name || "",
        } : null;
      }).filter(Boolean);
    }
    const list = period === "mid" ? state?.suggestions?.groups?.mid || [] : state?.suggestions?.groups?.final || [];
    const suggestion = list[0];
    if (!suggestion) return [];
    return ALL_BANDS.map((band) => {
      const candidate = getSelectedCandidate(state, suggestion, band);
      return candidate ? { ...candidate, band, remarks: "" } : null;
    }).filter(Boolean);
  };

  const editAnswerRecord = (period) => {
    const rows = getAnswerRecordRows(period);
    if (!rows.length) {
      Swal.fire("No mark data", `No matching ${period} assessment/marks were found.`, "warning");
      return;
    }
    setAnswerRecordEditor({
      period,
      rows: ALL_BANDS.map((band) => {
        const row = rows.find((item) => item.band === band) || { band };
        return {
          ...row,
          band,
          scriptSerialNo: String(row.scriptSerialNo || row.answerScriptSlNo || ""),
          studentRoll: String(row.studentRoll || row.roll || ""),
          studentName: String(row.studentName || row.name || ""),
          scoreDisplay: String(row.scoreDisplay ?? row.score ?? ""),
          remarks: String(row.remarks || ""),
        };
      }),
    });
  };

  const updateAnswerRecordEditor = (band, field, value) => {
    setAnswerRecordEditor((prev) => prev ? {
      ...prev,
      rows: prev.rows.map((row) => row.band === band ? { ...row, [field]: value } : row),
    } : prev);
  };

  const saveAnswerRecordEditor = async () => {
    if (!answerRecordEditor) return;
    const { period, rows } = answerRecordEditor;
    const currentRecords = state?.config?.answerScriptRecords || { mid: [], final: [] };
    const payloadRows = rows.map((row) => ({
      band: row.band,
      studentId: row.studentId || null,
      scriptSerialNo: String(row.scriptSerialNo || "").trim(),
      studentRoll: String(row.studentRoll || "").trim(),
      studentName: String(row.studentName || "").trim(),
      scoreDisplay: String(row.scoreDisplay || "").trim(),
      remarks: String(row.remarks || "").trim(),
    }));
    setBusy(true);
    try {
      await saveCourseFileMappings(courseId, { answerScriptRecords: { ...currentRecords, [period]: payloadRows } });
      setAnswerRecordEditor(null);
      await load();
      Swal.fire({ icon: "success", title: "Answer-script record saved", timer: 1000, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Could not save", error?.response?.data?.message || error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const resetAnswerRecord = async (period) => {
    const currentRecords = state?.config?.answerScriptRecords || { mid: [], final: [] };
    setBusy(true);
    try {
      await saveCourseFileMappings(courseId, { answerScriptRecords: { ...currentRecords, [period]: [] } });
      await load();
    } catch (error) { Swal.fire("Could not reset", error?.response?.data?.message || error.message, "error"); }
    finally { setBusy(false); }
  };

  const buildTemplatePdf = async (docxBlob, fileName) => {
    const file = new File([docxBlob], fileName, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    return convertCourseFileOfficeToPdf(courseId, file);
  };

  const buildPackageEntries = async () => {
    const entries = [];
    const checklistDocx = await buildChecklistDocxFromTemplate(state, completion);
    const checklistDocxName = "00_Course_File_Checklist.docx";
    const checklistPdf = await buildTemplatePdf(checklistDocx, checklistDocxName);
    entries.push({ name: "00_Course_File_Checklist.pdf", blob: checklistPdf, folder: "00 Checklist", combined: true, order: 0 });
    entries.push({ name: checklistDocxName, blob: checklistDocx, folder: "00 Checklist", combined: false, order: 0.01 });

    const checklistOrder = new Map((state.checklist || []).map((item, index) => [item.key, index + 1]));

    const automaticSections = Array.isArray(state?.autoSources?.sections) && state.autoSources.sections.length
      ? state.autoSources.sections
      : [{
          courseId,
          section: state.course?.section || "",
          intake: state.course?.intake || "",
          code: state.course?.code || "",
          courseType: state.course?.courseType || "theory",
          isOwner: true,
          attendanceReady: state?.autoSources?.attendanceReady === true,
          obeReady: state?.autoSources?.obeReady === true,
          continuousLabReady: state?.autoSources?.continuousLabReady === true,
        }];
    const allDocuments = state.documents || [];
    const hasSectionReplacement = (itemKey, section) => allDocuments.some((doc) =>
      doc.itemKey === itemKey &&
      String(doc.section || "") === String(section || "") &&
      doc.includeInCombined !== false
    );

    // Same faculty + same course + same offering is auto-linked across sections.
    // Only checklist items marked [All Sections] are generated/shared this way;
    // best/mediocre/poor scripts still come from the course section currently open.
    for (const source of automaticSections) {
      const section = String(source?.section || "");
      if (
        state?.config?.autoAttendanceEnabled !== false &&
        source?.attendanceReady &&
        !hasSectionReplacement("attendance", section)
      ) {
        const attendance = await buildAttendancePdfForCourse(source);
        entries.push({
          name: attendance.name,
          blob: attendance.blob,
          folder: `${String(checklistOrder.get("attendance") || 2).padStart(2, "0")} Attendance sheet [All sections]`,
          combined: true,
          order: checklistOrder.get("attendance") || 2,
        });
      }

      if (source?.obeReady && !hasSectionReplacement("course_evaluation", section)) {
        const autoObe = await getObeFilesForCourse(source);
        autoObe.forEach((entry) => entries.push({ ...entry, order: checklistOrder.get("course_evaluation") || 8 }));
      }

      if (
        String(state.course?.courseType || "").toLowerCase() === "lab" &&
        source?.continuousLabReady &&
        !hasSectionReplacement("continuous_lab", section)
      ) {
        const clp = await getClpFilesForCourse(source);
        clp.forEach((entry) => entries.push({ ...entry, order: checklistOrder.get("continuous_lab") || 4 }));
      }
    }

    for (const doc of allDocuments) {
      if (["class_test", "mid", "final", "lab_exam"].includes(doc.itemKey) && doc.band) continue;
      const sourceCourseId = doc?.sourceCourseId || courseId;
      const blob = await downloadCourseFileDocumentBlob(sourceCourseId, doc.id || doc._id);
      const itemIndex = checklistOrder.get(doc.itemKey) || (doc.itemKey === "obe_gradesheet" ? (checklistOrder.get("course_evaluation") || 8) : 99);
      const checklistItem = (state.checklist || []).find((item) => item.key === doc.itemKey);
      const folderTitle = checklistItem ? `${String(itemIndex).padStart(2, "0")} ${checklistItem.title}` : doc.itemKey === "obe_gradesheet" ? `${String(itemIndex).padStart(2, "0")} Course Evaluation - Grade Sheet` : `99 ${doc.itemKey}`;
      const originalName = doc.originalFileName || "document";
      // Course Outline is a required serial course-file item. Older uploads can
      // carry includeInCombined=false from earlier Course File versions, which
      // made a perfectly valid uploaded outline disappear from Combine/Print.
      // Always include the outline when it exists; keep the stored flag for
      // optional/generated documents such as the source OBE workbook.
      const wantsCombined = doc.itemKey === "outline" ? true : doc.includeInCombined !== false;
      const isWordDocument = /\.docx?$/i.test(originalName);

      if (isWordDocument && wantsCombined) {
        // Keep the faculty's original Word file in the ZIP, but use LibreOffice
        // to create a faithful PDF copy for the serial combined course file.
        // This also supports legacy .doc files, which the browser-side DOCX
        // reader cannot reliably render.
        try {
          const officeFile = new File([blob], originalName, {
            type: doc.mimeType || blob.type || "application/octet-stream",
          });
          const pdfBlob = await convertCourseFileOfficeToPdf(sourceCourseId, officeFile);
          entries.push({ name: originalName, blob, folder: folderTitle, combined: false, order: itemIndex, doc });
          entries.push({
            name: `${originalName.replace(/\.docx?$/i, "")}.pdf`,
            blob: pdfBlob,
            folder: folderTitle,
            combined: true,
            zipInclude: false,
            order: itemIndex,
            doc,
          });
          continue;
        } catch (conversionError) {
          console.warn("Could not pre-convert Word course-file document", originalName, conversionError);
        }
      }

      entries.push({ name: originalName, blob, folder: folderTitle, combined: wantsCombined, order: itemIndex, doc });
    }

    const supplementary = state.config?.supplementary || { includeMidSelectionSheet: true, includeFinalSelectionSheet: true };
    if (supplementary.includeMidSelectionSheet !== false) {
      const rows = getAnswerRecordRows("mid");
      if (rows.length) {
        const docx = await buildAnswerScriptRecordDocxFromTemplate(state, "mid", rows, {
          includeSignature: state.config?.supplementary?.includeMidSignature === true,
        });
        const docxName = "Answer_Script_Selection_Mid.docx";
        const pdf = await buildTemplatePdf(docx, docxName);
        entries.push({ name: "Answer_Script_Selection_Mid.pdf", blob: pdf, folder: "90 Supplementary Answer Script Records", combined: true, order: 90 });
        entries.push({ name: docxName, blob: docx, folder: "90 Supplementary Answer Script Records", combined: false, order: 90.01 });
      }
    }
    if (supplementary.includeFinalSelectionSheet !== false) {
      const rows = getAnswerRecordRows("final");
      if (rows.length) {
        const docx = await buildAnswerScriptRecordDocxFromTemplate(state, "final", rows, {
          includeSignature: state.config?.supplementary?.includeFinalSignature === true,
        });
        const docxName = "Answer_Script_Selection_Final.docx";
        const pdf = await buildTemplatePdf(docx, docxName);
        entries.push({ name: "Answer_Script_Selection_Final.pdf", blob: pdf, folder: "90 Supplementary Answer Script Records", combined: true, order: 91 });
        entries.push({ name: docxName, blob: docx, folder: "90 Supplementary Answer Script Records", combined: false, order: 91.01 });
      }
    }

    // Use nullish fallback instead of `||`: order 0 is the checklist and must
    // stay at the beginning of the serial package rather than being treated as 99.
    return entries.sort((a, b) => Number(a.order ?? 99) - Number(b.order ?? 99));
  };

  const handleChecklistDownload = async () => {
    setBusy(true);
    try {
      const docx = await buildChecklistDocxFromTemplate(state, completion);
      const pdf = await buildTemplatePdf(docx, "Course_File_Checklist.docx");
      saveAs(pdf, safeFileName(`Course_File_Checklist_${state.course.code}_${state.course.intake}-${state.course.section}.pdf`));
    } catch (error) {
      Swal.fire("Checklist generation failed", error?.response?.data?.message || error.message, "error");
    } finally { setBusy(false); }
  };

  const handleCombined = async (mode) => {
    setBusy(true);
    try {
      const entries = await buildPackageEntries();
      if (mode === "zip") {
        const blob = await buildCourseFileZip(entries);
        saveAs(blob, safeFileName(`Course_File_${state.course.code}_${state.course.intake}-${state.course.section}.zip`));
      } else {
        const blob = await combineCourseFileBlobs(
          entries.filter((entry) => entry.combined !== false),
          {
            // Keep normal PDFs on the fast browser path. If pdf.js cannot read
            // a particular uploaded PDF (some scanners/exporters create such
            // files), normalize only that failed PDF through LibreOffice Draw
            // on the backend and retry it. The original upload remains intact.
            normalizePdf: async ({ blob: sourceBlob, name }) => {
              const file = new File([sourceBlob], name || "document.pdf", {
                type: sourceBlob?.type || "application/pdf",
              });
              return convertCourseFileOfficeToPdf(courseId, file);
            },
          }
        );
        if (mode === "print") {
          const url = URL.createObjectURL(blob);
          const win = window.open(url, "_blank");
          if (!win) throw new Error("Please allow pop-ups to print the combined course file.");
          win.addEventListener("load", () => { setTimeout(() => win.print(), 500); }, { once: true });
          setTimeout(() => URL.revokeObjectURL(url), 120000);
        } else {
          saveAs(blob, safeFileName(`Course_File_Combined_${state.course.code}_${state.course.intake}-${state.course.section}.pdf`));
        }
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Could not prepare course file", error?.response?.data?.message || error.message, "error");
    } finally { setBusy(false); }
  };

  const toggleSupplementary = async (key, value) => {
    const supplementary = { ...(state.config?.supplementary || {}), [key]: value };
    setState((prev) => ({ ...prev, config: { ...prev.config, supplementary } }));
    await saveCourseFileMappings(courseId, { supplementary });
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-500">Loading Course File Preparation...</div>;
  if (!state?.eligible) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Course File Preparation is available only for Day courses. Evening/DH courses do not show this tab.</div>;

  const setupReady = state.config?.setupCompleted && state.config?.sections?.length;
  const isLab = String(state.course?.courseType || "").toLowerCase() === "lab";

  return (
    <div className="space-y-5">
      <input ref={genericInputRef} type="file" multiple={pendingUpload?.multiple !== false} accept={pendingUpload?.accept || undefined} className="hidden" onChange={handleGenericFiles} />

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Course File Preparation</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{isLab ? "Lab Course" : "Theory Course"} checklist · {completedCount}/{state.checklist?.length || 0} checklist items completed</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !setupReady} onClick={handleChecklistDownload} className={secondaryButton}>Checklist PDF</button>
          <button disabled={busy || !setupReady} onClick={() => handleCombined("pdf")} className={primaryButton}>Combine & Download PDF</button>
          <button disabled={busy || !setupReady} onClick={() => handleCombined("zip")} className={secondaryButton}>ZIP Download</button>
          <button disabled={busy || !setupReady} onClick={() => handleCombined("print")} className={secondaryButton}>Print</button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">1. Section & Faculty Setup</h4>
            <p className="mt-1 text-sm text-slate-500">Set this once. You can edit it later.</p>
          </div>
          {setupReady && !setupEditing && <button onClick={() => setSetupEditing(true)} className={secondaryButton}>Edit Sections</button>}
        </div>

        {(!setupReady || setupEditing) ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">How many sections?</label>
              <input type="number" min="1" max="30" value={sectionCount} onChange={(e) => resizeSections(e.target.value)} className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
              <button type="button" onClick={addSectionRow} disabled={sectionRows.length >= 30} className={secondaryButton}>+ Add Section</button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="px-3 py-3">Section</th><th className="px-3 py-3">Faculty Shortcode</th><th className="px-3 py-3 text-right">Action</th></tr></thead>
                <tbody>{sectionRows.map((row, index) => (
                  <tr key={`${row.section}-${index}`} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2"><input value={row.section} onChange={(e) => setSectionRows((prev) => prev.map((x, i) => i === index ? { ...x, section: e.target.value } : x))} className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></td>
                    <td className="px-3 py-2"><input value={row.shortCode} onChange={(e) => setSectionRows((prev) => prev.map((x, i) => i === index ? { ...x, shortCode: e.target.value } : x))} className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="e.g. MMSS" /></td>
                    <td className="px-3 py-2 text-right"><button type="button" onClick={() => removeSectionRow(index)} disabled={sectionRows.length <= 1} className={dangerButton}>Remove</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex gap-2"><button disabled={busy} onClick={handleSaveSetup} className={primaryButton}>Save Setup</button>{setupReady && <button onClick={() => setSetupEditing(false)} className={secondaryButton}>Cancel</button>}</div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">{state.config.sections.map((row) => <span key={row.section} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">Section {row.section} · {row.shortCode || "No shortcode"}</span>)}</div>
        )}
      </section>

      {setupReady && isLab && (
        <LabMappingPanel state={state} mappings={labMappings} setMappings={setLabMappings} onSave={saveMappings} busy={busy} />
      )}

      {setupReady && (
        <section className="space-y-3">
          <div><h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">2. Course File Checklist</h4><p className="mt-1 text-sm text-slate-500">Open an item to upload files, use portal suggestions, or generate available records.</p></div>
          {(state.checklist || []).map((item, index) => (
            <ChecklistItem
              key={item.key}
              index={index + 1}
              item={item}
              state={state}
              completion={completion[item.key]}
              busy={busy}
              startUpload={startGenericUpload}
              sampleSuggestions={scopeSuggestionsForItem(item.key, state)}
              onCandidateChange={handleCandidateChange}
              onSampleFile={handleSampleFile}
              onUseSubmission={handleUseSubmission}
              onSampleIncluded={handleSampleIncluded}
              onDelete={handleDelete}
              onDownload={handleDownloadDoc}
              onExternalObeFiles={handleExternalObeUpload}
              onCurrentObeDownload={handleDownloadCurrentObe}
              onClpDownload={handleDownloadClp}
              onExternalClpFiles={handleExternalClpUpload}
              onAutoAttendanceDownload={handleDownloadAutoAttendance}
              onToggleAutoAttendance={toggleAutoAttendance}
              isLab={isLab}
            />
          ))}
        </section>
      )}

      {setupReady && (
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Supplementary Answer Script Selection Records</h4>
          <p className="mt-1 text-sm text-slate-500">These follow the supplied Mid/Final “Selected 3 Answer scripts” forms. They are generated automatically from the selected Excellent, Mediocre and Poor students and can be included with the main package without becoming checklist items.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SupplementaryCard courseId={courseId} title="Mid Term Selection Record" rows={getAnswerRecordRows("mid")} enabled={state.config?.supplementary?.includeMidSelectionSheet !== false} onToggle={(value) => toggleSupplementary("includeMidSelectionSheet", value)} signatureEnabled={state.config?.supplementary?.includeMidSignature === true} onSignatureToggle={(value) => toggleSupplementary("includeMidSignature", value)} onEdit={() => editAnswerRecord("mid")} onReset={() => resetAnswerRecord("mid")} hasOverride={(state.config?.answerScriptRecords?.mid || []).length > 0} state={state} period="mid" />
            <SupplementaryCard courseId={courseId} title="Final Selection Record" rows={getAnswerRecordRows("final")} enabled={state.config?.supplementary?.includeFinalSelectionSheet !== false} onToggle={(value) => toggleSupplementary("includeFinalSelectionSheet", value)} signatureEnabled={state.config?.supplementary?.includeFinalSignature === true} onSignatureToggle={(value) => toggleSupplementary("includeFinalSignature", value)} onEdit={() => editAnswerRecord("final")} onReset={() => resetAnswerRecord("final")} hasOverride={(state.config?.answerScriptRecords?.final || []).length > 0} state={state} period="final" />
          </div>
        </section>
      )}

      {answerRecordEditor && (
        <AnswerScriptRecordModal
          editor={answerRecordEditor}
          busy={busy}
          onChange={updateAnswerRecordEditor}
          onClose={() => !busy && setAnswerRecordEditor(null)}
          onSave={saveAnswerRecordEditor}
        />
      )}
    </div>
  );
}

function AnswerScriptRecordModal({ editor, busy, onChange, onClose, onSave }) {
  const isMid = editor.period === "mid";
  const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5 dark:border-slate-700 dark:bg-slate-800/70">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-lg font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">{isMid ? "M" : "F"}</span>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit {isMid ? "Mid" : "Final"} Answer Script Record</h3>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">These values are inserted into the supplied Answer Script Selection template.</p>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Close">×</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          <div className="hidden grid-cols-[120px_150px_1fr_1.35fr_120px_1fr] gap-3 px-3 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500 lg:grid">
            <div>Type</div><div>Answer Script Sl. No.</div><div>Student ID</div><div>Student Name</div><div>Marks</div><div>Remarks</div>
          </div>
          <div className="space-y-3">
            {editor.rows.map((row) => (
              <div key={row.band} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/45 lg:grid lg:grid-cols-[120px_150px_1fr_1.35fr_120px_1fr] lg:items-end lg:gap-3 lg:p-3">
                <div className="mb-3 lg:mb-0 lg:self-center">
                  <span className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-bold ${row.band === "best" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : row.band === "poor" ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"}`}>{BAND_LABEL[row.band]}</span>
                </div>
                <div className="mb-3 lg:mb-0"><label className={`${labelClass} lg:hidden`}>Answer Script Sl. No.</label><input value={row.scriptSerialNo || ""} onChange={(e) => onChange(row.band, "scriptSerialNo", e.target.value)} className={fieldClass} placeholder="e.g. 01" /></div>
                <div className="mb-3 lg:mb-0"><label className={`${labelClass} lg:hidden`}>Student ID</label><input value={row.studentRoll || ""} onChange={(e) => onChange(row.band, "studentRoll", e.target.value)} className={fieldClass} /></div>
                <div className="mb-3 lg:mb-0"><label className={`${labelClass} lg:hidden`}>Student Name</label><input value={row.studentName || ""} onChange={(e) => onChange(row.band, "studentName", e.target.value)} className={fieldClass} /></div>
                <div className="mb-3 lg:mb-0"><label className={`${labelClass} lg:hidden`}>Marks</label><input value={row.scoreDisplay || ""} onChange={(e) => onChange(row.band, "scoreDisplay", e.target.value)} className={fieldClass} /></div>
                <div><label className={`${labelClass} lg:hidden`}>Remarks</label><input value={row.remarks || ""} onChange={(e) => onChange(row.band, "remarks", e.target.value)} className={fieldClass} placeholder="Optional" /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-800/70 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className={primaryButton}>{busy ? "Saving..." : "Save Record"}</button>
        </div>
      </div>
    </div>
  );
}

function LabMappingPanel({ state, mappings, setMappings, onSave, busy }) {
  const assessments = state?.assessments || [];
  const toggle = (field, id) => setMappings((prev) => ({ ...prev, [field]: prev[field].includes(id) ? prev[field].filter((x) => x !== id) : [...prev[field], id] }));
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Lab Course Mapping</h4><p className="mt-1 text-sm text-slate-500">The portal auto-detects names, but you can manually include/exclude exactly what counts as Lab Report, Continuous Lab Performance, and Project Report.</p></div><button disabled={busy} onClick={onSave} className={primaryButton}>Save Mapping</button></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <MappingGroup title="Lab Report assessments" field="labReportAssessmentIds" ids={mappings.labReportAssessmentIds} assessments={assessments} onToggle={toggle} />
        <MappingGroup title="Continuous Lab Performance" field="continuousLabAssessmentIds" ids={mappings.continuousLabAssessmentIds} assessments={assessments} onToggle={toggle} />
        <MappingGroup title="Project Report assessments" field="projectReportAssessmentIds" ids={mappings.projectReportAssessmentIds} assessments={assessments} onToggle={toggle} />
      </div>
    </section>
  );
}

function MappingGroup({ title, field, ids, assessments, onToggle }) {
  return <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><div className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">{title}</div><div className="max-h-48 space-y-1 overflow-auto">{assessments.map((assessment) => <label key={assessment.id} className="flex items-start gap-2 rounded px-1 py-1 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={ids.includes(String(assessment.id))} onChange={() => onToggle(field, String(assessment.id))} className="mt-0.5" /><span>{assessment.name} <span className="text-slate-400">({assessment.fullMarks})</span></span></label>)}</div></div>;
}

function ChecklistItem({ index, item, state, completion, busy, startUpload, sampleSuggestions, onCandidateChange, onSampleFile, onUseSubmission, onSampleIncluded, onDelete, onDownload, onExternalObeFiles, onCurrentObeDownload, onClpDownload, onExternalClpFiles, onAutoAttendanceDownload, onToggleAutoAttendance, isLab }) {
  let docs = (state.documents || []).filter((doc) => doc.itemKey === item.key || (item.key === "course_evaluation" && doc.itemKey === "obe_gradesheet"));
  if (["mid", "final", "lab_exam"].includes(item.key)) docs = [];
  if (item.key === "class_test") docs = docs.filter((doc) => !doc.band);
  return (
    <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{index}</span>
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</div><div className="mt-0.5 text-sm text-slate-500">{completion?.detail}</div></div>
        <span className={`rounded-full border px-2.5 py-1 text-sm font-bold ${statusClass(completion?.status)}`}>{completion?.status}</span>
        <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        {item.mode === "single" && item.key !== "questions" && (
          <button disabled={busy} onClick={() => startUpload(item.key, { multiple: true })} className={primaryButton}>Upload File</button>
        )}
        {item.key === "attendance" && (
          <AttendanceActions
            state={state}
            busy={busy}
            startUpload={startUpload}
            onAutoDownload={onAutoAttendanceDownload}
            onToggleAuto={onToggleAutoAttendance}
          />
        )}
        {item.mode === "all_sections" && !["course_evaluation", "continuous_lab", "attendance"].includes(item.key) && (
          <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => startUpload(item.key, { sectioned: true, multiple: false })} className={primaryButton}>Upload Single</button><button disabled={busy} onClick={() => startUpload(item.key, { sectioned: true, multiple: true })} className={secondaryButton}>Bulk Upload & Auto Match</button></div>
        )}
        {item.key === "questions" && !isLab && (
          <ExamQuestionsActions state={state} busy={busy} startUpload={startUpload} />
        )}
        {item.key === "course_evaluation" && (
          <CourseEvaluationActions state={state} busy={busy} onCurrentDownload={onCurrentObeDownload} onExternalFiles={onExternalObeFiles} />
        )}
        {item.key === "continuous_lab" && isLab && (
          <ClpActions state={state} busy={busy} onCurrentDownload={onClpDownload} onExternalFiles={onExternalClpFiles} />
        )}
        {item.key === "assignment" && !isLab && (
          <AssignmentRubricsActions state={state} busy={busy} startUpload={startUpload} />
        )}
        {item.key === "class_test" && sampleSuggestions?.length > 0 && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Class Test Question Papers</div>
            <p className="mt-1 text-sm text-slate-500">Upload one question paper for each detected Class Test. The physical answer scripts are confirmed separately below.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sampleSuggestions.map((suggestion, suggestionIndex) => (
                <button
                  type="button"
                  key={suggestion.scopeKey}
                  disabled={busy}
                  onClick={() => startUpload(item.key, {
                    multiple: false,
                    section: String(state.course?.section || ""),
                    assessmentId: suggestion.assessmentId || "",
                    scopeKey: suggestion.scopeKey,
                    label: `Question - ${suggestion.title}`,
                  })}
                  className="group flex min-h-[78px] items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-left shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 transition group-hover:bg-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-300">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3h7l3 3v15H7z"/><path d="M14 3v4h4M9.5 11h5M9.5 14h5M9.5 17h3"/></svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Question Paper {String(suggestionIndex + 1).padStart(2, "0")}</span>
                    <span className="mt-0.5 block truncate text-sm font-bold text-slate-800 dark:text-slate-100">{suggestion.title}</span>
                    <span className="mt-1 block text-xs font-semibold text-indigo-600 dark:text-indigo-300">Choose file to upload</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {["samples", "samples_by_assessment"].includes(item.mode) && (
          <SampleSuggestions state={state} itemKey={item.key} suggestions={sampleSuggestions} busy={busy} onCandidateChange={onCandidateChange} onSampleFile={onSampleFile} onUseSubmission={onUseSubmission} onSampleIncluded={onSampleIncluded} />
        )}

        <DocumentList docs={docs} onDownload={onDownload} onDelete={onDelete} />
      </div>
    </details>
  );
}

function ClpActions({ state, busy, onCurrentDownload, onExternalFiles }) {
  const inputRef = useRef(null);
  const ownerSection = String(state?.course?.section || "");
  const configuredSections = (state?.config?.sections || []).map((row) => String(row.section || "")).filter(Boolean);
  const otherSections = configuredSections.filter((section) => section !== ownerSection);
  const clpDocs = (state?.documents || []).filter((doc) => doc.itemKey === "continuous_lab");
  const automaticSections = Array.isArray(state?.autoSources?.sections) ? state.autoSources.sections : [];
  const autoSection = (section) => automaticSections.find((row) => String(row?.section || "") === String(section));
  const sectionReady = (section) =>
    clpDocs.some((doc) => String(doc.section || "") === String(section)) || autoSection(section)?.continuousLabReady === true;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Current section {ownerSection}</div>
            <p className="mt-1 text-sm text-slate-500">The CLP PDF is generated directly from the <b>CLP worksheet</b> inside the new Lab OBE CO-PO workbook.</p>
          </div>
          <button disabled={busy || !state?.autoSources?.obeReady} onClick={onCurrentDownload} className={primaryButton}>Download CLP PDF</button>
        </div>
        {!state?.autoSources?.obeReady && <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-300">Complete the Lab OBE setup/marks first so the CLP worksheet can be generated.</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Other sections</div>
        <p className="mt-1 text-sm text-slate-500">If you teach the same course in another section, its CLP is linked automatically from that section's OBE data. For sections taught by someone else, upload their OBE Excel workbook or CLP PDF as before.</p>
        {!!otherSections.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {otherSections.map((section) => {
              const ready = sectionReady(section);
              const autoLinked = autoSection(section);
              return <span key={section} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"}`}>Section {section} · {ready ? (autoLinked?.continuousLabReady ? "Auto-linked" : "Ready") : "Missing"}</span>;
            })}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xlsm,.pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            onExternalFiles(files);
          }}
        />
        <button disabled={busy || !otherSections.length} onClick={() => inputRef.current?.click()} className={`${secondaryButton} mt-3`}>Import Other Sections Excel / PDF</button>
        {!otherSections.length && <p className="mt-2 text-xs text-slate-400">No additional section is configured.</p>}
      </div>
    </div>
  );
}

function AttendanceActions({ state, busy, startUpload, onAutoDownload, onToggleAuto }) {
  const ownerSection = String(state?.course?.section || "");
  const ownerManual = (state?.documents || []).find(
    (doc) => doc.itemKey === "attendance" && String(doc.section || "") === ownerSection
  );
  const autoReady = state?.autoSources?.attendanceReady === true;
  const autoEnabled = state?.config?.autoAttendanceEnabled !== false;
  const otherSections = (state?.config?.sections || [])
    .map((row) => String(row.section || ""))
    .filter((section) => section && section !== ownerSection);
  const automaticSections = Array.isArray(state?.autoSources?.sections) ? state.autoSources.sections : [];
  const automaticOtherSections = automaticSections.filter((row) => !row?.isOwner && String(row?.section || ""));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Current section {ownerSection}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${autoReady ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                {autoReady ? "Portal attendance found" : "No portal attendance yet"}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              The attendance already saved in this course can be generated automatically as the same Attendance Report PDF used by the portal.
            </p>
            {ownerManual && (
              <p className="mt-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                Manual replacement is currently available and will be used in the package instead of the auto-generated PDF.
              </p>
            )}
          </div>
          <label className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${autoReady ? "cursor-pointer border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60"}`}>
            <input
              type="checkbox"
              checked={autoEnabled}
              disabled={busy || !autoReady}
              onChange={(e) => onToggleAuto(e.target.checked)}
              className="h-4 w-4"
            />
            Use portal-generated PDF
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy || !autoReady} onClick={onAutoDownload} className={primaryButton}>Download Portal Attendance PDF</button>
          <button
            disabled={busy}
            onClick={() => startUpload("attendance", {
              multiple: false,
              section: ownerSection,
              label: "Manual attendance replacement",
              replaceSection: true,
            })}
            className={secondaryButton}
          >
            {ownerManual ? "Replace Manually" : "Upload Manually"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Other sections</div>
        <p className="mt-1 text-sm text-slate-500">Attendance from another section of this same course is linked automatically when you are the teacher of that section. Manual upload remains available for other faculties or as a replacement.</p>
        {!!automaticOtherSections.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {automaticOtherSections.map((row) => <span key={row.courseId || row.section} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${row.attendanceReady ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"}`}>Section {row.section} · {row.attendanceReady ? "Auto-linked" : "Attendance missing"}</span>)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy || !otherSections.length} onClick={() => startUpload("attendance", { sectioned: true, multiple: false, otherSectionsOnly: true })} className={primaryButton}>Upload Single - Other Section</button>
          <button disabled={busy || !otherSections.length} onClick={() => startUpload("attendance", { sectioned: true, multiple: true, otherSectionsOnly: true })} className={secondaryButton}>Bulk Upload & Auto Match</button>
        </div>
        {!otherSections.length && <p className="mt-2 text-xs text-slate-400">No additional section is configured.</p>}
      </div>
    </div>
  );
}

function AssignmentRubricsActions({ state, busy, startUpload }) {
  const ownerSection = String(state?.course?.section || "");
  const rubricDoc = (state?.documents || []).find((doc) =>
    doc.itemKey === "assignment" && (doc.scopeKey === "assignment:rubrics" || /rubric/i.test(String(doc.label || doc.originalFileName || "")))
  );
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Assignment Rubrics</div>
          <p className="mt-1 text-sm text-slate-500">Upload the assignment rubric separately as a Word or PDF file. The handwritten/physical assignment samples are confirmed below.</p>
          {rubricDoc && <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">Attached: {rubricDoc.originalFileName}</p>}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => startUpload("assignment", {
            multiple: false,
            section: ownerSection,
            scopeKey: "assignment:rubrics",
            label: "Assignment Rubrics",
            replaceScopeKey: true,
            accept: ".doc,.docx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          })}
          className={rubricDoc ? secondaryButton : primaryButton}
        >
          {rubricDoc ? "Replace Rubrics" : "Upload Rubrics"}
        </button>
      </div>
    </div>
  );
}

function ExamQuestionsActions({ state, busy, startUpload }) {
  const ownerSection = String(state?.course?.section || "");
  const docs = (state?.documents || []).filter((doc) => doc.itemKey === "questions");
  const cards = [
    { key: "mid", title: "Mid Semester Examination", accent: "M" },
    { key: "final", title: "Final Examination", accent: "F" },
  ];

  const findDoc = (key, kind) => docs.find((doc) => {
    const scope = String(doc.scopeKey || "");
    if (scope === `questions:${key}:${kind}`) return true;
    if (scope === `questions:${key}`) return true; // legacy combined upload
    const label = String(doc.label || doc.originalFileName || "");
    if (kind === "paper") return new RegExp(`${key}.*question|question.*${key}`, "i").test(label);
    return new RegExp(`${key}.*(schema|rubric)|(schema|rubric).*${key}`, "i").test(label);
  });

  const upload = (key, kind, label) => startUpload("questions", {
    multiple: false,
    section: ownerSection,
    scopeKey: `questions:${key}:${kind}`,
    label,
    replaceScopeKey: true,
    accept: ".doc,.docx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {cards.map((card) => {
        const questionDoc = findDoc(card.key, "paper");
        const rubricDoc = findDoc(card.key, "rubrics");
        return (
          <div key={card.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-black text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">{card.accent}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{card.title}</div>
                <p className="mt-1 text-sm text-slate-500">Keep the question paper and its Answer Schema with Rubrics as two separate files.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Question Paper</div>
                    <div className={`mt-1 truncate text-xs ${questionDoc ? "text-emerald-600 dark:text-emerald-300" : "text-slate-400"}`}>{questionDoc?.originalFileName || "Not uploaded"}</div>
                    <button type="button" disabled={busy} onClick={() => upload(card.key, "paper", `${card.title} - Question Paper`)} className={`${questionDoc ? secondaryButton : primaryButton} mt-2 w-full`}>
                      {questionDoc ? "Replace Question" : "Upload Question"}
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Answer Schema with Rubrics</div>
                    <div className={`mt-1 truncate text-xs ${rubricDoc ? "text-emerald-600 dark:text-emerald-300" : "text-slate-400"}`}>{rubricDoc?.originalFileName || "Not uploaded"}</div>
                    <button type="button" disabled={busy} onClick={() => upload(card.key, "rubrics", `${card.title} - Answer Schema with Rubrics`)} className={`${rubricDoc ? secondaryButton : primaryButton} mt-2 w-full`}>
                      {rubricDoc ? "Replace Rubrics" : "Upload Rubrics"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CourseEvaluationActions({ state, busy, onCurrentDownload, onExternalFiles }) {
  const inputRef = useRef(null);
  const automaticSections = Array.isArray(state?.autoSources?.sections) ? state.autoSources.sections : [];
  const automaticOtherSections = automaticSections.filter((row) => !row?.isOwner && String(row?.section || ""));
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
        <div className="text-sm font-bold text-slate-700 dark:text-slate-200">Current section {state.course?.section}</div>
        {state.autoSources?.obeReady ? (
          <>
            <p className="mt-1 text-sm text-slate-500">Automatically connected to this course's OBE / CO-PO data. The finalized Course Report and GradeSheet layouts are used.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => onCurrentDownload("report")} className={primaryButton}>Course Report PDF</button>
              <button disabled={busy} onClick={() => onCurrentDownload("grade")} className={secondaryButton}>Grade Sheet PDF</button>
              <button disabled={busy} onClick={() => onCurrentDownload("excel")} className={secondaryButton}>OBE Excel</button>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">Complete the OBE setup/marks first. Until then, this section is not counted as complete.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-sm font-bold text-slate-700 dark:text-slate-200">Other sections</div>
        <p className="mt-1 text-sm text-slate-500">
          If you teach the same course in another section, that section's Course Report, GradeSheet and OBE workbook are generated automatically from its own OBE data. Upload is only needed for sections that are not one of your linked courses or when you want a manual replacement.
        </p>
        {!!automaticOtherSections.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {automaticOtherSections.map((row) => <span key={row.courseId || row.section} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${row.obeReady ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"}`}>Section {row.section} · {row.obeReady ? "OBE auto-linked" : "OBE incomplete"}</span>)}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xlsm,.xls,.pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            onExternalFiles(files);
          }}
        />
        <button disabled={busy} onClick={() => inputRef.current?.click()} className={`${secondaryButton} mt-3`}>
          Upload Other Sections CO-PO Excel / PDF (Bulk or Single)
        </button>
      </div>
    </div>
  );
}


function SampleSuggestions({ state, itemKey, suggestions, busy, onCandidateChange, onSampleFile, onUseSubmission, onSampleIncluded }) {
  if (!suggestions?.length) return <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">No matching marks assessment was found. Check the assessment name or use Lab Course Mapping where available.</div>;
  const answerScriptOnly = ["class_test", "mid", "final", "lab_exam"].includes(itemKey);
  const assignmentSamples = itemKey === "assignment";
  return (
    <div className="space-y-4">
      {suggestions.map((suggestion) => (
        <div key={suggestion.scopeKey} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{suggestion.title}</div>
            <span className="text-sm text-slate-400">Up to 5 suggestions per type</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            {ALL_BANDS.map((band) => {
              const candidates = suggestion.bands?.[band] || [];
              const selected = getSelectedCandidate(state, suggestion, band);
              const selection = (state?.config?.selections || []).find((row) => row.scopeKey === suggestion.scopeKey && row.band === band);
              const included = selection?.included === true;
              return (
                <div key={band} className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{BAND_LABEL[band]}</div>
                  {candidates.length ? (
                    <>
                      <select
                        value={selected?.studentId || ""}
                        onChange={(e) => onCandidateChange(suggestion, band, e.target.value)}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        {candidates.map((candidate) => <option key={candidate.studentId} value={candidate.studentId}>{candidate.roll} · {candidate.name} · {candidate.scoreDisplay || candidate.score}</option>)}
                      </select>
                      {answerScriptOnly ? (
                        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={busy}
                            onChange={(e) => onSampleIncluded(suggestion, band, selected, e.target.checked)}
                            className="h-4 w-4"
                          />
                          <span>Answer script received / included</span>
                        </label>
                      ) : assignmentSamples ? (
                        <div className="mt-3 space-y-2">
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={included}
                              disabled={busy}
                              onChange={(e) => onSampleIncluded(suggestion, band, selected, e.target.checked)}
                              className="h-4 w-4"
                            />
                            <span>Handwritten / physical assignment included</span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <label className={`${secondaryButton} cursor-pointer`}>Upload File (Optional)<input type="file" className="hidden" onChange={(e) => onSampleFile(e, itemKey, suggestion, band, selected)} /></label>
                            {selected?.submissionId && <button disabled={busy} onClick={() => onUseSubmission(itemKey, suggestion, band, selected)} className={secondaryButton}>Use Submitted File</button>}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <label className={`${primaryButton} cursor-pointer`}>Upload File<input type="file" className="hidden" onChange={(e) => onSampleFile(e, itemKey, suggestion, band, selected)} /></label>
                          {selected?.submissionId && <button disabled={busy} onClick={() => onUseSubmission(itemKey, suggestion, band, selected)} className={secondaryButton}>Use Submitted File</button>}
                        </div>
                      )}
                      <div className="mt-2 text-sm text-slate-500">
                        {answerScriptOnly
                          ? "No answer-script file is uploaded to the portal. This check only records that the selected physical script has been included in the course file."
                          : assignmentSamples
                            ? "Uploading a file is optional. For the usual handwritten assignment, tick the physical-copy checkbox instead."
                            : "Tie-break uses the student's overall marks. Poor ties prefer lower overall performance; mediocre is selected around the median."}
                      </div>
                    </>
                  ) : <div className="mt-2 text-sm text-slate-400">No eligible mark data</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentList({ docs, onDownload, onDelete }) {
  if (!docs?.length) return null;
  return <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-800"><tr><th className="px-3 py-2">File</th><th className="px-3 py-2">Section</th><th className="px-3 py-2">Sample</th><th className="px-3 py-2 text-right">Actions</th></tr></thead><tbody>{docs.map((doc) => <tr key={doc.id || doc._id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-3 py-2"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-700 dark:text-slate-200">{doc.originalFileName}</span>{doc.linkedFromSibling && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300">Auto-linked</span>}</div>{doc.label && <div className="text-sm text-slate-400">{doc.label}</div>}</td><td className="px-3 py-2">{doc.section || "—"}</td><td className="px-3 py-2">{doc.band ? BAND_LABEL[doc.band] : "—"}{doc.studentRoll ? ` · ${doc.studentRoll}` : ""}</td><td className="px-3 py-2"><div className="flex justify-end gap-2"><button onClick={() => onDownload(doc)} className={secondaryButton}>Download</button>{doc.linkedFromSibling ? <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800">Manage in Section {doc.section || "source"}</span> : <button onClick={() => onDelete(doc)} className={dangerButton}>Remove</button>}</div></td></tr>)}</tbody></table></div>;
}

function SupplementaryCard({ courseId, title, rows, enabled, onToggle, signatureEnabled, onSignatureToggle, onEdit, onReset, hasOverride, state, period }) {
  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const docx = await buildAnswerScriptRecordDocxFromTemplate(state, period, rows, { includeSignature: signatureEnabled === true });
      const docxName = period === "mid" ? "Answer_Script_Selection_Mid.docx" : "Answer_Script_Selection_Final.docx";
      const pdf = await convertCourseFileOfficeToPdf(courseId, new File([docx], docxName, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      saveAs(pdf, period === "mid" ? "Answer_Script_Selection_Mid.pdf" : "Answer_Script_Selection_Final.pdf");
    } catch (error) {
      Swal.fire("Could not generate record", error?.response?.data?.message || error.message, "error");
    } finally { setDownloading(false); }
  };
  return <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</div><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm text-slate-500"><input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} /> Include in package</label><label className={`flex items-center gap-2 text-sm ${state?.teacher?.signatureImage ? "text-slate-500" : "text-slate-400"}`} title={state?.teacher?.signatureImage ? "Use the signature already uploaded in your faculty profile" : "No faculty signature is uploaded in your profile"}><input type="checkbox" checked={signatureEnabled} disabled={!state?.teacher?.signatureImage} onChange={(e) => onSignatureToggle(e.target.checked)} /> Include uploaded signature</label></div></div><div className="mt-2 space-y-1.5">{rows.length ? rows.map((row) => <div key={row.band} className="text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold">{BAND_LABEL[row.band]}:</span> {row.scriptSerialNo ? `Sl. ${row.scriptSerialNo} · ` : ""}{row.roll} · {row.name} · {row.scoreDisplay || row.score}</div>) : <div className="text-sm text-slate-400">No matching {period} assessment/marks found.</div>}</div>{rows.length > 0 && <div className="mt-3 flex flex-wrap gap-2"><button disabled={downloading} onClick={handleDownload} className={secondaryButton}>{downloading ? "Generating..." : "Download This Record"}</button><button onClick={onEdit} className={secondaryButton}>Edit Record Fields</button>{hasOverride && <button onClick={onReset} className={secondaryButton}>Reset to Auto</button>}</div>}</div>;
}
