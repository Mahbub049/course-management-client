import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { fetchTeacherCourses } from "../services/courseService";
import {
  createNotebookNote,
  deleteNotebookNote,
  fetchNotebookNoteById,
  fetchNotebookNotes,
  updateNotebookNote,
  refreshNotebookStudents,
  fetchNotebookMarkSync,
  saveNotebookMarkSync,
  syncNotebookMarks,
} from "../services/notebookService";
import GroupPresentationEditor from "../components/notebook/GroupPresentationEditor";

const TYPE_LABELS = {
  evaluation: "Evaluation Sheet",
  simple: "Simple Note",
};

const DEFAULT_MCQ_FIELD = { id: "mcq_1", label: "Marking Category", options: ["High", "Medium", "Low"], entryMode: "group" };
const DEFAULT_BLANK_FIELD = { id: "blank_1", label: "Marks", entryMode: "group" };
const DEFAULT_CHECKBOX_FIELD = { id: "checkbox_1", label: "Completed", entryMode: "group" };

const DEFAULT_SETTINGS = {
  groupWise: false,
  groupMarkMode: "group", // legacy default used when old group sheets have no per-field scope
  feedbackEntryMode: "group",
  includeRoll: true,
  includeName: true,
  includeFeedback: true,
  includeMcq: true,
  includeCheckbox: false,
  includeBlankFields: false,
  includeTotal: false,
  columnOrder: [],
  mcqLabel: DEFAULT_MCQ_FIELD.label,
  mcqOptions: DEFAULT_MCQ_FIELD.options,
  mcqFields: [DEFAULT_MCQ_FIELD],
  checkboxFields: [DEFAULT_CHECKBOX_FIELD],
  blankFields: [DEFAULT_BLANK_FIELD],
};

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const makeMcqField = (index = 1) => ({ id: makeId("mcq"), label: index === 1 ? "Marking Category" : `Category ${index}`, options: ["High", "Medium", "Low"], entryMode: "group" });
const makeBlankField = (index = 1) => ({ id: makeId("blank"), label: index === 1 ? "Marks" : `Blank Field ${index}`, entryMode: "group" });
const makeCheckboxField = (index = 1) => ({ id: makeId("checkbox"), label: index === 1 ? "Completed" : `Checkbox ${index}`, entryMode: "group" });
const editableText = (value, fallback = "") => value === undefined || value === null ? fallback : String(value);
const displayText = (value, fallback = "") => String(value ?? "").trim() || fallback;
const cleanOptions = (options) => Array.isArray(options) && options.map((x) => String(x ?? "").trim()).filter(Boolean).length ? options.map((x) => String(x ?? "").trim()).filter(Boolean) : [...DEFAULT_MCQ_FIELD.options];

const normalizeEntryMode = (value, fallback = "group") =>
  String(value || fallback).toLowerCase() === "individual" ? "individual" : "group";

const normalizeMcqFields = (settings = {}) => {
  const legacyMode = normalizeEntryMode(settings.groupMarkMode, "group");
  const source = Array.isArray(settings.mcqFields) && settings.mcqFields.length
    ? settings.mcqFields
    : [{ id: "mcq_1", label: settings.mcqLabel || DEFAULT_MCQ_FIELD.label, options: settings.mcqOptions || DEFAULT_MCQ_FIELD.options, entryMode: legacyMode }];
  return source.map((field, index) => ({
    id: String(field?.id || `mcq_${index + 1}`),
    label: editableText(field?.label ?? field?.mcqLabel, `Category ${index + 1}`),
    options: Array.isArray(field?.options ?? field?.mcqOptions) ? (field?.options ?? field?.mcqOptions).map((x) => x == null ? "" : String(x)) : [...DEFAULT_MCQ_FIELD.options],
    entryMode: normalizeEntryMode(field?.entryMode, legacyMode),
  }));
};

const normalizeBlankFields = (settings = {}) => {
  const legacyMode = normalizeEntryMode(settings.groupMarkMode, "group");
  const source = Array.isArray(settings.blankFields) && settings.blankFields.length ? settings.blankFields : [{ ...DEFAULT_BLANK_FIELD, entryMode: legacyMode }];
  return source.map((field, index) => ({
    id: String(field?.id || `blank_${index + 1}`),
    label: editableText(field?.label, `Blank Field ${index + 1}`),
    entryMode: normalizeEntryMode(field?.entryMode, legacyMode),
  }));
};

const normalizeCheckboxFields = (settings = {}) => {
  const legacyMode = normalizeEntryMode(settings.groupMarkMode, "group");
  const source = Array.isArray(settings.checkboxFields) && settings.checkboxFields.length ? settings.checkboxFields : [{ ...DEFAULT_CHECKBOX_FIELD, entryMode: legacyMode }];
  return source.map((field, index) => ({
    id: String(field?.id || `checkbox_${index + 1}`),
    label: editableText(field?.label, `Checkbox ${index + 1}`),
    entryMode: normalizeEntryMode(field?.entryMode, legacyMode),
  }));
};

const normalizeSettings = (settings = {}) => {
  const mcqFields = normalizeMcqFields(settings);
  const blankFields = normalizeBlankFields(settings);
  const checkboxFields = normalizeCheckboxFields(settings);
  const firstMcq = mcqFields[0] || DEFAULT_MCQ_FIELD;
  const normalized = {
    groupWise: settings.groupWise === undefined ? false : Boolean(settings.groupWise),
    groupMarkMode: normalizeEntryMode(settings.groupMarkMode, "group"),
    feedbackEntryMode: normalizeEntryMode(settings.feedbackEntryMode, settings.groupMarkMode || "group"),
    includeRoll: settings.includeRoll === undefined ? true : Boolean(settings.includeRoll),
    includeName: settings.includeName === undefined ? true : Boolean(settings.includeName),
    includeFeedback: settings.includeFeedback === undefined ? true : Boolean(settings.includeFeedback),
    includeMcq: settings.includeMcq === undefined ? true : Boolean(settings.includeMcq),
    includeCheckbox: settings.includeCheckbox === undefined ? false : Boolean(settings.includeCheckbox),
    includeBlankFields: settings.includeBlankFields === undefined ? false : Boolean(settings.includeBlankFields),
    includeTotal: settings.includeTotal === undefined ? false : Boolean(settings.includeTotal),
    mcqLabel: firstMcq.label,
    mcqOptions: firstMcq.options,
    mcqFields,
    checkboxFields,
    blankFields,
  };
  return { ...normalized, columnOrder: normalizeColumnOrder(settings.columnOrder, normalized) };
};

const getRowMcqValue = (row, field, fieldIndex = 0) => row?.selectedOptions?.[field.id] !== undefined ? row.selectedOptions[field.id] || "" : fieldIndex === 0 ? row?.selectedOption || "" : "";
const getRowBlankValue = (row, field) => row?.blankValues?.[field.id] !== undefined ? row.blankValues[field.id] || "" : "";
const getRowCheckboxValue = (row, field) => Boolean(row?.checkboxValues?.[field.id]);
const calculateTotal = (row, fields = []) => {
  const values = fields.map((field) => String(getRowBlankValue(row, field) ?? "").trim()).filter(Boolean);
  if (!values.length) return { value: "", error: false };
  const nums = values.map(Number);
  if (nums.some(Number.isNaN)) return { value: "Please input number", error: true };
  const total = nums.reduce((sum, value) => sum + value, 0);
  return { value: Number.isInteger(total) ? String(total) : String(Number(total.toFixed(2))), error: false };
};

const COLUMN_IDS = { roll: "roll", name: "name", feedback: "feedback", total: "total" };
const blankColumnId = (field) => `blank:${field.id}`;
const mcqColumnId = (field) => `mcq:${field.id}`;
const checkboxColumnId = (field) => `checkbox:${field.id}`;
const getMovableColumnIds = (settings = {}) => [
  COLUMN_IDS.roll,
  COLUMN_IDS.name,
  ...(Array.isArray(settings.blankFields) ? settings.blankFields.map(blankColumnId) : []),
  ...(Array.isArray(settings.mcqFields) ? settings.mcqFields.map(mcqColumnId) : []),
  ...(Array.isArray(settings.checkboxFields) ? settings.checkboxFields.map(checkboxColumnId) : []),
  COLUMN_IDS.feedback,
];
const normalizeColumnOrder = (order = [], settings = {}) => {
  const allIds = getMovableColumnIds(settings);
  const allowed = new Set(allIds);
  const seen = new Set();
  const saved = Array.isArray(order) ? order : [];
  const normalized = saved
    .map((item) => String(item || ""))
    .filter((id) => allowed.has(id) && !seen.has(id) && seen.add(id));
  return [...normalized, ...allIds.filter((id) => !seen.has(id))];
};
const buildVisibleColumns = (settings = {}, { includeCourse = false } = {}) => {
  const columns = [];
  if (settings.includeRoll) columns.push({ id: COLUMN_IDS.roll, type: "roll", label: "Roll" });
  if (settings.includeName) columns.push({ id: COLUMN_IDS.name, type: "name", label: "Name" });
  if (settings.includeBlankFields) {
    (settings.blankFields || []).forEach((field, fieldIndex) =>
      columns.push({ id: blankColumnId(field), type: "blank", field, fieldIndex, label: displayText(field.label, `Blank Field ${fieldIndex + 1}`) })
    );
  }
  if (settings.includeMcq) {
    (settings.mcqFields || []).forEach((field, fieldIndex) =>
      columns.push({ id: mcqColumnId(field), type: "mcq", field, fieldIndex, label: displayText(field.label, `Category ${fieldIndex + 1}`) })
    );
  }
  if (settings.includeCheckbox) {
    (settings.checkboxFields || []).forEach((field, fieldIndex) =>
      columns.push({ id: checkboxColumnId(field), type: "checkbox", field, fieldIndex, label: displayText(field.label, `Checkbox ${fieldIndex + 1}`) })
    );
  }
  if (settings.includeFeedback) columns.push({ id: COLUMN_IDS.feedback, type: "feedback", label: "Feedback / Comments" });

  const byId = new Map(columns.map((column) => [column.id, column]));
  const ordered = normalizeColumnOrder(settings.columnOrder, settings).map((id) => byId.get(id)).filter(Boolean);
  if (includeCourse) {
    const nameIndex = ordered.findIndex((column) => column.id === COLUMN_IDS.name);
    ordered.splice(nameIndex >= 0 ? nameIndex + 1 : 0, 0, { id: "course", type: "course", label: "Course", locked: true });
  }
  if (settings.includeTotal) ordered.push({ id: COLUMN_IDS.total, type: "total", label: "Total", locked: true });
  return ordered;
};

const todayInput = () => new Date().toISOString().slice(0, 10);
const timeInput = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const getNoteId = (note) => note?._id || note?.id;
const getCourseId = (course) => !course ? "" : typeof course === "string" ? course : String(course._id || course.id || "");
const formatCourseLabel = (course) => {
  if (!course) return "No course selected";
  return `${course.code || "Course"}${course.title ? ` - ${course.title}` : ""}${course.section ? ` (${course.section})` : ""}`;
};
const semesterKey = (semester, year) => String(semester || "").trim() && String(year || "").trim() ? `${String(semester).trim()}::${String(year).trim()}` : "";
const semesterLabelFromKey = (key) => String(key || "").split("::").filter(Boolean).join(" ");
const getNoteSemesterKey = (note) => semesterKey(note?.courseScope === "all" ? note?.scopeSemester : note?.course?.semester, note?.courseScope === "all" ? note?.scopeYear : note?.course?.year);
const formatNoteCourseLabel = (note) => note?.courseScope === "all" ? `All Courses${getNoteSemesterKey(note) ? ` - ${semesterLabelFromKey(getNoteSemesterKey(note))}` : ""}` : formatCourseLabel(note?.course);
const pickCurrentSemesterKey = (courses = []) => {
  const ranks = { spring: 1, summer: 2, fall: 3 };
  return [...new Set(courses.map((c) => semesterKey(c?.semester, c?.year)).filter(Boolean))].sort((a, b) => {
    const [sa, ya] = a.split("::");
    const [sb, yb] = b.split("::");
    return Number(yb) - Number(ya) || (ranks[String(sb).toLowerCase()] || 0) - (ranks[String(sa).toLowerCase()] || 0);
  })[0] || "all";
};
const safeFileName = (value = "notebook") => String(value).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 80) || "notebook";
const stripHtml = (html = "") => String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

const buildSavePayload = (note) => ({
  title: note?.title || "Untitled",
  date: note?.date || todayInput(),
  time: note?.time || timeInput(),
  settings: normalizeSettings(note?.settings || {}),
  evaluationRows: Array.isArray(note?.evaluationRows) ? note.evaluationRows : [],
  groupRows: Array.isArray(note?.groupRows) ? note.groupRows : [],
  content: note?.content || "",
  courseScope: note?.courseScope || (note?.course ? "single" : undefined),
  scopeSemester: note?.scopeSemester || "",
  scopeYear: note?.scopeYear || "",
});
const serializeNote = (note) => JSON.stringify(buildSavePayload(note));

export default function TeacherNotebookPage() {
  const [notes, setNotes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [refreshingStudents, setRefreshingStudents] = useState(false);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef("");
  const selectedNoteRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [notesData, courseData] = await Promise.all([fetchNotebookNotes(), fetchTeacherCourses()]);
      const nextNotes = Array.isArray(notesData) ? notesData : [];
      const nextCourses = Array.isArray(courseData) ? courseData : [];
      setNotes(nextNotes);
      setCourses(nextCourses);
      setSemesterFilter((current) => current || pickCurrentSemesterKey(nextCourses));
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load notebook data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);

  const persistNotebookSnapshot = async (initialSnapshot) => {
    if (!initialSnapshot) return;

    if (saveInFlightRef.current) {
      pendingSaveRef.current = initialSnapshot;
      return;
    }

    saveInFlightRef.current = true;
    let snapshot = initialSnapshot;

    try {
      while (snapshot) {
        pendingSaveRef.current = null;
        const noteId = getNoteId(snapshot);
        if (!noteId) break;

        const serializedSnapshot = serializeNote(snapshot);
        const activeNote = selectedNoteRef.current;
        if (getNoteId(activeNote) === noteId) setSaveStatus("Saving...");

        try {
          const saved = await updateNotebookNote(noteId, buildSavePayload(snapshot));
          const latestNote = selectedNoteRef.current;
          const isStillActive = getNoteId(latestNote) === noteId;
          const hasNewerLocalChanges =
            isStillActive && serializeNote(latestNote) !== serializedSnapshot;

          // Never let an older autosave response overwrite text/marks that the
          // teacher entered while that request was in flight.
          if (isStillActive) {
            lastSavedRef.current = serializeNote(saved);
            if (!hasNewerLocalChanges) {
              setSelectedNote((current) =>
                current && getNoteId(current) === noteId ? { ...current, ...saved } : current
              );
              setSaveStatus("Saved");
            } else {
              setSaveStatus("Unsaved changes");
            }
          }

          setNotes((prev) =>
            prev.map((item) => (getNoteId(item) === noteId ? { ...item, ...saved } : item))
          );
        } catch (err) {
          console.error(err);
          if (getNoteId(selectedNoteRef.current) === noteId) setSaveStatus("Save failed");
        }

        snapshot = pendingSaveRef.current;
      }
    } finally {
      saveInFlightRef.current = false;

      // A change can arrive in the tiny gap after the loop checked the queue
      // but before the in-flight flag was cleared. Save that latest snapshot too.
      if (pendingSaveRef.current) {
        const queuedSnapshot = pendingSaveRef.current;
        pendingSaveRef.current = null;
        void persistNotebookSnapshot(queuedSnapshot);
      }
    }
  };

  useEffect(() => {
    if (!selectedNote) return undefined;
    const serialized = serializeNote(selectedNote);
    if (serialized === lastSavedRef.current) return undefined;

    setSaveStatus("Unsaved changes");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const snapshot = selectedNote;
    saveTimerRef.current = setTimeout(() => {
      void persistNotebookSnapshot(snapshot);
    }, 650);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [selectedNote]);

  const semesterOptions = useMemo(() => [...new Set([...courses.map((c) => semesterKey(c.semester, c.year)), ...notes.map(getNoteSemesterKey)].filter(Boolean))].sort().reverse(), [courses, notes]);
  const courseOptions = useMemo(() => {
    const map = new Map();
    [...courses, ...notes.map((n) => n.course).filter(Boolean)].forEach((course) => {
      const id = getCourseId(course);
      if (id && !map.has(id)) map.set(id, course);
    });
    return [...map.values()].filter((course) => !semesterFilter || semesterFilter === "all" || semesterKey(course.semester, course.year) === semesterFilter).sort((a, b) => formatCourseLabel(a).localeCompare(formatCourseLabel(b), undefined, { numeric: true }));
  }, [courses, notes, semesterFilter]);

  const filteredNotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return notes.filter((note) => {
      const type = note.type || "simple";
      const matchesType = typeFilter === "all" || type === typeFilter;
      const sem = getNoteSemesterKey(note);
      const matchesSemester = semesterFilter === "all" || !semesterFilter || sem === semesterFilter;
      const noteCourse = getCourseId(note.course || note.courseId);
      const matchesCourse = courseFilter === "all" || noteCourse === courseFilter;
      const haystack = `${note.title || ""} ${TYPE_LABELS[type] || type} ${formatNoteCourseLabel(note)} ${note.date || ""} ${normalizeSettings(note.settings).groupWise ? "group presentation" : ""}`.toLowerCase();
      return matchesType && matchesSemester && matchesCourse && (!term || haystack.includes(term));
    });
  }, [notes, query, typeFilter, semesterFilter, courseFilter]);

  const openNote = async (note) => {
    const noteId = getNoteId(note);
    if (!noteId) return;
    try {
      setOpeningId(noteId);
      const full = await fetchNotebookNoteById(noteId);
      setSelectedNote(full);
      lastSavedRef.current = serializeNote(full);
      setSaveStatus("Saved");
    } catch (err) {
      Swal.fire({ icon: "error", title: "Could not open note", text: err?.response?.data?.message || "Please try again." });
    } finally {
      setOpeningId(null);
    }
  };

  const handleCreate = async (payload) => {
    const created = await createNotebookNote(payload);
    setNotes((prev) => [created, ...prev]);
    setSelectedNote(created);
    lastSavedRef.current = serializeNote(created);
    setSaveStatus("Saved");
    setShowCreateModal(false);
  };

  const handleDelete = async (note) => {
    const noteId = getNoteId(note);
    const result = await Swal.fire({ title: "Delete this note?", text: `${note.title || "Untitled"} will be permanently deleted.`, icon: "warning", showCancelButton: true, confirmButtonText: "Yes, delete", confirmButtonColor: "#dc2626" });
    if (!result.isConfirmed) return;
    try {
      await deleteNotebookNote(noteId);
      setNotes((prev) => prev.filter((item) => getNoteId(item) !== noteId));
      if (getNoteId(selectedNote) === noteId) setSelectedNote(null);
      Swal.fire({ icon: "success", title: "Deleted", timer: 1300, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Delete failed", text: err?.response?.data?.message || "Please try again." });
    }
  };

  const handleRefreshStudents = async () => {
    const noteId = getNoteId(selectedNote);
    if (!noteId || selectedNote?.type !== "evaluation") return;
    try {
      setRefreshingStudents(true);
      if (serializeNote(selectedNote) !== lastSavedRef.current) {
        const saved = await updateNotebookNote(noteId, buildSavePayload(selectedNote));
        lastSavedRef.current = serializeNote(saved);
      }
      const result = await refreshNotebookStudents(noteId);
      const refreshed = result?.note || result;
      if (refreshed) {
        setSelectedNote(refreshed);
        lastSavedRef.current = serializeNote(refreshed);
        setNotes((prev) => prev.map((item) => getNoteId(item) === noteId ? { ...item, ...refreshed } : item));
      }
      Swal.fire({ icon: "success", title: result?.addedCount ? "Student data refreshed" : "Already up to date", text: result?.message || "Student roster is current.", timer: 2000, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Refresh failed", text: err?.response?.data?.message || "Please try again." });
    } finally {
      setRefreshingStudents(false);
    }
  };

  const updateSelectedNote = (patchOrFn) => setSelectedNote((prev) => prev ? { ...prev, ...(typeof patchOrFn === "function" ? patchOrFn(prev) : patchOrFn) } : prev);

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden text-slate-900 dark:text-slate-100">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">Teacher Notebook</div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Notebook & Evaluation Sheets</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Create student-wise evaluations, group presentation marksheets, and class notes. Export individual or group reports whenever needed.</p>
          </div>
          <button type="button" onClick={() => setShowCreateModal(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700">+ Create Note</button>
        </div>
      </section>

      {selectedNote ? (
        <NotebookEditor note={selectedNote} courses={courses} saveStatus={saveStatus} onBack={() => setSelectedNote(null)} onChange={updateSelectedNote} onDelete={() => handleDelete(selectedNote)} onRefreshStudents={handleRefreshStudents} refreshingStudents={refreshingStudents} />
      ) : (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_180px_190px_260px]">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, course, group presentation..." className="input-soft" />
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-soft"><option value="all">All Templates</option><option value="evaluation">Evaluation</option><option value="simple">Simple Notes</option></select>
              <select value={semesterFilter || "all"} onChange={(e) => setSemesterFilter(e.target.value)} className="input-soft"><option value="all">All Semesters</option>{semesterOptions.map((key) => <option key={key} value={key}>{semesterLabelFromKey(key)}</option>)}</select>
              <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="input-soft"><option value="all">All Courses</option>{courseOptions.map((course) => <option key={getCourseId(course)} value={getCourseId(course)}>{formatCourseLabel(course)}</option>)}</select>
            </div>
          </div>
          {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading notebook...</div> : error ? <div className="p-10 text-center text-red-600">{error}</div> : filteredNotes.length === 0 ? <EmptyNotebook onCreate={() => setShowCreateModal(true)} /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/70"><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">{filteredNotes.map((note) => <NoteRow key={getNoteId(note)} note={note} openingId={openingId} onOpen={() => openNote(note)} onDelete={() => handleDelete(note)} />)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showCreateModal && <CreateNotebookModal courses={courses} onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />}
    </div>
  );
}

function NoteRow({ note, openingId, onOpen, onDelete }) {
  const isGroup = note.type === "evaluation" && normalizeSettings(note.settings).groupWise;
  return <tr onClick={onOpen} className="cursor-pointer text-sm transition hover:bg-slate-50 dark:hover:bg-slate-900/60"><td className="px-4 py-4"><div className="font-semibold text-slate-900 dark:text-white">{note.title || "Untitled"}</div><div className="mt-1 text-xs text-slate-500">{note.time || "--:--"}</div></td><td className="px-4 py-4"><TypeBadge type={note.type} groupWise={isGroup} /></td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{formatNoteCourseLabel(note)}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{note.date || "-"}</td><td className="px-4 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className="rounded-xl border border-violet-200 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-500/30 dark:text-violet-300">{openingId === getNoteId(note) ? "Opening..." : "Open"}</button><button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 dark:border-red-500/30 dark:text-red-300">Delete</button></div></td></tr>;
}

function EmptyNotebook({ onCreate }) {
  return <div className="p-10 text-center"><h3 className="text-lg font-black text-slate-950 dark:text-white">No notes yet</h3><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create an evaluation sheet, group presentation sheet, or simple note.</p><button type="button" onClick={onCreate} className="mt-5 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white">Create First Note</button></div>;
}

function CreateNotebookModal({ courses, onClose, onCreate }) {
  const [type, setType] = useState("evaluation");
  const [title, setTitle] = useState("Random Mark Evaluation");
  const [courseId, setCourseId] = useState("");
  const [date, setDate] = useState(todayInput());
  const [time, setTime] = useState(timeInput());
  const [settings, setSettings] = useState(() => normalizeSettings(DEFAULT_SETTINGS));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const normalized = normalizeSettings(settings);

  const setGroupWise = (groupWise) => {
    if (groupWise) {
      setSettings(normalizeSettings({ ...DEFAULT_SETTINGS, groupWise: true, groupMarkMode: "group", feedbackEntryMode: "group", includeRoll: false, includeName: false, includeBlankFields: true, includeTotal: true, includeMcq: false, includeFeedback: true, blankFields: [{ id: "blank_1", label: "Presentation Marks", entryMode: "group" }] }));
      if (title === "Random Mark Evaluation" || title === "Class Note") setTitle("Group Presentation Evaluation");
      if (courseId === "__all__") setCourseId("");
    } else {
      setSettings(normalizeSettings({ ...DEFAULT_SETTINGS, groupWise: false }));
      if (title === "Group Presentation Evaluation") setTitle("Random Mark Evaluation");
    }
  };

  const updateSetting = (key, value) => setSettings((prev) => normalizeSettings({ ...prev, [key]: value }));
  const updateField = (kind, id, patch) => setSettings((prev) => {
    const n = normalizeSettings(prev);
    const key = kind === "blank" ? "blankFields" : kind === "mcq" ? "mcqFields" : "checkboxFields";
    return normalizeSettings({ ...n, [key]: n[key].map((field) => field.id === id ? { ...field, ...patch } : field) });
  });
  const addField = (kind) => setSettings((prev) => {
    const n = normalizeSettings(prev);
    const key = kind === "blank" ? "blankFields" : kind === "mcq" ? "mcqFields" : "checkboxFields";
    const maker = kind === "blank" ? makeBlankField : kind === "mcq" ? makeMcqField : makeCheckboxField;
    return normalizeSettings({ ...n, [key]: [...n[key], maker(n[key].length + 1)] });
  });
  const removeField = (kind, id) => setSettings((prev) => {
    const n = normalizeSettings(prev);
    const key = kind === "blank" ? "blankFields" : kind === "mcq" ? "mcqFields" : "checkboxFields";
    return normalizeSettings({ ...n, [key]: n[key].filter((field) => field.id !== id) });
  });

  const submit = async (e) => {
    e.preventDefault();
    setCreateError("");
    if (!title.trim()) return setCreateError("Please give a name for the note.");
    if (type === "evaluation" && !courseId) return setCreateError("Please select a course for the evaluation sheet.");
    try {
      setCreating(true);
      const n = normalizeSettings(settings);
      const allCourses = type === "evaluation" && !n.groupWise && courseId === "__all__";
      const current = pickCurrentSemesterKey(courses);
      const [scopeSemester = "", scopeYear = ""] = current === "all" ? [] : current.split("::");
      await onCreate({
        type,
        title: title.trim(),
        courseId: allCourses ? null : courseId || null,
        courseScope: allCourses ? "all" : "single",
        scopeSemester: allCourses ? scopeSemester : "",
        scopeYear: allCourses ? scopeYear : "",
        date,
        time,
        settings: n,
        groupRows: n.groupWise ? [] : undefined,
        content: type === "simple" ? "" : undefined,
      });
    } catch (err) {
      setCreateError(err?.response?.data?.message || "Failed to create note.");
    } finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"><div><h2 className="text-lg font-black text-slate-950 dark:text-white">Create New Note</h2><p className="text-xs text-slate-500">Choose a template and customize it.</p></div><button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-black dark:border-slate-800">Close</button></div>
        <form onSubmit={submit} className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2"><TemplateButton active={type === "evaluation"} title="Evaluation Sheet" subtitle="Student-wise or group-wise presentation evaluation" onClick={() => { setType("evaluation"); setSettings(normalizeSettings(DEFAULT_SETTINGS)); if (title === "Class Note") setTitle("Random Mark Evaluation"); }} /><TemplateButton active={type === "simple"} title="Simple Note" subtitle="Free writing space with basic formatting" onClick={() => { setType("simple"); setSettings(normalizeSettings(DEFAULT_SETTINGS)); if (title === "Random Mark Evaluation" || title === "Group Presentation Evaluation") setTitle("Class Note"); }} /></div>

          {type === "evaluation" && (
            <div className="rounded-3xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-500/20 dark:bg-violet-500/5">
              <div className="text-xs font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Evaluation Layout</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TemplateButton active={!normalized.groupWise} title="Student-wise" subtitle="One row for each enrolled student" onClick={() => setGroupWise(false)} />
                <TemplateButton active={normalized.groupWise} title="Group-wise Presentation" subtitle="Create custom groups and mix shared + individual fields" onClick={() => setGroupWise(true)} />
              </div>
              {normalized.groupWise && (
                <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-3 text-xs leading-5 text-slate-600 dark:border-violet-500/20 dark:bg-slate-950 dark:text-slate-300">
                  Each field can be configured separately as <b>Group-shared</b> or <b>Individual</b>. This lets one presentation sheet use both styles at the same time.
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Note / Template Name"><input value={title} onChange={(e) => setTitle(e.target.value)} className="input-soft" /></Field>
            <Field label={type === "evaluation" ? "Course" : "Course (optional)"}><select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="input-soft"><option value="">Select course</option>{type === "evaluation" && !normalized.groupWise && <option value="__all__">All Courses (current semester)</option>}{courses.map((course) => <option key={getCourseId(course)} value={getCourseId(course)}>{formatCourseLabel(course)}</option>)}</select></Field>
            <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-soft" /></Field>
            <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input-soft" /></Field>
          </div>

          {type === "evaluation" && (
            <EvaluationFieldSettings settings={normalized} onUpdateSetting={updateSetting} onUpdateField={updateField} onAddField={addField} onRemoveField={removeField} />
          )}
          {createError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{createError}</div>}
          <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black dark:border-slate-800">Cancel</button><button type="submit" disabled={creating} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{creating ? "Creating..." : "Create & Open"}</button></div>
        </form>
      </div>
    </div>
  );
}

function EvaluationFieldSettings({ settings, onUpdateSetting, onUpdateField, onAddField, onRemoveField }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <h3 className="text-sm font-black text-slate-950 dark:text-white">{settings.groupWise ? "Group Presentation Fields" : "Evaluation Sheet Fields"}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {!settings.groupWise && <><Check checked={settings.includeRoll} label="Roll Number" onChange={(v) => onUpdateSetting("includeRoll", v)} /><Check checked={settings.includeName} label="Student Name" onChange={(v) => onUpdateSetting("includeName", v)} /></>}
        <Check checked={settings.includeFeedback} label="Feedback / Comments" onChange={(v) => onUpdateSetting("includeFeedback", v)} />
        <Check checked={settings.includeTotal} label="Total" onChange={(v) => onUpdateSetting("includeTotal", v)} />
        <Check checked={settings.includeBlankFields} label="Blank Fields / Marks" onChange={(v) => onUpdateSetting("includeBlankFields", v)} />
        <Check checked={settings.includeMcq} label="MCQ / Category" onChange={(v) => onUpdateSetting("includeMcq", v)} />
        <Check checked={settings.includeCheckbox} label="Checkbox Columns" onChange={(v) => onUpdateSetting("includeCheckbox", v)} />
      </div>

      {settings.includeBlankFields && <FieldCollection title="Blank Fields / Marks Columns" fields={settings.blankFields} kind="blank" onUpdateField={onUpdateField} onAddField={onAddField} onRemoveField={onRemoveField} />}
      {settings.includeMcq && <McqCollection fields={settings.mcqFields} onUpdateField={onUpdateField} onAddField={onAddField} onRemoveField={onRemoveField} />}
      {settings.includeCheckbox && <FieldCollection title="Checkbox Columns" fields={settings.checkboxFields} kind="checkbox" onUpdateField={onUpdateField} onAddField={onAddField} onRemoveField={onRemoveField} />}
    </div>
  );
}

function FieldCollection({ title, fields, kind, onUpdateField, onAddField, onRemoveField }) {
  return <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</div><button type="button" onClick={() => onAddField(kind)} className="rounded-xl border border-violet-200 px-3 py-1.5 text-xs font-black text-violet-700 dark:border-violet-500/30 dark:text-violet-300">+ Add</button></div>{fields.map((field, index) => <div key={field.id} className="flex gap-2"><input value={field.label} onChange={(e) => onUpdateField(kind, field.id, { label: e.target.value })} className="input-soft" placeholder={`${title} ${index + 1}`} /><button type="button" onClick={() => onRemoveField(kind, field.id)} disabled={fields.length <= 1} className="rounded-xl border border-red-200 px-3 text-xs font-black text-red-600 disabled:opacity-30 dark:border-red-500/30 dark:text-red-300">Remove</button></div>)}</div>;
}

function McqCollection({ fields, onUpdateField, onAddField, onRemoveField }) {
  const updateOption = (field, optionIndex, value) => onUpdateField("mcq", field.id, { options: field.options.map((option, i) => i === optionIndex ? value : option) });
  return <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-wide text-slate-500">MCQ / Category Columns</div><button type="button" onClick={() => onAddField("mcq")} className="rounded-xl border border-violet-200 px-3 py-1.5 text-xs font-black text-violet-700 dark:border-violet-500/30 dark:text-violet-300">+ Add Column</button></div>{fields.map((field, index) => <div key={field.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"><div className="flex gap-2"><input value={field.label} onChange={(e) => onUpdateField("mcq", field.id, { label: e.target.value })} className="input-soft" /><button type="button" onClick={() => onRemoveField("mcq", field.id)} disabled={fields.length <= 1} className="rounded-xl border border-red-200 px-3 text-xs font-black text-red-600 disabled:opacity-30">Remove</button></div><div className="mt-2 flex flex-wrap gap-2">{field.options.map((option, optionIndex) => <input key={optionIndex} value={option} onChange={(e) => updateOption(field, optionIndex, e.target.value)} className="w-32 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-slate-700 dark:bg-slate-950" />)}<button type="button" onClick={() => onUpdateField("mcq", field.id, { options: [...field.options, `Option ${field.options.length + 1}`] })} className="rounded-xl border border-violet-200 px-2 py-1 text-xs font-bold text-violet-700">+ Option</button></div></div>)}</div>;
}

function NotebookEditor({ note, courses, saveStatus, onBack, onChange, onDelete, onRefreshStudents, refreshingStudents }) {
  const type = note.type || "simple";
  const settings = normalizeSettings(note.settings || {});
  const groupWise = type === "evaluation" && settings.groupWise;
  const selectedCourse = note.course || courses.find((c) => getCourseId(c) === getCourseId(note.courseId || note.course));
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1"><button type="button" onClick={onBack} className="mb-3 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black dark:border-slate-800">← Back to list</button><div className="flex flex-wrap gap-2"><TypeBadge type={type} groupWise={groupWise} /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">{saveStatus}</span></div><input value={note.title || ""} onChange={(e) => onChange({ title: e.target.value })} className="mt-3 w-full rounded-2xl border border-transparent bg-transparent text-2xl font-semibold tracking-tight text-slate-950 outline-none focus:border-violet-300 focus:px-3 dark:text-white sm:text-3xl" /><p className="mt-1 text-sm text-slate-500">{note.courseScope === "all" ? formatNoteCourseLabel(note) : formatCourseLabel(selectedCourse)}</p></div>
          <div className="space-y-2"><div className="flex gap-2"><input type="date" value={note.date || todayInput()} onChange={(e) => onChange({ date: e.target.value })} className="input-soft w-40" /><input type="time" value={note.time || timeInput()} onChange={(e) => onChange({ time: e.target.value })} className="input-soft w-32" /></div><div className="flex flex-wrap justify-end gap-2">{type === "evaluation" && <button type="button" onClick={onRefreshStudents} disabled={refreshingStudents} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">{refreshingStudents ? "Refreshing..." : groupWise ? "Refresh Member List" : "Refresh Students"}</button>}{type === "evaluation" && !groupWise && <><button type="button" onClick={() => exportEvaluationExcel(note)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">Excel</button><button type="button" onClick={() => exportEvaluationPdf(note)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">PDF</button><button type="button" onClick={() => printEvaluationPdf(note)} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">Print</button></>}{type === "simple" && <button type="button" onClick={() => exportSimplePdf(note)} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">Export PDF</button>}<button type="button" onClick={onDelete} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">Delete</button></div></div>
        </div>
      </div>
      {type === "evaluation" ? (
        groupWise ? (
          <GroupPresentationEditor
            note={note}
            onChange={onChange}
            marksSyncPanel={<NotebookMarksSyncPanel note={note} embedded />}
          />
        ) : (
          <EvaluationEditor note={note} onChange={onChange} />
        )
      ) : (
        <SimpleNoteEditor note={note} onChange={onChange} />
      )}
    </section>
  );
}

function EvaluationEditor({ note, onChange }) {
  const settings = normalizeSettings(note.settings || {});
  const rows = Array.isArray(note.evaluationRows) ? note.evaluationRows : [];
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const blankFields = settings.includeBlankFields ? settings.blankFields : [];
  const mcqFields = settings.includeMcq ? settings.mcqFields : [];
  const checkboxFields = settings.includeCheckbox ? settings.checkboxFields : [];
  const visibleColumns = buildVisibleColumns(settings, { includeCourse: note.courseScope === "all" });

  const updateRow = (index, patch) =>
    onChange({ evaluationRows: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const updateBlank = (index, field, value) =>
    updateRow(index, { blankValues: { ...(rows[index]?.blankValues || {}), [field.id]: value } });
  const updateMcq = (index, field, fieldIndex, value) =>
    updateRow(index, {
      selectedOptions: { ...(rows[index]?.selectedOptions || {}), [field.id]: value },
      selectedOption: fieldIndex === 0 ? value : rows[index]?.selectedOption || "",
    });
  const updateCheckbox = (index, field, value) =>
    updateRow(index, { checkboxValues: { ...(rows[index]?.checkboxValues || {}), [field.id]: Boolean(value) } });

  const filtered = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      const extra = [
        ...blankFields.map((field) => getRowBlankValue(row, field)),
        ...mcqFields.map((field, fieldIndex) => getRowMcqValue(row, field, fieldIndex)),
        ...checkboxFields.map((field) => (getRowCheckboxValue(row, field) ? field.label : "")),
        calculateTotal(row, blankFields).value,
      ].join(" ");
      return `${row.roll || ""} ${row.name || ""} ${row.courseLabel || ""} ${row.feedback || ""} ${extra}`
        .toLowerCase()
        .includes(term);
    });

  const renderHeader = (column) => {
    const align = column.type === "checkbox" || column.type === "total" ? "text-center" : "text-left";
    const width =
      column.type === "name" || column.type === "course"
        ? "min-w-56"
        : column.type === "feedback"
          ? "min-w-[280px]"
          : column.type === "mcq"
            ? "min-w-44"
            : "min-w-32";
    return <th key={column.id} className={`${width} px-4 py-3 ${align} font-black`}>{column.label}</th>;
  };

  const renderCell = (column, row, rowIndex) => {
    if (column.type === "roll") return <td key={column.id} className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{row.roll || "-"}</td>;
    if (column.type === "name") return <td key={column.id} className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.name || "-"}</td>;
    if (column.type === "course") return <td key={column.id} className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.courseLabel || "-"}</td>;
    if (column.type === "blank") {
      return <td key={column.id} className="px-4 py-3"><input value={getRowBlankValue(row, column.field)} onChange={(event) => updateBlank(rowIndex, column.field, event.target.value)} inputMode="decimal" className="input-soft min-w-36" placeholder="Write value..." /></td>;
    }
    if (column.type === "mcq") {
      return <td key={column.id} className="px-4 py-3"><select value={getRowMcqValue(row, column.field, column.fieldIndex)} onChange={(event) => updateMcq(rowIndex, column.field, column.fieldIndex, event.target.value)} className="input-soft min-w-40"><option value="">Select</option>{(column.field.options || []).map((option, optionIndex) => <option key={`${column.field.id}-${optionIndex}`} value={option}>{displayText(option, `Option ${optionIndex + 1}`)}</option>)}</select></td>;
    }
    if (column.type === "checkbox") {
      return <td key={column.id} className="px-4 py-3 text-center"><input type="checkbox" checked={getRowCheckboxValue(row, column.field)} onChange={(event) => updateCheckbox(rowIndex, column.field, event.target.checked)} className="h-5 w-5 accent-violet-600" /></td>;
    }
    if (column.type === "feedback") {
      return <td key={column.id} className="px-4 py-3"><textarea value={row.feedback || ""} onChange={(event) => updateRow(rowIndex, { feedback: event.target.value })} rows={2} className="input-soft min-w-[260px]" placeholder="Write feedback..." /></td>;
    }
    if (column.type === "total") {
      const total = calculateTotal(row, blankFields);
      return <td key={column.id} className={`px-4 py-3 text-center font-black ${total.error ? "text-red-600 dark:text-red-300" : "text-slate-800 dark:text-slate-100"}`}>{total.value || "-"}</td>;
    }
    return null;
  };

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="flex w-full items-center justify-between gap-3">
          <div className="text-left">
            <h3 className="text-sm font-black text-slate-950 dark:text-white">Sheet Settings</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Adjust fields and move visible columns without losing entered data.</p>
          </div>
          <span className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black dark:border-slate-700">{settingsOpen ? "Hide" : "Show"}</span>
        </button>
        {settingsOpen && <div className="mt-4"><EvaluationSettingsEditor settings={settings} rows={rows} onChange={onChange} /></div>}
      </div>

      {note.courseScope === "all" ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">Marks Sync is available for course-specific evaluation sheets.</div>
      ) : (
        <NotebookMarksSyncPanel note={note} />
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roll, name, course, fields or feedback..." className="input-soft flex-1" />
            <span className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-500 dark:bg-slate-900 dark:text-slate-400">{filtered.length}/{rows.length}</span>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-black">#</th>
                {visibleColumns.map(renderHeader)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map(({ row, index }, viewIndex) => (
                <tr key={`${row.course || ""}-${row.roll || "row"}-${index}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                  <td className="px-4 py-3 text-slate-400">{viewIndex + 1}</td>
                  {visibleColumns.map((column) => renderCell(column, row, index))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EvaluationSettingsEditor({ settings, rows, onChange }) {
  const updateSetting = (key, value) => onChange({ settings: normalizeSettings({ ...settings, [key]: value }) });
  const updateFields = (key, fields) => onChange({ settings: normalizeSettings({ ...settings, [key]: fields }) });
  const removeField = (kind, fieldId) => {
    const key = kind === "blank" ? "blankFields" : kind === "mcq" ? "mcqFields" : "checkboxFields";
    const nextFields = settings[key].filter((field) => field.id !== fieldId);
    const nextRows = rows.map((row) => {
      const copy = { ...row };
      if (kind === "blank") { const values = { ...(row.blankValues || {}) }; delete values[fieldId]; copy.blankValues = values; }
      if (kind === "mcq") { const values = { ...(row.selectedOptions || {}) }; delete values[fieldId]; copy.selectedOptions = values; }
      if (kind === "checkbox") { const values = { ...(row.checkboxValues || {}) }; delete values[fieldId]; copy.checkboxValues = values; }
      return copy;
    });
    onChange({ settings: normalizeSettings({ ...settings, [key]: nextFields }), evaluationRows: nextRows });
  };
  return <><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7"><Check checked={settings.includeRoll} label="Roll" onChange={(v) => updateSetting("includeRoll", v)} /><Check checked={settings.includeName} label="Name" onChange={(v) => updateSetting("includeName", v)} /><Check checked={settings.includeBlankFields} label="Blank Fields" onChange={(v) => updateSetting("includeBlankFields", v)} /><Check checked={settings.includeMcq} label="Category" onChange={(v) => updateSetting("includeMcq", v)} /><Check checked={settings.includeCheckbox} label="Checkbox" onChange={(v) => updateSetting("includeCheckbox", v)} /><Check checked={settings.includeFeedback} label="Feedback" onChange={(v) => updateSetting("includeFeedback", v)} /><Check checked={settings.includeTotal} label="Total" onChange={(v) => updateSetting("includeTotal", v)} /></div>
  <ColumnOrderEditor settings={settings} onChange={onChange} />
  {settings.includeBlankFields && <EditableFields title="Blank Fields" fields={settings.blankFields} onChange={(fields) => updateFields("blankFields", fields)} onAdd={() => updateFields("blankFields", [...settings.blankFields, makeBlankField(settings.blankFields.length + 1)])} onRemove={(id) => removeField("blank", id)} />}
  {settings.includeMcq && <EditableMcqFields fields={settings.mcqFields} onChange={(fields) => updateFields("mcqFields", fields)} onAdd={() => updateFields("mcqFields", [...settings.mcqFields, makeMcqField(settings.mcqFields.length + 1)])} onRemove={(id) => removeField("mcq", id)} />}
  {settings.includeCheckbox && <EditableFields title="Checkbox Columns" fields={settings.checkboxFields} onChange={(fields) => updateFields("checkboxFields", fields)} onAdd={() => updateFields("checkboxFields", [...settings.checkboxFields, makeCheckboxField(settings.checkboxFields.length + 1)])} onRemove={(id) => removeField("checkbox", id)} />}</>;
}

function ColumnOrderEditor({ settings, onChange }) {
  const columns = buildVisibleColumns(settings).filter((column) => !column.locked && column.type !== "total");
  if (columns.length < 2) return null;

  const move = (columnId, direction) => {
    const visibleIds = columns.map((column) => column.id);
    const currentVisibleIndex = visibleIds.indexOf(columnId);
    const targetVisibleIndex = currentVisibleIndex + direction;
    if (currentVisibleIndex < 0 || targetVisibleIndex < 0 || targetVisibleIndex >= visibleIds.length) return;

    const fullOrder = normalizeColumnOrder(settings.columnOrder, settings);
    const targetId = visibleIds[targetVisibleIndex];
    const currentFullIndex = fullOrder.indexOf(columnId);
    const targetFullIndex = fullOrder.indexOf(targetId);
    if (currentFullIndex < 0 || targetFullIndex < 0) return;
    const nextOrder = [...fullOrder];
    [nextOrder[currentFullIndex], nextOrder[targetFullIndex]] = [nextOrder[targetFullIndex], nextOrder[currentFullIndex]];
    onChange({ settings: normalizeSettings({ ...settings, columnOrder: nextOrder }) });
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Column Order</div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use the arrows to move fields left or right. Total stays at the end.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {columns.map((column, index) => (
          <div key={column.id} className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
            <span className="max-w-44 truncate px-2 text-xs font-bold text-slate-700 dark:text-slate-200">{column.label}</span>
            <button type="button" onClick={() => move(column.id, -1)} disabled={index === 0} className="rounded-xl px-2 py-1 text-xs font-black text-slate-600 hover:bg-white disabled:opacity-25 dark:text-slate-300 dark:hover:bg-slate-800" title="Move left">←</button>
            <button type="button" onClick={() => move(column.id, 1)} disabled={index === columns.length - 1} className="rounded-xl px-2 py-1 text-xs font-black text-slate-600 hover:bg-white disabled:opacity-25 dark:text-slate-300 dark:hover:bg-slate-800" title="Move right">→</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableFields({ title, fields, onChange, onAdd, onRemove }) {
  return <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</span><button type="button" onClick={onAdd} className="rounded-xl border border-violet-200 px-3 py-1.5 text-xs font-black text-violet-700">+ Add</button></div>{fields.map((field, index) => <div key={field.id} className="flex gap-2"><input value={field.label} onChange={(e) => onChange(fields.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item))} className="input-soft" /><button type="button" onClick={() => onRemove(field.id)} disabled={fields.length <= 1} className="rounded-xl border border-red-200 px-3 text-xs font-black text-red-600 disabled:opacity-30">Remove</button></div>)}</div>;
}

function EditableMcqFields({ fields, onChange, onAdd, onRemove }) {
  return <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wide text-slate-500">MCQ / Category Columns</span><button type="button" onClick={onAdd} className="rounded-xl border border-violet-200 px-3 py-1.5 text-xs font-black text-violet-700">+ Add</button></div>{fields.map((field) => <div key={field.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"><div className="flex gap-2"><input value={field.label} onChange={(e) => onChange(fields.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item))} className="input-soft" /><button type="button" onClick={() => onRemove(field.id)} disabled={fields.length <= 1} className="rounded-xl border border-red-200 px-3 text-xs font-black text-red-600 disabled:opacity-30">Remove</button></div><div className="mt-2 flex flex-wrap gap-2">{field.options.map((option, index) => <input key={index} value={option} onChange={(e) => onChange(fields.map((item) => item.id === field.id ? { ...item, options: item.options.map((value, i) => i === index ? e.target.value : value) } : item))} className="w-32 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950" />)}<button type="button" onClick={() => onChange(fields.map((item) => item.id === field.id ? { ...item, options: [...item.options, `Option ${item.options.length + 1}`] } : item))} className="rounded-xl border border-violet-200 px-2 py-1 text-xs font-black text-violet-700">+ Option</button></div></div>)}</div>;
}

function NotebookMarksSyncPanel({ note, embedded = false }) {
  const noteId = getNoteId(note);
  const syncSettings = normalizeSettings(note?.settings || {});
  const isGroupSheet = Boolean(syncSettings.groupWise);
  const syncDescription = isGroupSheet
    ? "Map any numeric field or Total to the course marksheet. Group-shared fields copy the same value to every member; individual fields keep each student's own value."
    : "Map numeric fields or Total to course assessments.";
  const [open, setOpen] = useState(Boolean(embedded));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({ sourceOptions: [], targetAssessments: [], mappings: [], locks: [] });
  const [mappings, setMappings] = useState([]);

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchNotebookMarkSync(noteId);
      const next = {
        sourceOptions: data?.sourceOptions || [],
        targetAssessments: data?.targetAssessments || [],
        mappings: data?.mappings || [],
        locks: data?.locks || [],
      };
      setConfig(next);
      setMappings(next.mappings);
    } catch (error) {
      Swal.fire({ icon: "error", title: "Could not load Marks Sync", text: error?.response?.data?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && noteId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, noteId]);

  const sourceKey = (mapping) => mapping?.sourceType === "total" ? "total" : `blank:${mapping?.sourceFieldId || ""}`;
  const addMapping = () => setMappings((current) => [
    ...current,
    { id: makeId("mapping"), sourceType: "blank", sourceFieldId: "", sourceLabel: "", targetAssessment: "", targetComponentKey: "" },
  ]);
  const updateMapping = (id, patch) => setMappings((current) => current.map((mapping) => mapping.id === id ? { ...mapping, ...patch } : mapping));

  const save = async () => {
    try {
      setSaving(true);
      await updateNotebookNote(noteId, buildSavePayload(note));
      const result = await saveNotebookMarkSync(noteId, mappings);
      setMappings(result?.mappings || mappings);
      Swal.fire({ icon: "success", title: "Mapping saved", timer: 1800, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: "error", title: "Could not save mapping", text: error?.response?.data?.message || "Please check the mapping." });
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    try {
      await updateNotebookNote(noteId, buildSavePayload(note));
      const result = await syncNotebookMarks(noteId);
      Swal.fire({ icon: "success", title: "Sync completed", text: result?.message || "Marks synchronized." });
    } catch (error) {
      Swal.fire({ icon: "error", title: "Sync failed", text: error?.response?.data?.message || "Please try again." });
    }
  };

  const content = (
    <div className="mt-4 space-y-3">
      {loading ? (
        <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">Loading assessment destinations...</div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs leading-5 text-slate-600 dark:text-slate-300">Source labels show whether each field is Group-shared or Individual.</div>
            <button type="button" onClick={addMapping} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">+ Add Mapping</button>
          </div>
          {mappings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-300 bg-white/70 p-5 text-center text-xs text-slate-500 dark:border-emerald-500/30 dark:bg-slate-950/70 dark:text-slate-400">No Marks Sync mapping configured.</div>
          ) : (
            <div className="space-y-2">
              {mappings.map((mapping) => {
                const target = config.targetAssessments.find((assessment) => String(assessment.id || assessment._id) === String(mapping.targetAssessment));
                return (
                  <div key={mapping.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 lg:grid-cols-3">
                    <select
                      value={sourceKey(mapping)}
                      onChange={(event) => {
                        const source = config.sourceOptions.find((option) => option.key === event.target.value);
                        updateMapping(mapping.id, {
                          sourceType: source?.sourceType || "blank",
                          sourceFieldId: source?.sourceFieldId || "",
                          sourceLabel: source?.label || "",
                        });
                      }}
                      className="input-soft"
                    >
                      <option value="">Source field</option>
                      {config.sourceOptions.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
                    </select>
                    <select value={mapping.targetAssessment || ""} onChange={(event) => updateMapping(mapping.id, { targetAssessment: event.target.value, targetComponentKey: "" })} className="input-soft">
                      <option value="">Target assessment</option>
                      {config.targetAssessments.map((assessment) => <option key={assessment.id || assessment._id} value={assessment.id || assessment._id}>{assessment.name}</option>)}
                    </select>
                    {target?.structureType === "lab_final" ? (
                      <select value={mapping.targetComponentKey || ""} onChange={(event) => updateMapping(mapping.id, { targetComponentKey: event.target.value })} className="input-soft">
                        <option value="">Component</option>
                        {(target.components || []).map((component) => <option key={component.key} value={component.key}>{component.label || component.name || component.key}</option>)}
                      </select>
                    ) : (
                      <button type="button" onClick={() => setMappings((current) => current.filter((item) => item.id !== mapping.id))} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 dark:border-red-500/30 dark:text-red-300">Remove</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? "Saving..." : "Save Mapping"}</button>
            <button type="button" onClick={syncNow} className="rounded-xl border border-emerald-200 px-4 py-2.5 text-xs font-black text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">Sync Now</button>
          </div>
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
        <h3 className="text-sm font-black text-slate-950 dark:text-white">Marks Sync</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{syncDescription}</p>
        {content}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <h3 className="text-sm font-black text-slate-950 dark:text-white">Marks Sync</h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{syncDescription}</p>
        </div>
        <span className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-300">{open ? "Hide" : "Show"}</span>
      </button>
      {open && content}
    </div>
  );
}

function SimpleNoteEditor({ note, onChange }) {
  const editorRef = useRef(null);
  useEffect(() => { if (editorRef.current && editorRef.current.innerHTML !== (note.content || "")) editorRef.current.innerHTML = note.content || ""; }, [getNoteId(note)]);
  const command = (cmd, value) => { editorRef.current?.focus(); document.execCommand(cmd, false, value); onChange({ content: editorRef.current?.innerHTML || "" }); };
  return <div className="space-y-3 p-4 sm:p-5"><div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900"><button type="button" onClick={() => command("bold")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><b>B</b></button><button type="button" onClick={() => command("italic")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><i>I</i></button><button type="button" onClick={() => command("underline")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><u>U</u></button><button type="button" onClick={() => command("insertUnorderedList")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">• List</button><button type="button" onClick={() => command("insertOrderedList")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">1. List</button></div><div ref={editorRef} contentEditable suppressContentEditableWarning onInput={(e) => onChange({ content: e.currentTarget.innerHTML })} className="min-h-[420px] rounded-3xl border border-slate-200 bg-white p-5 text-base leading-7 outline-none focus:border-violet-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white" data-placeholder="Start writing your note here..." /></div>;
}

function buildEvaluationExport(note) {
  const settings = normalizeSettings(note.settings || {});
  const rows = Array.isArray(note.evaluationRows) ? note.evaluationRows : [];
  const blankFields = settings.includeBlankFields ? settings.blankFields : [];
  const visibleColumns = buildVisibleColumns(settings, { includeCourse: note.courseScope === "all" });
  const columns = visibleColumns.map((column) => ({
    label: column.label,
    value: (row) => {
      if (column.type === "roll") return row.roll || "";
      if (column.type === "name") return row.name || "";
      if (column.type === "course") return row.courseLabel || "";
      if (column.type === "blank") return getRowBlankValue(row, column.field);
      if (column.type === "mcq") return getRowMcqValue(row, column.field, column.fieldIndex);
      if (column.type === "checkbox") return getRowCheckboxValue(row, column.field) ? "Yes" : "No";
      if (column.type === "feedback") return row.feedback || "";
      if (column.type === "total") return calculateTotal(row, blankFields).value;
      return "";
    },
  }));
  return {
    settings,
    rows,
    columns,
    head: columns.map((column) => column.label),
    body: rows.map((row) => columns.map((column) => column.value(row))),
  };
}

function exportEvaluationExcel(note) {
  const { head, body } = buildEvaluationExport(note);
  const ws = XLSX.utils.aoa_to_sheet([[note.title || "Evaluation Sheet"], [formatNoteCourseLabel(note)], [], head, ...body]);
  head.forEach((_, col) => { const cell = ws[XLSX.utils.encode_cell({ r: 3, c: col })]; if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "334155" } }, alignment: { horizontal: "center" } }; });
  ws["!cols"] = head.map((label) => ({ wch: Math.max(14, Math.min(32, label.length + 4)) }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Evaluation"); XLSX.writeFile(wb, `${safeFileName(note.title)}.xlsx`);
}
function createEvaluationPdf(note) {
  const { head, body } = buildEvaluationExport(note);
  const doc = new jsPDF({ orientation: head.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth(); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Bangladesh University of Business and Technology (BUBT)", width / 2, 28, { align: "center" }); doc.setFontSize(13); doc.text(note.title || "Evaluation Sheet", width / 2, 48, { align: "center" }); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(formatNoteCourseLabel(note), width / 2, 64, { align: "center" }); autoTable(doc, { startY: 80, head: [head], body, theme: "grid", styles: { fontSize: head.length > 8 ? 6.5 : 8, cellPadding: 4 }, headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] } }); return doc;
}
function exportEvaluationPdf(note) { createEvaluationPdf(note).save(`${safeFileName(note.title)}.pdf`); }
function printEvaluationPdf(note) { const doc = createEvaluationPdf(note); const url = URL.createObjectURL(doc.output("blob")); const frame = document.createElement("iframe"); frame.style.display = "none"; frame.src = url; frame.onload = () => { frame.contentWindow?.print(); setTimeout(() => { URL.revokeObjectURL(url); frame.remove(); }, 1500); }; document.body.appendChild(frame); }
function exportSimplePdf(note) { const doc = new jsPDF({ unit: "pt", format: "a4" }); const width = doc.internal.pageSize.getWidth(); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(note.title || "Simple Note", 40, 45); doc.setFont("helvetica", "normal"); doc.setFontSize(10); const lines = doc.splitTextToSize(stripHtml(note.content || ""), width - 80); doc.text(lines, 40, 75); doc.save(`${safeFileName(note.title)}.pdf`); }

function TemplateButton({ active, title, subtitle, onClick }) { return <button type="button" onClick={onClick} className={`rounded-3xl border p-4 text-left transition ${active ? "border-violet-400 bg-violet-50 text-violet-950 dark:border-violet-500 dark:bg-violet-500/10 dark:text-violet-100" : "border-slate-200 bg-white hover:border-violet-200 dark:border-slate-800 dark:bg-slate-900"}`}><div className="font-black">{title}</div><div className="mt-1 text-xs opacity-70">{subtitle}</div></button>; }
function Field({ label, children }) { return <label className="block"><span className="mb-2 block text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>{children}</label>; }
function Check({ checked, label, onChange }) { return <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold dark:border-slate-800 dark:bg-slate-950"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-violet-600" />{label}</label>; }
function TypeBadge({ type, groupWise = false }) { const label = groupWise ? "Group Presentation" : TYPE_LABELS[type] || "Simple Note"; const cls = type === "evaluation" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"; return <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${cls}`}>{label}</span>; }
