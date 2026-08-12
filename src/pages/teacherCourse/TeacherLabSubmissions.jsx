import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import {
  createTeacherSubmissionAssessment,
  deleteTeacherLabSubmission,
  deleteTeacherSubmissionAssessment,
  downloadAllTeacherSubmissions,
  fetchTeacherAssessmentSubmissions,
  fetchTeacherMarksSyncConfiguration,
  fetchTeacherSubmissionAssessments,
  getPublicFileUrl,
  syncAllSubmissionMarks,
  updateLabSubmissionStatus,
  updateTeacherMarksSyncConfiguration,
  updateTeacherSubmissionAssessment,
} from "../../services/labSubmissionService";
import TeacherPublicSubmissionLinkPanel from "./TeacherPublicSubmissionLinkPanel";
import { getCourseStudents } from "../../services/enrollmentService";

const FILE_TYPE_OPTIONS = [
  { value: "pdf", label: "PDF" },
  { value: "doc", label: "DOC" },
  { value: "docx", label: "DOCX" },
  { value: "xls", label: "XLS" },
  { value: "xlsx", label: "XLSX" },
  { value: "ppt", label: "PPT" },
  { value: "pptx", label: "PPTX" },
  { value: "txt", label: "TXT" },
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
  { value: "md", label: "MD" },
  { value: "xml", label: "XML" },
  { value: "zip", label: "ZIP" },
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPG" },
  { value: "jpeg", label: "JPEG" },
  { value: "c", label: "C" },
  { value: "cpp", label: "CPP" },
  { value: "java", label: "JAVA" },
  { value: "sql", label: "SQL" },
  { value: "py", label: "PY" },
  { value: "js", label: "JS" },
  { value: "jsx", label: "JSX" },
  { value: "ts", label: "TS" },
  { value: "tsx", label: "TSX" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "php", label: "PHP" },
  { value: "sh", label: "SH" },
];

const DEFAULT_ALLOWED_EXTENSIONS = FILE_TYPE_OPTIONS.map((item) => item.value);
const FIXED_FILE_TYPE_VALUES = new Set(DEFAULT_ALLOWED_EXTENSIONS);
const EXTENSION_PATTERN = /^[a-z0-9][a-z0-9_+-]{0,15}$/;
const AUTO_SAVE_DELAY = 700;
const CREATE_REGULAR_TARGET = "__create_lab_assessment__";
const MAX_SUBMISSION_FILE_SIZE_MB = 50;
const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
const OFFICE_PREVIEW_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);
const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt",
  "csv",
  "json",
  "md",
  "xml",
  "c",
  "cpp",
  "java",
  "sql",
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "html",
  "css",
  "php",
  "sh",
]);
const IMAGE_PREVIEW_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);

const initialForm = {
  name: "Lab Assessment Submission",
  fullMarks: 10,
  instructions: "",
  dueDate: "",
  dueTime: "",
  allowResubmission: true,
  maxFileSizeMB: 10,
  resourceTitle: "View Resource",
  resourceUrl: "",
  allowedExtensions: DEFAULT_ALLOWED_EXTENSIONS,
  customExtension: "",
  eligibilityMode: "all",
  eligibleStudentIds: [],
  studentSearch: "",
};

const TAB_ITEMS = [
  {
    id: "create",
    label: "Create Assessment",
    description: "Create or edit a submission task",
  },
  {
    id: "public",
    label: "Public Submission",
    description: "Manage the no-login upload page",
  },
  {
    id: "submissions",
    label: "Student Submissions",
    description: "Review files and enter marks",
  },
  {
    id: "sync",
    label: "Marks Sync",
    description: "Sync to Lab Assessments, Mid, or Final",
  },
];

function deriveLabAssessmentName(sourceName = "") {
  let name = String(sourceName || "")
    .replace(/\bsubmission\b/gi, " ")
    .replace(/\b(mid|final|attendance)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—:]\s*$/g, "")
    .trim();

  if (!name) name = "Lab Assessment";
  if (!/\blab\b/i.test(name)) name = `Lab Assessment - ${name}`;
  return name;
}

function sanitizeExtension(value = "") {
  const ext = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "");

  return EXTENSION_PATTERN.test(ext) ? ext : "";
}

function formatDateTime(value) {
  if (!value) return "No deadline set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline set";
  return date.toLocaleString();
}

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function combineDateTime(date, time) {
  if (!date) return null;

  const [year, month, day] = String(date).split("-").map(Number);
  const [hour = 23, minute = 59] = String(time || "23:59")
    .split(":")
    .map(Number);

  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function formatFileSize(size = 0) {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileExtension(fileName = "") {
  const value = String(fileName || "");
  const dotIndex = value.lastIndexOf(".");
  return dotIndex >= 0 ? value.slice(dotIndex + 1).toLowerCase() : "";
}

function getPreviewType(file = {}) {
  const extension = getFileExtension(file.originalFileName);
  const mimeType = String(file.mimeType || "").toLowerCase();

  if (extension === "pdf" || mimeType === "application/pdf") return "pdf";
  if (OFFICE_PREVIEW_EXTENSIONS.has(extension)) return "office";
  if (IMAGE_PREVIEW_EXTENSIONS.has(extension) || mimeType.startsWith("image/")) {
    return "image";
  }
  if (TEXT_PREVIEW_EXTENSIONS.has(extension) || mimeType.startsWith("text/")) {
    return "text";
  }
  return "unsupported";
}

function buildOfficeViewerUrl(fileUrl = "") {
  if (!fileUrl) return "";
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
    fileUrl
  )}`;
}

function normalizeAllowedExtensions(value, fallbackToDefault = true) {
  const selected = Array.isArray(value)
    ? value.map((item) => sanitizeExtension(item)).filter(Boolean)
    : [];

  const unique = Array.from(new Set(selected));
  if (unique.length) return unique;
  return fallbackToDefault ? DEFAULT_ALLOWED_EXTENSIONS : [];
}

function formatAllowedExtensions(value) {
  return normalizeAllowedExtensions(value, true)
    .map((item) => item.toUpperCase())
    .join(", ");
}

function getDateMs(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortSubmissions(rows = [], sortBy = "roll-asc") {
  const sorted = [...rows];

  if (sortBy === "roll-desc") {
    return sorted.sort((a, b) =>
      String(b?.roll || "").localeCompare(String(a?.roll || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  }

  if (sortBy === "time-newest") {
    return sorted.sort(
      (a, b) => getDateMs(b?.submittedAt) - getDateMs(a?.submittedAt)
    );
  }

  if (sortBy === "time-oldest") {
    return sorted.sort(
      (a, b) => getDateMs(a?.submittedAt) - getDateMs(b?.submittedAt)
    );
  }

  return sorted.sort((a, b) =>
    String(a?.roll || "").localeCompare(String(b?.roll || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}

function getSubmissionStatusMeta(item) {
  if (item?.closedReason === "due_date_passed" || item?.dueDatePassed) {
    return { label: "Deadline Passed", tone: "rose" };
  }

  if (item?.submissionsOpen) {
    return { label: "Open", tone: "sky" };
  }

  return { label: "Closed", tone: "rose" };
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    indigo:
      "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300",
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center rounded-full border px-2.5 py-1 text-left text-[11px] font-semibold leading-tight ${tones[tone] || tones.slate}`}
    >
      {children}
    </span>
  );
}

function AutoSaveIndicator({ state }) {
  if (!state || state.status === "idle") {
    return (
      <span className="text-[11px] text-slate-400 dark:text-slate-500">
        Saves automatically
      </span>
    );
  }

  if (state.status === "waiting") {
    return (
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Waiting to save…
      </span>
    );
  }

  if (state.status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
        <SpinnerIcon /> Saving…
      </span>
    );
  }

  if (state.status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
        <CheckIcon /> Saved and checked
      </span>
    );
  }

  return (
    <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-300">
      {state.message || "Could not save"}
    </span>
  );
}

export default function TeacherLabSubmissions({ courseId }) {
  const [activeTab, setActiveTab] = useState("submissions");
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState("");
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedData, setSelectedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [submissionSortBy, setSubmissionSortBy] = useState("roll-asc");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [autoSaveStates, setAutoSaveStates] = useState({});
  const [syncConfig, setSyncConfig] = useState({ submissions: [], targets: [] });
  const [syncDrafts, setSyncDrafts] = useState({});
  const [loadingSyncConfig, setLoadingSyncConfig] = useState(false);
  const [savingSyncId, setSavingSyncId] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [courseStudents, setCourseStudents] = useState([]);
  const [loadingCourseStudents, setLoadingCourseStudents] = useState(false);

  const dateInputRef = useRef(null);
  const timeInputRef = useRef(null);
  const autoSaveTimersRef = useRef(new Map());
  const savedStateTimersRef = useRef(new Map());
  const saveVersionsRef = useRef(new Map());

  const selectedAssessment = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  const selectedStatusMeta = getSubmissionStatusMeta(selectedAssessment);

  const sortedSubmissions = useMemo(
    () => sortSubmissions(selectedData?.submissions || [], submissionSortBy),
    [selectedData, submissionSortBy]
  );

  const selectedAllowedExtensions = normalizeAllowedExtensions(
    form.allowedExtensions,
    false
  );

  const allSelectableExtensions = Array.from(
    new Set([...DEFAULT_ALLOWED_EXTENSIONS, ...selectedAllowedExtensions])
  );

  const allAllowedSelected =
    allSelectableExtensions.length > 0 &&
    allSelectableExtensions.every((ext) => selectedAllowedExtensions.includes(ext));

  const customSelectedExtensions = selectedAllowedExtensions.filter(
    (ext) => !FIXED_FILE_TYPE_VALUES.has(ext)
  );

  const filteredCourseStudents = useMemo(() => {
    const query = String(form.studentSearch || "").trim().toLowerCase();
    const students = Array.isArray(courseStudents) ? courseStudents : [];
    if (!query) return students;
    return students.filter((student) =>
      `${student?.roll || ""} ${student?.name || ""}`.toLowerCase().includes(query)
    );
  }, [courseStudents, form.studentSearch]);

  const selectedStudentCount = Array.isArray(form.eligibleStudentIds)
    ? form.eligibleStudentIds.length
    : 0;

  const clearSubmissionTimers = (submissionId) => {
    const autoSaveTimer = autoSaveTimersRef.current.get(submissionId);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimersRef.current.delete(submissionId);

    const savedStateTimer = savedStateTimersRef.current.get(submissionId);
    if (savedStateTimer) clearTimeout(savedStateTimer);
    savedStateTimersRef.current.delete(submissionId);
  };

  const clearAllSubmissionTimers = () => {
    autoSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
    savedStateTimersRef.current.forEach((timer) => clearTimeout(timer));
    autoSaveTimersRef.current.clear();
    savedStateTimersRef.current.clear();
  };

  useEffect(() => clearAllSubmissionTimers, []);

  useEffect(() => {
    clearAllSubmissionTimers();
    setAutoSaveStates({});
  }, [selectedId]);

  useEffect(() => {
    if (!previewFile) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setPreviewFile(null);
      setPreviewText("");
      setPreviewLoading(false);
      setPreviewError("");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewFile]);

  const loadAssessments = async (preferredId = null) => {
    setLoading(true);

    try {
      const data = await fetchTeacherSubmissionAssessments(courseId);
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);

      const nextSelected =
        preferredId && rows.some((row) => row.id === preferredId)
          ? preferredId
          : selectedId && rows.some((row) => row.id === selectedId)
            ? selectedId
            : rows[0]?.id || "";

      setSelectedId(nextSelected);
      return rows;
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message ||
          "Could not load submission assessments.",
        "error"
      );
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedSubmissions = async (assessmentId) => {
    if (!assessmentId) {
      setSelectedData(null);
      return;
    }

    setLoadingSubmissions(true);

    try {
      const data = await fetchTeacherAssessmentSubmissions(courseId, assessmentId);
      setSelectedData({
        ...data,
        submissions: (data?.submissions || []).map((row) => ({
          ...row,
          draftMarks:
            row.awardedMarks === null || row.awardedMarks === undefined
              ? ""
              : String(row.awardedMarks),
        })),
      });
    } catch (err) {
      console.error(err);
      setSelectedData(null);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not load submissions.",
        "error"
      );
    } finally {
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (courseId) loadAssessments();
  }, [courseId]);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setCourseStudents([]);
      return undefined;
    }

    const loadCourseStudents = async () => {
      setLoadingCourseStudents(true);
      try {
        const data = await getCourseStudents(courseId);
        if (!cancelled) {
          setCourseStudents(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Could not load course students for submission audience", err);
        if (!cancelled) setCourseStudents([]);
      } finally {
        if (!cancelled) setLoadingCourseStudents(false);
      }
    };

    loadCourseStudents();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    if (selectedId) {
      loadSelectedSubmissions(selectedId);
    } else {
      setSelectedData(null);
    }
  }, [selectedId, courseId]);

  const loadMarksSyncConfiguration = async () => {
    setLoadingSyncConfig(true);

    try {
      const data = await fetchTeacherMarksSyncConfiguration(courseId);
      const nextConfig = {
        submissions: Array.isArray(data?.submissions) ? data.submissions : [],
        targets: Array.isArray(data?.targets) ? data.targets : [],
      };
      setSyncConfig(nextConfig);

      const nextDrafts = {};
      nextConfig.submissions.forEach((assessment) => {
        nextDrafts[assessment.id] = {
          targetAssessmentId: assessment?.mapping?.targetAssessmentId || "",
          targetComponentKey: assessment?.mapping?.targetComponentKey || "",
          createRegularAssessment: false,
          regularAssessmentName: deriveLabAssessmentName(assessment.name),
        };
      });
      setSyncDrafts(nextDrafts);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not load marks sync settings.",
        "error"
      );
    } finally {
      setLoadingSyncConfig(false);
    }
  };

  useEffect(() => {
    if (activeTab === "sync" && courseId) {
      loadMarksSyncConfiguration();
    }
  }, [activeTab, courseId]);

  const closeFilePreview = () => {
    setPreviewFile(null);
    setPreviewText("");
    setPreviewLoading(false);
    setPreviewError("");
  };

  const handlePreviewFile = async (file) => {
    const previewType = getPreviewType(file);
    const nextFile = { ...file, previewType };

    setPreviewFile(nextFile);
    setPreviewText("");
    setPreviewError("");
    setPreviewLoading(previewType === "text");

    if (previewType !== "text") return;

    if (Number(file.fileSize || 0) > MAX_TEXT_PREVIEW_BYTES) {
      setPreviewLoading(false);
      setPreviewError(
        "Text and code preview is limited to 2 MB. Use Open in new tab or Download for this file."
      );
      return;
    }

    try {
      const response = await fetch(getPublicFileUrl(file.downloadUrl));
      if (!response.ok) {
        throw new Error(`Preview request failed (${response.status}).`);
      }

      setPreviewText(await response.text());
    } catch (error) {
      console.error(error);
      setPreviewError(
        "The browser could not load this file preview. You can still open or download the file."
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId("");
  };

  const handleCreateOrUpdate = async (event) => {
    event.preventDefault();

    const allowedExtensions = normalizeAllowedExtensions(
      form.allowedExtensions,
      false
    );

    if (!allowedExtensions.length) {
      Swal.fire(
        "Select file type",
        "Please select at least one allowed file type for student submissions.",
        "warning"
      );
      return;
    }

    const maxFileSizeMB = Number(form.maxFileSizeMB || 10);
    if (
      !Number.isFinite(maxFileSizeMB) ||
      maxFileSizeMB < 1 ||
      maxFileSizeMB > MAX_SUBMISSION_FILE_SIZE_MB
    ) {
      Swal.fire(
        "Invalid file-size limit",
        `Choose a value between 1 and ${MAX_SUBMISSION_FILE_SIZE_MB} MB.`,
        "warning"
      );
      return;
    }

    if (form.eligibilityMode === "selected" && !selectedStudentCount) {
      Swal.fire(
        "Select students",
        "Choose at least one student who is allowed to submit this assessment.",
        "warning"
      );
      return;
    }

    setSavingForm(true);

    try {
      const payload = {
        name: form.name,
        fullMarks: Number(form.fullMarks || 0),
        submissionConfig: {
          instructions: form.instructions,
          dueDate: combineDateTime(form.dueDate, form.dueTime),
          maxFileSizeMB,
          allowResubmission: !!form.allowResubmission,
          eligibilityMode: form.eligibilityMode === "selected" ? "selected" : "all",
          eligibleStudentIds:
            form.eligibilityMode === "selected" ? form.eligibleStudentIds : [],
          resourceTitle: form.resourceTitle,
          resourceUrl: form.resourceUrl,
          allowedExtensions,
        },
      };

      let nextAssessmentId = editingId;

      if (editingId) {
        await updateTeacherSubmissionAssessment(courseId, editingId, {
          action: "update",
          payload: {
            name: payload.name,
            fullMarks: payload.fullMarks,
            instructions: payload.submissionConfig.instructions,
            dueDate: payload.submissionConfig.dueDate,
            maxFileSizeMB: payload.submissionConfig.maxFileSizeMB,
            allowResubmission: payload.submissionConfig.allowResubmission,
            eligibilityMode: payload.submissionConfig.eligibilityMode,
            eligibleStudentIds: payload.submissionConfig.eligibleStudentIds,
            resourceTitle: payload.submissionConfig.resourceTitle,
            resourceUrl: payload.submissionConfig.resourceUrl,
            allowedExtensions: payload.submissionConfig.allowedExtensions,
          },
        });

        await Swal.fire(
          "Updated",
          "Submission assessment updated successfully.",
          "success"
        );
      } else {
        const response = await createTeacherSubmissionAssessment(courseId, payload);
        nextAssessmentId = response?.assessment?.id || "";

        await Swal.fire(
          "Created",
          "Submission assessment created successfully.",
          "success"
        );
      }

      resetForm();
      await loadAssessments(nextAssessmentId || null);
      setActiveTab("submissions");
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message ||
          "Could not save submission assessment.",
        "error"
      );
    } finally {
      setSavingForm(false);
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      fullMarks: item.fullMarks || 10,
      instructions: item.instructions || "",
      dueDate: toDateInputValue(item.dueDate),
      dueTime: toTimeInputValue(item.dueDate),
      allowResubmission: item.allowResubmission !== false,
      maxFileSizeMB: item.maxFileSizeMB || 10,
      resourceTitle: item.resourceTitle || "View Resource",
      resourceUrl: item.resourceUrl || "",
      allowedExtensions: normalizeAllowedExtensions(item.allowedExtensions),
      customExtension: "",
      eligibilityMode: item.eligibilityMode === "selected" ? "selected" : "all",
      eligibleStudentIds: Array.isArray(item.eligibleStudentIds)
        ? item.eligibleStudentIds.map(String)
        : [],
      studentSearch: "",
    });
    setActiveTab("create");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteAssessment = async (assessmentId, name) => {
    const result = await Swal.fire({
      title: "Delete assessment?",
      text: `This will delete “${name}” and every submitted file under it.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    setActionLoading(`delete-assessment-${assessmentId}`);

    try {
      await deleteTeacherSubmissionAssessment(courseId, assessmentId);

      if (editingId === assessmentId) resetForm();

      await loadAssessments();
      await Swal.fire("Deleted", "Assessment deleted successfully.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not delete assessment.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleAssessmentAction = async (assessmentId, action) => {
    setActionLoading(`${assessmentId}-${action}`);

    try {
      await updateTeacherSubmissionAssessment(courseId, assessmentId, { action });
      await loadAssessments(assessmentId);
      await loadSelectedSubmissions(assessmentId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not update assessment.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleDownloadAll = async () => {
    if (!selectedId) return;

    setActionLoading(`download-${selectedId}`);

    try {
      await downloadAllTeacherSubmissions(courseId, selectedId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not download all files.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const updateDraftMarks = (submissionId, value) => {
    setSelectedData((previous) => {
      if (!previous) return previous;

      return {
        ...previous,
        submissions: previous.submissions.map((row) =>
          row.id === submissionId ? { ...row, draftMarks: value } : row
        ),
      };
    });
  };

  const setAutoSaveState = (submissionId, nextState) => {
    setAutoSaveStates((previous) => ({
      ...previous,
      [submissionId]: nextState,
    }));
  };

  const persistMarks = async (submissionId, rawValue) => {
    clearSubmissionTimers(submissionId);

    const value = String(rawValue ?? "").trim();
    const maxMarks = Number(selectedAssessment?.fullMarks || 0);
    const isEmpty = value === "";
    const numericMarks = isEmpty ? null : Number(value);

    if (
      !isEmpty &&
      (!Number.isFinite(numericMarks) || numericMarks < 0 || numericMarks > maxMarks)
    ) {
      setAutoSaveState(submissionId, {
        status: "error",
        message: `Use a value from 0 to ${maxMarks}.`,
      });
      return;
    }

    const nextVersion = (saveVersionsRef.current.get(submissionId) || 0) + 1;
    saveVersionsRef.current.set(submissionId, nextVersion);
    setAutoSaveState(submissionId, { status: "saving" });

    try {
      await updateLabSubmissionStatus(submissionId, {
        status: isEmpty ? "submitted" : "checked",
        awardedMarks: isEmpty ? "" : numericMarks,
      });

      if (saveVersionsRef.current.get(submissionId) !== nextVersion) return;

      setSelectedData((previous) => {
        if (!previous) return previous;

        return {
          ...previous,
          submissions: previous.submissions.map((row) =>
            row.id === submissionId
              ? {
                  ...row,
                  awardedMarks: numericMarks,
                  draftMarks: isEmpty ? "" : String(numericMarks),
                  status: isEmpty ? "submitted" : "checked",
                }
              : row
          ),
        };
      });

      setAutoSaveState(submissionId, { status: "saved" });

      const timer = setTimeout(() => {
        setAutoSaveStates((previous) => ({
          ...previous,
          [submissionId]: { status: "idle" },
        }));
        savedStateTimersRef.current.delete(submissionId);
      }, 1800);

      savedStateTimersRef.current.set(submissionId, timer);
    } catch (err) {
      console.error(err);

      if (saveVersionsRef.current.get(submissionId) !== nextVersion) return;

      setAutoSaveState(submissionId, {
        status: "error",
        message: err?.response?.data?.message || "Could not save marks.",
      });
    }
  };

  const scheduleMarksAutoSave = (submissionId, value) => {
    updateDraftMarks(submissionId, value);
    clearSubmissionTimers(submissionId);
    setAutoSaveState(submissionId, { status: "waiting" });

    const timer = setTimeout(() => {
      autoSaveTimersRef.current.delete(submissionId);
      persistMarks(submissionId, value);
    }, AUTO_SAVE_DELAY);

    autoSaveTimersRef.current.set(submissionId, timer);
  };

  const handleMarksBlur = (submissionId, value) => {
    const timer = autoSaveTimersRef.current.get(submissionId);
    if (!timer) return;

    clearTimeout(timer);
    autoSaveTimersRef.current.delete(submissionId);
    persistMarks(submissionId, value);
  };

  const handleDeleteSubmission = async (row) => {
    const result = await Swal.fire({
      title: "Delete submitted file?",
      text: `${row.studentName}'s file “${row.originalFileName}” will be permanently removed. The student may submit again while the task is open.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete File",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    clearSubmissionTimers(row.id);
    setActionLoading(`delete-submission-${row.id}`);

    try {
      await deleteTeacherLabSubmission(row.id);

      setSelectedData((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          submissions: previous.submissions.filter((item) => item.id !== row.id),
        };
      });

      setAutoSaveStates((previous) => {
        const next = { ...previous };
        delete next[row.id];
        return next;
      });

      await loadAssessments(selectedId);
      await Swal.fire("Deleted", "Student submission deleted successfully.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not delete the submission.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleSyncAllMarks = async () => {
    if (!selectedId) return;

    setActionLoading(`sync-all-${selectedId}`);

    try {
      const response = await syncAllSubmissionMarks(courseId, selectedId);
      await Swal.fire(
        "Synced",
        response?.message || "All saved marks synced successfully.",
        "success"
      );
      await loadSelectedSubmissions(selectedId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not sync all marks.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const updateSyncDraft = (assessmentId, patch) => {
    setSyncDrafts((previous) => ({
      ...previous,
      [assessmentId]: {
        targetAssessmentId:
          previous[assessmentId]?.targetAssessmentId || "",
        targetComponentKey:
          previous[assessmentId]?.targetComponentKey || "",
        createRegularAssessment:
          previous[assessmentId]?.createRegularAssessment || false,
        regularAssessmentName:
          previous[assessmentId]?.regularAssessmentName || "Lab Assessment",
        ...patch,
      },
    }));
  };

  const handleSaveSyncMapping = async (sourceAssessment) => {
    const draft = syncDrafts[sourceAssessment.id] || {
      targetAssessmentId: "",
      targetComponentKey: "",
      createRegularAssessment: false,
      regularAssessmentName: deriveLabAssessmentName(sourceAssessment.name),
    };
    const current = sourceAssessment.mapping || {
      targetAssessmentId: "",
      targetComponentKey: "",
      targetType: "",
      isLegacy: false,
    };

    const isCreateRegular =
      draft.createRegularAssessment === true ||
      draft.targetAssessmentId === CREATE_REGULAR_TARGET;
    const actualTargetAssessmentId = isCreateRegular
      ? ""
      : draft.targetAssessmentId;
    const selectedTarget = syncConfig.targets.find(
      (target) => target.id === actualTargetAssessmentId
    );
    const targetComponentKey =
      selectedTarget?.kind === "structured" ? draft.targetComponentKey : "";

    if (isCreateRegular && !String(draft.regularAssessmentName || "").trim()) {
      Swal.fire(
        "Enter assessment name",
        "Give the new Lab Assessment a name before creating the mapping.",
        "warning"
      );
      return;
    }

    if (
      actualTargetAssessmentId &&
      selectedTarget?.kind === "structured" &&
      !targetComponentKey
    ) {
      Swal.fire(
        "Choose component",
        "Select the exact Lab Mid or Lab Final component for this submission.",
        "warning"
      );
      return;
    }

    const isChanging =
      isCreateRegular ||
      current.isLegacy === true ||
      current.targetAssessmentId !== actualTargetAssessmentId ||
      current.targetComponentKey !== targetComponentKey;

    if (!isChanging) {
      Swal.fire("No changes", "This mapping is already saved.", "info");
      return;
    }

    const hasNewDestination =
      isCreateRegular || !!actualTargetAssessmentId;

    if (current.targetAssessmentId || current.targetComponentKey) {
      const result = await Swal.fire({
        title: hasNewDestination
          ? "Change marks mapping?"
          : "Remove marks mapping?",
        text: hasNewDestination
          ? "Marks synchronized to the old destination will be removed, then existing marks will be synchronized to the new destination."
          : "Marks synchronized to the current destination will be removed from the marks table.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: hasNewDestination
          ? "Change Mapping"
          : "Remove Mapping",
        confirmButtonColor: hasNewDestination ? "#4f46e5" : "#dc2626",
      });
      if (!result.isConfirmed) return;
    }

    setSavingSyncId(sourceAssessment.id);

    try {
      const response = await updateTeacherMarksSyncConfiguration(
        courseId,
        sourceAssessment.id,
        {
          targetAssessmentId: actualTargetAssessmentId,
          targetComponentKey,
          createRegularAssessment: isCreateRegular,
          regularAssessmentName: String(
            draft.regularAssessmentName || ""
          ).trim(),
        }
      );
      await loadMarksSyncConfiguration();
      await loadAssessments(selectedId || null);
      await Swal.fire(
        "Saved",
        response?.message || "Marks sync mapping saved successfully.",
        "success"
      );
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not save marks sync mapping.",
        "error"
      );
    } finally {
      setSavingSyncId("");
    }
  };

  const toggleAllowedExtension = (extension) => {
    const cleanExtension = sanitizeExtension(extension);
    if (!cleanExtension) return;

    setForm((previous) => {
      const current = normalizeAllowedExtensions(
        previous.allowedExtensions,
        false
      );
      const exists = current.includes(cleanExtension);

      return {
        ...previous,
        allowedExtensions: exists
          ? current.filter((item) => item !== cleanExtension)
          : [...current, cleanExtension],
      };
    });
  };

  const toggleAllAllowedExtensions = () => {
    setForm((previous) => {
      const current = normalizeAllowedExtensions(
        previous.allowedExtensions,
        false
      );
      const selectable = Array.from(
        new Set([...DEFAULT_ALLOWED_EXTENSIONS, ...current])
      );
      const isAllSelected =
        selectable.length > 0 &&
        selectable.every((ext) => current.includes(ext));

      return {
        ...previous,
        allowedExtensions: isAllSelected ? [] : selectable,
      };
    });
  };

  const handleAddCustomExtension = () => {
    const extension = sanitizeExtension(form.customExtension);

    if (!extension) {
      Swal.fire(
        "Invalid file type",
        "Enter a valid extension such as c, java, cpp, py, js, html, or css without a dot or space.",
        "warning"
      );
      return;
    }

    setForm((previous) => {
      const current = normalizeAllowedExtensions(
        previous.allowedExtensions,
        false
      );

      return {
        ...previous,
        allowedExtensions: current.includes(extension)
          ? current
          : [...current, extension],
        customExtension: "",
      };
    });
  };


  const toggleEligibleStudent = (studentId) => {
    const id = String(studentId || "");
    if (!id) return;

    setForm((previous) => {
      const current = Array.isArray(previous.eligibleStudentIds)
        ? previous.eligibleStudentIds.map(String)
        : [];
      return {
        ...previous,
        eligibleStudentIds: current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      };
    });
  };

  const selectAllEligibleStudents = () => {
    setForm((previous) => ({
      ...previous,
      eligibleStudentIds: (Array.isArray(courseStudents) ? courseStudents : [])
        .map((student) => String(student?.id || ""))
        .filter(Boolean),
    }));
  };

  const clearEligibleStudents = () => {
    setForm((previous) => ({ ...previous, eligibleStudentIds: [] }));
  };

  const isDeadlinePassed = !!selectedAssessment?.dueDatePassed;
  const submissionToggleAction = selectedAssessment?.submissionsOpen
    ? "close"
    : "open";

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl sm:p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            const count =
              tab.id === "submissions"
                ? items.reduce(
                    (total, item) => total + Number(item.submissionCount || 0),
                    0
                  )
                : tab.id === "create"
                  ? items.length
                  : tab.id === "sync"
                    ? syncConfig.submissions.filter(
                        (item) => item?.mapping?.targetAssessmentId
                      ).length
                    : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition sm:px-4 ${
                  isActive
                    ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                    : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isActive
                      ? "bg-white/15"
                      : "bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300"
                  }`}
                >
                  {tab.id === "create" ? (
                    <PlusIcon />
                  ) : tab.id === "public" ? (
                    <LinkIcon />
                  ) : tab.id === "sync" ? (
                    <SyncIcon />
                  ) : (
                    <FolderIcon />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold sm:text-base">
                      {tab.label}
                    </span>
                    {count !== null ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          isActive
                            ? "bg-white/15 text-white"
                            : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`mt-0.5 hidden truncate text-xs sm:block ${
                      isActive
                        ? "text-indigo-100"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {tab.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "create" ? (
        <form
          onSubmit={handleCreateOrUpdate}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl sm:p-5"
        >
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                {editingId ? "Editing Assessment" : "New Assessment"}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
                {editingId
                  ? "Edit File Submission Assessment"
                  : "Create File Submission Assessment"}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Keep creation settings separate from the student file review area.
              </p>
            </div>

            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Assessment Title">
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                className="field-input"
                placeholder="Example: Lab Assessment Submission"
                required
              />
            </Field>

            <Field label="Full Marks">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.fullMarks}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    fullMarks: event.target.value,
                  }))
                }
                className="field-input"
                placeholder="Example: 10"
                required
              />
            </Field>

            <Field
              label="Maximum File Size"
              help={`Choose 1–${MAX_SUBMISSION_FILE_SIZE_MB} MB. Supabase Storage must also be configured with an equal or higher bucket limit.`}
            >
              <input
                type="number"
                min="1"
                max={MAX_SUBMISSION_FILE_SIZE_MB}
                step="1"
                value={form.maxFileSizeMB}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    maxFileSizeMB: event.target.value,
                  }))
                }
                className="field-input"
                placeholder="Example: 10"
              />
            </Field>

            <Field
              label="Resource Button Text"
              help="This text will be shown as a button on the student side."
            >
              <input
                type="text"
                value={form.resourceTitle}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    resourceTitle: event.target.value,
                  }))
                }
                className="field-input"
                placeholder="Example: View Resource"
              />
            </Field>

            <Field
              label="Resource Link"
              help="Paste a Google Drive, PDF, instruction, or reference link."
            >
              <input
                type="url"
                value={form.resourceUrl}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    resourceUrl: event.target.value,
                  }))
                }
                className="field-input"
                placeholder="Example: Google Drive PDF link"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Deadline Date">
                <button
                  type="button"
                  onClick={() => {
                    if (dateInputRef.current?.showPicker) {
                      dateInputRef.current.showPicker();
                    } else {
                      dateInputRef.current?.focus();
                    }
                  }}
                  className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-900 transition hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={form.dueDate}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        dueDate: event.target.value,
                      }))
                    }
                    className="absolute inset-0 opacity-0"
                  />
                  <span className="flex items-center justify-between gap-2">
                    <span>{form.dueDate || "Pick date"}</span>
                    <CalendarIcon />
                  </span>
                </button>
              </Field>

              <Field label="Deadline Time">
                <button
                  type="button"
                  onClick={() => {
                    if (timeInputRef.current?.showPicker) {
                      timeInputRef.current.showPicker();
                    } else {
                      timeInputRef.current?.focus();
                    }
                  }}
                  className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-900 transition hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <input
                    ref={timeInputRef}
                    type="time"
                    value={form.dueTime}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        dueTime: event.target.value,
                      }))
                    }
                    className="absolute inset-0 opacity-0"
                  />
                  <span className="flex items-center justify-between gap-2">
                    <span>{form.dueTime || "Pick time"}</span>
                    <ClockIcon />
                  </span>
                </button>
              </Field>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(260px,0.65fr)_minmax(0,1.35fr)]">
            <label className="flex min-h-[120px] cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.allowResubmission}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    allowResubmission: event.target.checked,
                  }))
                }
              />
              <span>
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Resubmission Permission
                </span>
                <span className="mt-1 block font-semibold">
                  Allow students to replace files
                </span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  Replacement remains available until the deadline while submission is open.
                </span>
              </span>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Allowed File Types
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Select accepted submission formats
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleAllAllowedExtensions}
                  className="w-fit rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {allAllowedSelected ? "Unselect all" : "Select all"}
                </button>
              </div>

              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible">
                {FILE_TYPE_OPTIONS.map((option) => {
                  const checked = selectedAllowedExtensions.includes(option.value);

                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        checked
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAllowedExtension(option.value)}
                      />
                      {option.label}
                    </label>
                  );
                })}

                {customSelectedExtensions.map((extension) => (
                  <label
                    key={extension}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                  >
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggleAllowedExtension(extension)}
                    />
                    {extension.toUpperCase()}
                  </label>
                ))}
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={form.customExtension}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      customExtension: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddCustomExtension();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="Add custom type: c, java, cpp"
                />
                <button
                  type="button"
                  onClick={handleAddCustomExtension}
                  className="rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                >
                  Add Type
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Submission Audience
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Choose who is allowed to submit this assessment
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  All students is selected by default. Choose selected students only when this task is for a specific group.
                </p>
              </div>

              {form.eligibilityMode === "selected" ? (
                <span className="w-fit rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                  {selectedStudentCount} selected
                </span>
              ) : null}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setForm((previous) => ({
                    ...previous,
                    eligibilityMode: "all",
                    studentSearch: "",
                  }))
                }
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  form.eligibilityMode !== "selected"
                    ? "border-indigo-300 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                    : "border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <span className="block text-sm font-bold text-slate-900 dark:text-white">All Students</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Every enrolled student can submit.</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setForm((previous) => ({
                    ...previous,
                    eligibilityMode: "selected",
                  }))
                }
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  form.eligibilityMode === "selected"
                    ? "border-indigo-300 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                    : "border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <span className="block text-sm font-bold text-slate-900 dark:text-white">Selected Students</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Only manually chosen students can submit.</span>
              </button>
            </div>

            {form.eligibilityMode === "selected" ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    type="text"
                    value={form.studentSearch}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        studentSearch: event.target.value,
                      }))
                    }
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    placeholder="Search by roll or student name"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllEligibleStudents}
                      disabled={!courseStudents.length}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearEligibleStudents}
                      disabled={!selectedStudentCount}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {loadingCourseStudents ? (
                  <div className="py-5 text-center text-sm text-slate-500 dark:text-slate-400">Loading students...</div>
                ) : !courseStudents.length ? (
                  <div className="py-5 text-center text-sm text-slate-500 dark:text-slate-400">No enrolled students found in this course.</div>
                ) : !filteredCourseStudents.length ? (
                  <div className="py-5 text-center text-sm text-slate-500 dark:text-slate-400">No students match this search.</div>
                ) : (
                  <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    {filteredCourseStudents.map((student) => {
                      const studentId = String(student?.id || "");
                      const checked = form.eligibleStudentIds.includes(studentId);
                      return (
                        <label
                          key={studentId || student?.enrollmentId}
                          className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEligibleStudent(studentId)}
                            className="h-4 w-4 accent-indigo-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {student?.name || "Student"}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">Roll: {student?.roll || "—"}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-4">
            <Field label="Instructions for Students">
              <textarea
                value={form.instructions}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    instructions: event.target.value,
                  }))
                }
                rows={4}
                className="field-input resize-y"
                placeholder="Example: Upload your lab report before the deadline. Use your ID and name in the file name."
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:flex-wrap">
            <button
              type="submit"
              disabled={savingForm}
              className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingForm
                ? editingId
                  ? "Updating…"
                  : "Creating…"
                : editingId
                  ? "Update Submission Assessment"
                  : "Create Submission Assessment"}
            </button>

            {editingId ? (
              <button
                type="button"
                onClick={() => handleDeleteAssessment(editingId, form.name)}
                disabled={
                  actionLoading === `delete-assessment-${editingId}`
                }
                className="inline-flex items-center justify-center rounded-2xl border border-rose-300 bg-white px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                Delete This Assessment
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {activeTab === "public" ? (
        <TeacherPublicSubmissionLinkPanel
          courseId={courseId}
          assessments={items}
        />
      ) : null}

      {activeTab === "sync" ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl">
          <div className="border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                  Submission Mapping
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
                  Marks Sync
                </h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Connect each file-submission assessment to an existing Lab Assessment, a Structured Lab Mid/Final component, or create a new Lab Assessment directly from here. Publishing is not required.
                </p>
              </div>

              <button
                type="button"
                onClick={loadMarksSyncConfiguration}
                disabled={loadingSyncConfig}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <SyncIcon /> Refresh
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {loadingSyncConfig ? (
              <EmptyState
                title="Loading marks sync"
                text="Please wait while submission and assessment destinations are loaded."
              />
            ) : syncConfig.submissions.length === 0 ? (
              <EmptyState
                title="No submission assessment"
                text="Create a file-submission assessment first. It does not need to be published before mapping."
              />
            ) : (
              <div className="space-y-4">
                {syncConfig.submissions.map((sourceAssessment) => {
                  const draft = syncDrafts[sourceAssessment.id] || {
                    targetAssessmentId: "",
                    targetComponentKey: "",
                    createRegularAssessment: false,
                    regularAssessmentName: deriveLabAssessmentName(
                      sourceAssessment.name
                    ),
                  };
                  const isCreateRegular =
                    draft.createRegularAssessment === true ||
                    draft.targetAssessmentId === CREATE_REGULAR_TARGET;
                  const selectedTarget = syncConfig.targets.find(
                    (target) => target.id === draft.targetAssessmentId
                  );
                  const compatibleComponents = (
                    selectedTarget?.components || []
                  ).filter(
                    (component) =>
                      Number(component.marks || 0) ===
                        Number(sourceAssessment.fullMarks || 0) &&
                      (!component.mappedSubmissionAssessmentId ||
                        component.mappedSubmissionAssessmentId ===
                          sourceAssessment.id)
                  );
                  const savedMapping = sourceAssessment.mapping || {};
                  const isMapped = !!savedMapping.targetAssessmentId;
                  const regularTargets = syncConfig.targets.filter(
                    (target) => target.kind === "regular"
                  );
                  const structuredTargets = syncConfig.targets.filter(
                    (target) => target.kind === "structured"
                  );

                  return (
                    <article
                      key={sourceAssessment.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:p-5"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="break-words text-base font-bold text-slate-900 dark:text-white">
                              {sourceAssessment.name}
                            </h4>
                            <Badge tone={isMapped ? "emerald" : "amber"}>
                              {isMapped ? "Mapped" : "Not Mapped"}
                            </Badge>
                            <Badge tone="slate">
                              {sourceAssessment.fullMarks || 0} marks
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            Choose a normal Lab Assessment for direct marks, or a
                            matching Structured Lab Mid/Final component.
                          </p>
                        </div>

                        <div className="grid min-w-0 flex-[1.7] gap-3 md:grid-cols-2 xl:grid-cols-[minmax(250px,1fr)_minmax(260px,1fr)_auto]">
                          <Field label="Target Assessment">
                            <select
                              value={draft.targetAssessmentId}
                              onChange={(event) => {
                                const value = event.target.value;
                                const createNew =
                                  value === CREATE_REGULAR_TARGET;
                                updateSyncDraft(sourceAssessment.id, {
                                  targetAssessmentId: value,
                                  targetComponentKey: "",
                                  createRegularAssessment: createNew,
                                  regularAssessmentName: createNew
                                    ? draft.regularAssessmentName ||
                                      deriveLabAssessmentName(
                                        sourceAssessment.name
                                      )
                                    : draft.regularAssessmentName,
                                });
                              }}
                              className="field-input"
                            >
                              <option value="">No mapping</option>

                              {regularTargets.length ? (
                                <optgroup label="Existing Lab Assessments">
                                  {regularTargets.map((target) => {
                                    const marksMismatch =
                                      Number(target.fullMarks || 0) !==
                                      Number(sourceAssessment.fullMarks || 0);
                                    const usedByAnother = !!(
                                      target.mappedSubmissionAssessmentId &&
                                      target.mappedSubmissionAssessmentId !==
                                        sourceAssessment.id
                                    );

                                    return (
                                      <option
                                        key={target.id}
                                        value={target.id}
                                        disabled={marksMismatch || usedByAnother}
                                      >
                                        Lab Assessment — {target.name} (
                                        {target.fullMarks} marks)
                                        {marksMismatch
                                          ? " — marks mismatch"
                                          : usedByAnother
                                            ? " — already mapped"
                                            : ""}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              ) : null}

                              <option value={CREATE_REGULAR_TARGET}>
                                ＋ Create new Lab Assessment
                              </option>

                              {structuredTargets.length ? (
                                <optgroup label="Structured Lab Mid / Final">
                                  {structuredTargets.map((target) => (
                                    <option key={target.id} value={target.id}>
                                      {target.period === "mid"
                                        ? "Structured Lab Mid"
                                        : "Structured Lab Final"}{" "}
                                      — {target.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                            </select>
                          </Field>

                          {isCreateRegular ? (
                            <Field label="New Lab Assessment Name">
                              <input
                                type="text"
                                value={draft.regularAssessmentName}
                                onChange={(event) =>
                                  updateSyncDraft(sourceAssessment.id, {
                                    regularAssessmentName: event.target.value,
                                  })
                                }
                                placeholder="Example: Lab Task-03"
                                className="field-input"
                              />
                            </Field>
                          ) : selectedTarget?.kind === "structured" ? (
                            <Field label="Target Component">
                              <select
                                value={draft.targetComponentKey}
                                onChange={(event) =>
                                  updateSyncDraft(sourceAssessment.id, {
                                    targetComponentKey: event.target.value,
                                  })
                                }
                                className="field-input"
                              >
                                <option value="">Select matching component</option>
                                {compatibleComponents.map((component) => (
                                  <option
                                    key={component.key}
                                    value={component.key}
                                  >
                                    {component.name} ({component.marks} marks)
                                  </option>
                                ))}
                              </select>
                            </Field>
                          ) : (
                            <Field label="Target Component">
                              <input
                                type="text"
                                value={
                                  selectedTarget?.kind === "regular"
                                    ? "Direct marks — no component required"
                                    : "Choose an assessment first"
                                }
                                readOnly
                                disabled
                                className="field-input disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            </Field>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              handleSaveSyncMapping(sourceAssessment)
                            }
                            disabled={savingSyncId === sourceAssessment.id}
                            className="inline-flex min-h-[46px] items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2 xl:col-span-1"
                          >
                            {savingSyncId === sourceAssessment.id
                              ? "Saving…"
                              : isCreateRegular
                                ? "Create & Sync"
                                : draft.targetAssessmentId
                                  ? "Save Mapping"
                                  : isMapped
                                    ? "Remove Mapping"
                                    : "Keep Unmapped"}
                          </button>
                        </div>
                      </div>

                      {selectedTarget?.kind === "structured" &&
                      compatibleComponents.length === 0 ? (
                        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                          No unused component with exactly{" "}
                          {sourceAssessment.fullMarks || 0} marks is available in
                          the selected structured assessment.
                        </p>
                      ) : null}

                      {isCreateRegular ? (
                        <p className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                          Saving will create this Lab Assessment in the
                          Assessments tab with {sourceAssessment.fullMarks || 0}{" "}
                          full marks, then synchronize all marks already entered
                          for this submission.
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "submissions" ? (
        <div
          className={`grid min-w-0 gap-4 transition-all sm:gap-5 ${
            sidebarOpen
              ? "xl:grid-cols-[300px_minmax(0,1fr)]"
              : "xl:grid-cols-[72px_minmax(0,1fr)]"
          }`}
        >
          <aside
            className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl ${
              sidebarOpen ? "p-3 sm:p-4" : "p-2"
            }`}
          >
            <div
              className={`flex items-center gap-2 ${
                sidebarOpen ? "justify-between" : "justify-center"
              }`}
            >
              {sidebarOpen ? (
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">
                    Assessments
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {items.length} created
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setSidebarOpen((previous) => !previous)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                title={sidebarOpen ? "Hide assessments" : "Show assessments"}
                aria-label={sidebarOpen ? "Hide assessments" : "Show assessments"}
              >
                <ChevronIcon direction={sidebarOpen ? "left" : "right"} />
              </button>
            </div>

            {sidebarOpen ? (
              <div className="mt-4">
                {loading ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    Loading assessments…
                  </div>
                ) : items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    No assessment created yet.
                    <button
                      type="button"
                      onClick={() => setActiveTab("create")}
                      className="mt-3 block font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300"
                    >
                      Create the first assessment
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:max-h-[calc(100vh-270px)] xl:grid-cols-1 xl:overflow-y-auto xl:pr-1">
                    {items.map((item) => {
                      const isSelected = item.id === selectedId;
                      const statusMeta = getSubmissionStatusMeta(item);

                      return (
                        <article
                          key={item.id}
                          className={`min-w-0 rounded-2xl border p-3 transition ${
                            isSelected
                              ? "border-indigo-500 bg-indigo-50 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/10"
                              : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className="w-full min-w-0 text-left"
                          >
                            <div className="break-words text-sm font-bold leading-snug text-slate-900 dark:text-white">
                              {item.name}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge
                                tone={
                                  item.isVisibleToStudents ? "emerald" : "amber"
                                }
                              >
                                {item.isVisibleToStudents
                                  ? "Published"
                                  : "Unpublished"}
                              </Badge>
                              <Badge tone={statusMeta.tone}>
                                {statusMeta.label}
                              </Badge>
                            </div>

                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              {item.submissionCount || 0} file(s) · {item.fullMarks || 0} marks
                            </div>
                          </button>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteAssessment(item.id, item.name)
                              }
                              disabled={
                                actionLoading ===
                                `delete-assessment-${item.id}`
                              }
                              className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="mt-3 flex w-full flex-col items-center gap-2 rounded-xl bg-slate-50 px-1 py-4 text-center text-[11px] font-bold text-slate-500 transition hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-indigo-300"
              >
                <FolderIcon />
                <span className="hidden xl:block [writing-mode:vertical-rl]">
                  Assessments
                </span>
                <span className="xl:hidden">Show Assessments</span>
              </button>
            )}
          </aside>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl">
            <div className="border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
              <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
                      Student Submissions
                    </h3>
                    {selectedAssessment ? (
                      <Badge tone="indigo">
                        {selectedAssessment.submissionCount || 0} file(s)
                      </Badge>
                    ) : null}
                  </div>

                  {selectedAssessment ? (
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2 sm:text-sm xl:grid-cols-4">
                      <InfoPill label="Assessment" value={selectedAssessment.name} />
                      <InfoPill
                        label="Deadline"
                        value={formatDateTime(selectedAssessment.dueDate)}
                      />
                      <InfoPill
                        label="Full Marks"
                        value={String(selectedAssessment.fullMarks || 0)}
                      />
                      <InfoPill
                        label="File Types"
                        value={formatAllowedExtensions(
                          selectedAssessment.allowedExtensions
                        )}
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Select an assessment to review submitted files.
                    </p>
                  )}

                  {selectedAssessment ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          selectedAssessment.isVisibleToStudents
                            ? "emerald"
                            : "amber"
                        }
                      >
                        {selectedAssessment.isVisibleToStudents
                          ? "Published"
                          : "Unpublished"}
                      </Badge>
                      <Badge tone={selectedStatusMeta.tone}>
                        {selectedStatusMeta.label}
                      </Badge>

                      {selectedAssessment.resourceUrl ? (
                        <a
                          href={getPublicFileUrl(
                            selectedAssessment.resourceUrl
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                        >
                          <LinkIcon />
                          <span className="truncate">
                            {selectedAssessment.resourceTitle || "View Resource"}
                          </span>
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedAssessment?.dueDatePassed ? (
                    <p className="mt-3 max-w-3xl text-xs font-medium leading-5 text-rose-600 dark:text-rose-300">
                      This task is automatically closed because its deadline has passed. Edit the deadline before reopening it.
                    </p>
                  ) : null}
                </div>

                {selectedAssessment ? (
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:w-auto xl:max-w-[560px] xl:justify-end">
                    <select
                      value={submissionSortBy}
                      onChange={(event) =>
                        setSubmissionSortBy(event.target.value)
                      }
                      className="col-span-2 min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:col-span-1"
                    >
                      <option value="roll-asc">Roll: Ascending</option>
                      <option value="roll-desc">Roll: Descending</option>
                      <option value="time-newest">Newest Submitted</option>
                      <option value="time-oldest">Oldest Submitted</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        handleAssessmentAction(
                          selectedAssessment.id,
                          selectedAssessment.isVisibleToStudents
                            ? "unpublish"
                            : "publish"
                        )
                      }
                      disabled={
                        actionLoading ===
                        `${selectedAssessment.id}-${
                          selectedAssessment.isVisibleToStudents
                            ? "unpublish"
                            : "publish"
                        }`
                      }
                      className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60 sm:text-sm"
                    >
                      {selectedAssessment.isVisibleToStudents
                        ? "Unpublish"
                        : "Publish"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleAssessmentAction(
                          selectedAssessment.id,
                          submissionToggleAction
                        )
                      }
                      disabled={
                        isDeadlinePassed ||
                        actionLoading ===
                          `${selectedAssessment.id}-${submissionToggleAction}`
                      }
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
                    >
                      {isDeadlinePassed
                        ? "Deadline Passed"
                        : selectedAssessment.submissionsOpen
                          ? "Close Uploads"
                          : "Open Uploads"}
                    </button>

                    <button
                      type="button"
                      onClick={handleSyncAllMarks}
                      disabled={
                        !selectedAssessment?.markSync?.isConfigured ||
                        actionLoading === `sync-all-${selectedAssessment.id}`
                      }
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 sm:text-sm"
                    >
                      Re-sync Marks
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadAll}
                      disabled={
                        actionLoading === `download-${selectedAssessment.id}`
                      }
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm"
                    >
                      Download All
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="p-3 sm:p-5">
              {!selectedId ? (
                <EmptyState
                  title="No assessment selected"
                  text="Choose an assessment from the left panel to view student files."
                />
              ) : loadingSubmissions ? (
                <EmptyState
                  title="Loading submissions"
                  text="Please wait while the student files are loaded."
                />
              ) : !sortedSubmissions.length ? (
                <EmptyState
                  title="No files submitted yet"
                  text="Student submissions will appear here as soon as files are uploaded."
                />
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {sortedSubmissions.map((row) => (
                      <article
                        key={row.id}
                        className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/70 sm:p-4"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-sm font-bold leading-snug text-slate-900 dark:text-white">
                              {row.studentName}
                            </div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              Roll: {row.roll}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5">
                            {row.isPublicSubmission || row.source === "public-link" ? (
                              <Badge tone="emerald">Public Link</Badge>
                            ) : null}
                            {row?.integrity?.exactDuplicate ? (
                              <Badge tone="rose">Exact Duplicate</Badge>
                            ) : row?.integrity?.sameContent ? (
                              <Badge tone="amber">Matching Content</Badge>
                            ) : null}
                          </div>
                        </div>

                        {row?.integrity?.matches?.length ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                            <div className="font-bold">Potential copied/duplicate submission</div>
                            <div className="mt-1">
                              Matches: {Array.from(new Set(row.integrity.matches.map((item) => item.roll))).join(", ")}
                            </div>
                            <div className="mt-1 text-[11px] opacity-80">
                              This is a review flag only. Confirm the files before applying any penalty.
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <div className="break-words text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                            {row.originalFileName}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {formatFileSize(row.fileSize)} · {formatDateTime(row.submittedAt)}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handlePreviewFile(row)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                            >
                              <EyeIcon /> View
                            </button>
                            <a
                              href={getPublicFileUrl(row.downloadUrl)}
                              download
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <DownloadIcon /> Download
                            </a>
                          </div>
                        </div>

                        <div className="mt-3">
                          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Marks / {selectedAssessment?.fullMarks || 0}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={selectedAssessment?.fullMarks || 0}
                            value={row.draftMarks}
                            onChange={(event) =>
                              scheduleMarksAutoSave(row.id, event.target.value)
                            }
                            onBlur={(event) =>
                              handleMarksBlur(row.id, event.target.value)
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="Enter marks"
                          />
                          <div className="mt-1.5 min-h-[17px]">
                            <AutoSaveIndicator state={autoSaveStates[row.id]} />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteSubmission(row)}
                          disabled={
                            actionLoading === `delete-submission-${row.id}`
                          }
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <TrashIcon /> Delete Submission
                        </button>
                      </article>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full table-fixed text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          <th className="w-[19%] px-3 py-3">Student</th>
                          <th className="w-[28%] px-3 py-3">File</th>
                          <th className="w-[18%] px-3 py-3">Submitted</th>
                          <th className="w-[25%] px-3 py-3">Marks</th>
                          <th className="w-[10%] px-3 py-3 text-center">Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSubmissions.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-slate-100 align-top transition hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/30"
                          >
                            <td className="px-3 py-4">
                              <div className="break-words font-semibold text-slate-900 dark:text-white">
                                {row.studentName}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {row.roll}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {row.isPublicSubmission || row.source === "public-link" ? (
                                  <Badge tone="emerald">Public Link</Badge>
                                ) : null}
                                {row?.integrity?.exactDuplicate ? (
                                  <Badge tone="rose">Exact Duplicate</Badge>
                                ) : row?.integrity?.sameContent ? (
                                  <Badge tone="amber">Matching Content</Badge>
                                ) : null}
                              </div>
                              {row?.integrity?.matches?.length ? (
                                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                                  Matches: {Array.from(new Set(row.integrity.matches.map((item) => item.roll))).join(", ")}
                                </div>
                              ) : null}
                            </td>

                            <td className="px-3 py-4">
                              <div className="min-w-0">
                                <div
                                  className="truncate font-medium text-slate-900 dark:text-white"
                                  title={row.originalFileName}
                                >
                                  {row.originalFileName}
                                </div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {formatFileSize(row.fileSize)}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewFile(row)}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                                  >
                                    <EyeIcon /> View
                                  </button>
                                  <a
                                    href={getPublicFileUrl(row.downloadUrl)}
                                    download
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                  >
                                    <DownloadIcon /> Download
                                  </a>
                                </div>
                              </div>
                            </td>

                            <td className="px-3 py-4 text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {formatDateTime(row.submittedAt)}
                            </td>

                            <td className="px-3 py-4">
                              <div className="min-w-[150px] max-w-[220px]">
                                <div className="relative">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    max={selectedAssessment?.fullMarks || 0}
                                    value={row.draftMarks}
                                    onChange={(event) =>
                                      scheduleMarksAutoSave(
                                        row.id,
                                        event.target.value
                                      )
                                    }
                                    onBlur={(event) =>
                                      handleMarksBlur(row.id, event.target.value)
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-14 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                    placeholder="Enter marks"
                                  />
                                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-400">
                                    / {selectedAssessment?.fullMarks || 0}
                                  </span>
                                </div>
                                <div className="mt-1.5 min-h-[17px]">
                                  <AutoSaveIndicator
                                    state={autoSaveStates[row.id]}
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="px-3 py-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteSubmission(row)}
                                disabled={
                                  actionLoading ===
                                  `delete-submission-${row.id}`
                                }
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-300 bg-white text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                title="Delete this student submission"
                                aria-label={`Delete submission of ${row.studentName}`}
                              >
                                <TrashIcon />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {previewFile ? (
        <FilePreviewModal
          file={previewFile}
          text={previewText}
          loading={previewLoading}
          error={previewError}
          onClose={closeFilePreview}
        />
      ) : null}
    </div>
  );
}

function FilePreviewModal({ file, text, loading, error, onClose }) {
  const fileUrl = getPublicFileUrl(file?.downloadUrl);
  const previewType = file?.previewType || getPreviewType(file);
  const officeViewerUrl =
    previewType === "office" ? buildOfficeViewerUrl(fileUrl) : "";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file?.originalFileName || "submitted file"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-3xl">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white sm:text-base" title={file?.originalFileName}>
              {file?.originalFileName || "File preview"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{formatFileSize(file?.fileSize)}</span>
              <span>•</span>
              <span>{getFileExtension(file?.originalFileName).toUpperCase() || "FILE"}</span>
              {previewType === "office" ? (
                <>
                  <span>•</span>
                  <span>Microsoft Office Online preview</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-800"
            >
              <ExternalLinkIcon /> Open in new tab
            </a>
            <a
              href={fileUrl}
              download
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-800"
            >
              <DownloadIcon /> Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
              aria-label="Close preview"
              title="Close preview"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-slate-900">
          {previewType === "pdf" ? (
            <iframe
              title={file?.originalFileName || "PDF preview"}
              src={fileUrl}
              className="h-full w-full border-0 bg-white"
            />
          ) : null}

          {previewType === "office" ? (
            <iframe
              title={file?.originalFileName || "Office file preview"}
              src={officeViewerUrl}
              className="h-full w-full border-0 bg-white"
              allowFullScreen
            />
          ) : null}

          {previewType === "image" ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4 sm:p-8">
              <img
                src={fileUrl}
                alt={file?.originalFileName || "Submitted file"}
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>
          ) : null}

          {previewType === "text" ? (
            <div className="h-full overflow-auto p-4 sm:p-6">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-300">
                  <span className="inline-flex items-center gap-2"><SpinnerIcon /> Loading preview…</span>
                </div>
              ) : error ? (
                <PreviewUnavailable message={error} />
              ) : (
                <pre className="min-h-full whitespace-pre-wrap break-words rounded-2xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 sm:p-5 sm:text-sm">
                  {text || "This file is empty."}
                </pre>
              )}
            </div>
          ) : null}

          {previewType === "unsupported" ? (
            <PreviewUnavailable message="This file type cannot be previewed safely inside the portal. Open it in a compatible application or download it." />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreviewUnavailable({ message }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-6 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-300">
          <FolderIcon />
        </div>
        <div className="mt-4 text-base font-bold text-white">Preview unavailable</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
      </div>
    </div>
  );
}

function Field({ label, help, children }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </label>
      {children}
      {help ? (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {help}
        </p>
      ) : null}
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 truncate font-semibold text-slate-700 dark:text-slate-200" title={value}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-800/60">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm dark:bg-slate-900 dark:text-slate-500">
        <FolderIcon />
      </div>
      <div className="mt-3 font-semibold text-slate-800 dark:text-slate-200">
        {title}
      </div>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
        {text}
      </p>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6m3 0V4h8v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ChevronIcon({ direction = "left" }) {
  const points = direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6";
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points={points} />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
