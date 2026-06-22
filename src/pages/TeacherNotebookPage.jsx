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
} from "../services/notebookService";

const TYPE_LABELS = {
  evaluation: "Evaluation Sheet",
  simple: "Simple Note",
};

const DEFAULT_MCQ_FIELD = {
  id: "mcq_1",
  label: "Marking Category",
  options: ["High", "Medium", "Low"],
};

const DEFAULT_BLANK_FIELD = {
  id: "blank_1",
  label: "Marks",
};

const DEFAULT_SETTINGS = {
  includeRoll: true,
  includeName: true,
  includeFeedback: true,
  includeMcq: true,
  includeBlankFields: false,
  includeTotal: false,
  columnOrder: [],
  mcqLabel: DEFAULT_MCQ_FIELD.label,
  mcqOptions: DEFAULT_MCQ_FIELD.options,
  mcqFields: [DEFAULT_MCQ_FIELD],
  blankFields: [DEFAULT_BLANK_FIELD],
};

const makeMcqField = (index = 1) => ({
  id: `mcq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  label: index === 1 ? "Marking Category" : `Category ${index}`,
  options: ["High", "Medium", "Low"],
});

const makeBlankField = (index = 1) => ({
  id: `blank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  label: index === 1 ? "Marks" : `Blank Field ${index}`,
});

const cleanMcqOptions = (options) => {
  if (!Array.isArray(options)) return [...DEFAULT_MCQ_FIELD.options];
  const cleaned = options.map((item) => String(item || "").trim()).filter(Boolean);
  return cleaned.length ? cleaned : [...DEFAULT_MCQ_FIELD.options];
};

const normalizeMcqOptions = (options) => {
  if (!Array.isArray(options) || options.length === 0) return [...DEFAULT_MCQ_FIELD.options];
  return options.map((item) => (item === undefined || item === null ? "" : String(item)));
};

const editableText = (value, fallback = "") =>
  value === undefined || value === null ? fallback : String(value);

const displayText = (value, fallback = "") => {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text || fallback;
};

const openNativePicker = (event) => {
  const input = event.currentTarget;
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // Some browsers only allow showPicker from direct user gestures.
  }
};

const normalizeMcqFields = (settings = {}) => {
  const fromNewShape = Array.isArray(settings.mcqFields) && settings.mcqFields.length > 0;
  const rawFields = fromNewShape
    ? settings.mcqFields
    : [
        {
          id: DEFAULT_MCQ_FIELD.id,
          label: settings.mcqLabel || DEFAULT_MCQ_FIELD.label,
          options: settings.mcqOptions || DEFAULT_MCQ_FIELD.options,
        },
      ];

  return rawFields.map((field, index) => ({
    id: String(field?.id || `mcq_${index + 1}`),
    label: editableText(field?.label ?? field?.mcqLabel, `Category ${index + 1}`),
    options: normalizeMcqOptions(field?.options ?? field?.mcqOptions),
  }));
};

const normalizeBlankFields = (settings = {}) => {
  const rawFields =
    Array.isArray(settings.blankFields) && settings.blankFields.length > 0
      ? settings.blankFields
      : [DEFAULT_BLANK_FIELD];

  return rawFields.map((field, index) => ({
    id: String(field?.id || `blank_${index + 1}`),
    label: editableText(field?.label, `Blank Field ${index + 1}`),
  }));
};

const normalizeSettings = (settings = {}) => {
  const mcqFields = normalizeMcqFields(settings);
  const blankFields = normalizeBlankFields(settings);
  const firstField = mcqFields[0] || DEFAULT_MCQ_FIELD;

  const normalized = {
    includeRoll: settings.includeRoll === undefined ? true : Boolean(settings.includeRoll),
    includeName: settings.includeName === undefined ? true : Boolean(settings.includeName),
    includeFeedback: settings.includeFeedback === undefined ? true : Boolean(settings.includeFeedback),
    includeMcq: settings.includeMcq === undefined ? true : Boolean(settings.includeMcq),
    includeBlankFields: settings.includeBlankFields === undefined ? false : Boolean(settings.includeBlankFields),
    includeTotal: settings.includeTotal === undefined ? false : Boolean(settings.includeTotal),
    mcqLabel: firstField.label,
    mcqOptions: firstField.options,
    mcqFields,
    blankFields,
  };

  return {
    ...normalized,
    columnOrder: normalizeColumnOrder(settings.columnOrder, normalized),
  };
};

const getRowMcqValue = (row, field, fieldIndex = 0) => {
  const selectedOptions = row?.selectedOptions || {};
  if (selectedOptions[field.id] !== undefined) return selectedOptions[field.id] || "";
  return fieldIndex === 0 ? row?.selectedOption || "" : "";
};

const getRowBlankValue = (row, field) => {
  const blankValues = row?.blankValues || {};
  return blankValues[field.id] !== undefined ? blankValues[field.id] || "" : "";
};

const formatTotalValue = (value) => {
  if (value === "") return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
};

const calculateBlankFieldsTotal = (row, fields = []) => {
  const values = fields
    .map((field) => String(getRowBlankValue(row, field) ?? "").trim())
    .filter(Boolean);

  if (values.length === 0) return { hasError: false, value: "" };

  const numbers = values.map((value) => Number(value));
  if (numbers.some((value) => Number.isNaN(value))) {
    return { hasError: true, value: "Please input number" };
  }

  return {
    hasError: false,
    value: formatTotalValue(numbers.reduce((sum, value) => sum + value, 0)),
  };
};


const COLUMN_IDS = {
  roll: "roll",
  name: "name",
  feedback: "feedback",
  total: "total",
};

const blankColumnId = (field) => `blank:${field.id}`;
const mcqColumnId = (field) => `mcq:${field.id}`;

const getAllMovableColumnIds = (settings = {}) => {
  const blankFields = Array.isArray(settings.blankFields) ? settings.blankFields : [];
  const mcqFields = Array.isArray(settings.mcqFields) ? settings.mcqFields : [];
  return [
    COLUMN_IDS.roll,
    COLUMN_IDS.name,
    ...blankFields.map(blankColumnId),
    ...mcqFields.map(mcqColumnId),
    COLUMN_IDS.feedback,
  ];
};

const normalizeColumnOrder = (order = [], settings = {}) => {
  const allIds = getAllMovableColumnIds(settings);
  const allowed = new Set(allIds);
  const seen = new Set();
  const savedOrder = Array.isArray(order) ? order : [];
  const normalized = savedOrder
    .map((item) => String(item || ""))
    .filter((id) => allowed.has(id) && !seen.has(id) && seen.add(id));
  return [...normalized, ...allIds.filter((id) => !seen.has(id))];
};

const buildVisibleColumns = (settings = {}) => {
  const blankFields = Array.isArray(settings.blankFields) ? settings.blankFields : [];
  const mcqFields = Array.isArray(settings.mcqFields) ? settings.mcqFields : [];
  const allColumns = [];

  if (settings.includeRoll) {
    allColumns.push({ id: COLUMN_IDS.roll, type: "roll", label: "Roll", minWidth: "min-w-32" });
  }
  if (settings.includeName) {
    allColumns.push({ id: COLUMN_IDS.name, type: "name", label: "Name", minWidth: "min-w-56" });
  }
  if (settings.includeBlankFields) {
    blankFields.forEach((field, fieldIndex) => {
      allColumns.push({
        id: blankColumnId(field),
        type: "blank",
        label: displayText(field.label, `Blank Field ${fieldIndex + 1}`),
        field,
        fieldIndex,
        minWidth: "min-w-44",
      });
    });
  }
  if (settings.includeMcq) {
    mcqFields.forEach((field, fieldIndex) => {
      allColumns.push({
        id: mcqColumnId(field),
        type: "mcq",
        label: displayText(field.label, `Category ${fieldIndex + 1}`),
        field,
        fieldIndex,
        minWidth: "min-w-52",
      });
    });
  }
  if (settings.includeFeedback) {
    allColumns.push({ id: COLUMN_IDS.feedback, type: "feedback", label: "Feedback / Comments", minWidth: "min-w-[320px]" });
  }

  const byId = new Map(allColumns.map((column) => [column.id, column]));
  const ordered = normalizeColumnOrder(settings.columnOrder, settings)
    .map((id) => byId.get(id))
    .filter(Boolean);

  if (settings.includeTotal) {
    ordered.push({ id: COLUMN_IDS.total, type: "total", label: "Total", minWidth: "min-w-40", locked: true });
  }

  return ordered;
};

const getColumnExportValue = (column, row, settings) => {
  if (column.type === "roll") return row.roll || "";
  if (column.type === "name") return row.name || "";
  if (column.type === "blank") return getRowBlankValue(row, column.field);
  if (column.type === "mcq") return getRowMcqValue(row, column.field, column.fieldIndex);
  if (column.type === "feedback") return row.feedback || "";
  if (column.type === "total") {
    return calculateBlankFieldsTotal(row, settings.includeBlankFields ? settings.blankFields : []).value || "";
  }
  return "";
};

const todayInput = () => new Date().toISOString().slice(0, 10);
const timeInput = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const getNoteId = (note) => note?._id || note?.id;

const formatCourseLabel = (course) => {
  if (!course) return "No course selected";
  const code = course.code || "Course";
  const title = course.title ? ` - ${course.title}` : "";
  const section = course.section ? ` (${course.section})` : "";
  return `${code}${title}${section}`;
};

const buildSavePayload = (note) => ({
  title: note?.title || "Untitled",
  date: note?.date || todayInput(),
  time: note?.time || timeInput(),
  settings: normalizeSettings(note?.settings || {}),
  evaluationRows: Array.isArray(note?.evaluationRows) ? note.evaluationRows : [],
  content: note?.content || "",
});

const serializeNote = (note) => JSON.stringify(buildSavePayload(note));

const stripHtml = (html = "") =>
  String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const safeFileName = (value = "notebook") =>
  String(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "notebook";

export default function TeacherNotebookPage() {
  const [notes, setNotes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [refreshingStudents, setRefreshingStudents] = useState(false);

  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [notesData, courseData] = await Promise.all([
        fetchNotebookNotes(),
        fetchTeacherCourses({ archived: false }),
      ]);
      setNotes(Array.isArray(notesData) ? notesData : []);
      setCourses(Array.isArray(courseData) ? courseData : []);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load notebook data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedNote) return undefined;

    const currentSerialized = serializeNote(selectedNote);
    if (currentSerialized === lastSavedRef.current) return undefined;

    setSaveStatus("Unsaved changes");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const noteId = getNoteId(selectedNote);
      if (!noteId) return;

      try {
        setSaveStatus("Saving...");
        const payload = buildSavePayload(selectedNote);
        const saved = await updateNotebookNote(noteId, payload);
        lastSavedRef.current = serializeNote(saved);
        setSaveStatus("Saved");
        setNotes((prev) =>
          prev.map((item) => (getNoteId(item) === noteId ? { ...item, ...saved } : item))
        );
      } catch (err) {
        console.error(err);
        setSaveStatus("Save failed");
      }
    }, 900);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [selectedNote]);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((note) => {
      const type = note.type || "simple";
      const matchesType = typeFilter === "all" ? true : type === typeFilter;
      const courseLabel = formatCourseLabel(note.course).toLowerCase();
      const matchesQuery =
        !q ||
        (note.title || "").toLowerCase().includes(q) ||
        (TYPE_LABELS[type] || type).toLowerCase().includes(q) ||
        courseLabel.includes(q) ||
        (note.date || "").toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [notes, query, typeFilter]);

  const openNote = async (note) => {
    const noteId = getNoteId(note);
    if (!noteId) return;
    try {
      setOpeningId(noteId);
      const fullNote = await fetchNotebookNoteById(noteId);
      setSelectedNote(fullNote);
      lastSavedRef.current = serializeNote(fullNote);
      setSaveStatus("Saved");
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Could not open note",
        text: err?.response?.data?.message || "Please try again.",
        icon: "error",
      });
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
    if (!noteId) return;

    const result = await Swal.fire({
      title: "Delete this note?",
      text: `${note.title || "Untitled"} will be permanently deleted.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    try {
      await deleteNotebookNote(noteId);
      setNotes((prev) => prev.filter((item) => getNoteId(item) !== noteId));
      if (getNoteId(selectedNote) === noteId) {
        setSelectedNote(null);
        lastSavedRef.current = "";
      }
      Swal.fire({
        title: "Deleted",
        text: "The note has been removed.",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Delete failed",
        text: err?.response?.data?.message || "Please try again.",
        icon: "error",
      });
    }
  };

  const handleRefreshStudents = async () => {
    const noteId = getNoteId(selectedNote);
    if (!noteId || selectedNote?.type !== "evaluation") return;

    try {
      setRefreshingStudents(true);
      const currentSerialized = serializeNote(selectedNote);

      if (currentSerialized !== lastSavedRef.current) {
        setSaveStatus("Saving...");
        const savedNote = await updateNotebookNote(noteId, buildSavePayload(selectedNote));
        lastSavedRef.current = serializeNote(savedNote);
        setSaveStatus("Saved");
      }

      const result = await refreshNotebookStudents(noteId);
      const refreshedNote = result?.note || result;
      if (refreshedNote) {
        setSelectedNote(refreshedNote);
        lastSavedRef.current = serializeNote(refreshedNote);
        setNotes((prev) =>
          prev.map((item) => (getNoteId(item) === noteId ? { ...item, ...refreshedNote } : item))
        );
      }

      Swal.fire({
        title: result?.addedCount > 0 ? "Student data refreshed" : "Already up to date",
        text:
          result?.addedCount > 0
            ? `${result.addedCount} new student${result.addedCount === 1 ? "" : "s"} added. Existing marks, comments, and selections were kept unchanged.`
            : "No new enrolled student was found for this course.",
        icon: "success",
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Refresh failed",
        text: err?.response?.data?.message || "Please try again.",
        icon: "error",
      });
    } finally {
      setRefreshingStudents(false);
    }
  };

  const updateSelectedNote = (updater) => {
    setSelectedNote((prev) => {
      if (!prev) return prev;
      const patch = typeof updater === "function" ? updater(prev) : updater;
      return { ...prev, ...patch };
    });
  };

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-8 h-44 w-44 rounded-full bg-violet-200/40 blur-3xl dark:bg-violet-500/10" />
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-500/10" />
        </div>

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              <NotebookSmallIcon />
              Teacher Notebook
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Notebook & Evaluation Sheets
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Create personal class notes, quick evaluation sheets, category-based feedback records, and export them when needed.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700"
          >
            <PlusIcon />
            Create Note
          </button>
        </div>
      </section>

      {selectedNote ? (
        <NotebookEditor
          note={selectedNote}
          courses={courses}
          saveStatus={saveStatus}
          onBack={() => setSelectedNote(null)}
          onChange={updateSelectedNote}
          onDelete={() => handleDelete(selectedNote)}
          onRefreshStudents={handleRefreshStudents}
          refreshingStudents={refreshingStudents}
        />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white">Your Notes</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Showing {filteredNotes.length} of {notes.length}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_180px] lg:w-[620px]">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <SearchIcon />
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by title, course, type, date..."
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-violet-500"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none transition focus:border-violet-400 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-violet-500"
                >
                  <option value="all">All Templates</option>
                  <option value="evaluation">Evaluation</option>
                  <option value="simple">Simple Notes</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading notebook...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm font-semibold text-red-600 dark:text-red-400">{error}</div>
          ) : filteredNotes.length === 0 ? (
            <EmptyNotebook onCreate={() => setShowCreateModal(true)} />
          ) : (
            <div className="overflow-hidden">
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/70">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3 font-black">Title</th>
                      <th className="px-4 py-3 font-black">Type</th>
                      <th className="px-4 py-3 font-black">Course</th>
                      <th className="px-4 py-3 font-black">Date</th>
                      <th className="px-4 py-3 font-black">Updated</th>
                      <th className="px-4 py-3 text-right font-black">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredNotes.map((note) => (
                      <NoteRow
                        key={getNoteId(note)}
                        note={note}
                        openingId={openingId}
                        onOpen={() => openNote(note)}
                        onDelete={() => handleDelete(note)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-4 lg:hidden">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={getNoteId(note)}
                    note={note}
                    openingId={openingId}
                    onOpen={() => openNote(note)}
                    onDelete={() => handleDelete(note)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {showCreateModal && (
        <CreateNotebookModal
          courses={courses}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function NoteRow({ note, openingId, onOpen, onDelete }) {
  const noteId = getNoteId(note);
  return (
    <tr
      onClick={onOpen}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer text-sm transition hover:bg-slate-50/80 focus:bg-slate-50/80 focus:outline-none dark:hover:bg-slate-900/60 dark:focus:bg-slate-900/60"
    >
      <td className="px-4 py-4">
        <div className="font-black text-slate-950 dark:text-white">{note.title || "Untitled"}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{note.time || "--:--"}</div>
      </td>
      <td className="px-4 py-4">
        <TypeBadge type={note.type} />
      </td>
      <td className="max-w-sm px-4 py-4 text-slate-600 dark:text-slate-300">
        <span className="line-clamp-2">{formatCourseLabel(note.course)}</span>
      </td>
      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{note.date || "-"}</td>
      <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{formatDateTime(note.updatedAt)}</td>
      <td className="px-4 py-4">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="rounded-xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
          >
            {openingId === noteId ? "Opening..." : "Open"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function NoteCard({ note, openingId, onOpen, onDelete }) {
  const noteId = getNoteId(note);
  return (
    <div
      onClick={onOpen}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-3xl border border-slate-200 bg-slate-50 p-4 transition hover:border-violet-200 hover:bg-white focus:border-violet-300 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-violet-500/40 dark:hover:bg-slate-900 dark:focus:border-violet-500/40 dark:focus:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-slate-950 dark:text-white">{note.title || "Untitled"}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatCourseLabel(note.course)}</p>
        </div>
        <TypeBadge type={note.type} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>{note.date || "No date"}</span>
        <span>•</span>
        <span>{formatDateTime(note.updatedAt)}</span>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex-1 rounded-2xl bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-700"
        >
          {openingId === noteId ? "Opening..." : "Open"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-2xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function EmptyNotebook({ onCreate }) {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
        <NotebookSmallIcon />
      </div>
      <h3 className="mt-4 text-lg font-black text-slate-950 dark:text-white">No notes yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Create an evaluation sheet or a simple note to start keeping your class records in one place.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700"
      >
        <PlusIcon />
        Create First Note
      </button>
    </div>
  );
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
  const [createSettingsOpen, setCreateSettingsOpen] = useState(false);

  const previousTypeRef = useRef(type);

  useEffect(() => {
    if (previousTypeRef.current === type) return;
    if (type === "simple" && title === "Random Mark Evaluation") setTitle("Class Note");
    if (type === "evaluation" && title === "Class Note") setTitle("Random Mark Evaluation");
    previousTypeRef.current = type;
  }, [type, title]);

  const updateSetting = (key, value) => {
    setSettings((prev) => normalizeSettings({ ...prev, [key]: value }));
  };

  const updateMcqField = (fieldId, patch) => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      const mcqFields = normalized.mcqFields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field
      );
      return { ...normalized, mcqFields };
    });
  };

  const updateOption = (fieldId, optionIndex, value) => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      const mcqFields = normalized.mcqFields.map((field) => {
        if (field.id !== fieldId) return field;
        return {
          ...field,
          options: field.options.map((item, i) => (i === optionIndex ? value : item)),
        };
      });
      return { ...normalized, mcqFields };
    });
  };

  const addOption = (fieldId) => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      const mcqFields = normalized.mcqFields.map((field) => {
        if (field.id !== fieldId) return field;
        return {
          ...field,
          options: [...field.options, `Option ${field.options.length + 1}`],
        };
      });
      return { ...normalized, mcqFields };
    });
  };

  const removeOption = (fieldId, optionIndex) => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      const mcqFields = normalized.mcqFields.map((field) => {
        if (field.id !== fieldId) return field;
        return {
          ...field,
          options: field.options.filter((_, i) => i !== optionIndex),
        };
      });
      return normalizeSettings({ ...normalized, mcqFields });
    });
  };

  const addMcqField = () => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      const nextIndex = normalized.mcqFields.length + 1;
      return normalizeSettings({
        ...normalized,
        mcqFields: [...normalized.mcqFields, makeMcqField(nextIndex)],
      });
    });
  };

  const removeMcqField = (fieldId) => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      return normalizeSettings({
        ...normalized,
        mcqFields: normalized.mcqFields.filter((field) => field.id !== fieldId),
      });
    });
  };

  const updateBlankField = (fieldId, patch) => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      const blankFields = normalized.blankFields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field
      );
      return { ...normalized, blankFields };
    });
  };

  const addBlankField = () => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      const nextIndex = normalized.blankFields.length + 1;
      return normalizeSettings({
        ...normalized,
        blankFields: [...normalized.blankFields, makeBlankField(nextIndex)],
      });
    });
  };

  const removeBlankField = (fieldId) => {
    setSettings((prev) => {
      const normalized = normalizeSettings(prev);
      return normalizeSettings({
        ...normalized,
        blankFields: normalized.blankFields.filter((field) => field.id !== fieldId),
      });
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setCreateError("");

    if (!title.trim()) {
      setCreateError("Please give a name for the note.");
      return;
    }

    if (type === "evaluation" && !courseId) {
      setCreateError("Please select a course for the evaluation sheet.");
      return;
    }

    const normalizedSettings = normalizeSettings(settings);
    const cleanMcqFields = normalizedSettings.mcqFields.map((field, index) => ({
      id: field.id || `mcq_${index + 1}`,
      label: String(field.label || `Category ${index + 1}`).trim() || `Category ${index + 1}`,
      options: cleanMcqOptions(field.options),
    }));
    const cleanBlankFields = normalizedSettings.blankFields.map((field, index) => ({
      id: field.id || `blank_${index + 1}`,
      label: String(field.label || `Blank Field ${index + 1}`).trim() || `Blank Field ${index + 1}`,
    }));

    if (type === "evaluation" && normalizedSettings.includeMcq && cleanMcqFields.length === 0) {
      setCreateError("Please add at least one MCQ/category column.");
      return;
    }

    try {
      setCreating(true);
      await onCreate({
        type,
        title: title.trim(),
        courseId: courseId || null,
        date,
        time,
        settings: normalizeSettings({
          ...normalizedSettings,
          mcqFields: cleanMcqFields,
          blankFields: cleanBlankFields,
        }),
        content: type === "simple" ? "" : undefined,
      });
    } catch (err) {
      console.error(err);
      setCreateError(err?.response?.data?.message || "Failed to create note.");
    } finally {
      setCreating(false);
    }
  };

  const normalizedSettings = normalizeSettings(settings);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Create New Note</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose a template and customize it.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Close
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <TemplateButton
              active={type === "evaluation"}
              title="Evaluation Sheet"
              subtitle="Course-wise roll, blank marks/text columns, dropdowns and feedback table"
              onClick={() => setType("evaluation")}
            />
            <TemplateButton
              active={type === "simple"}
              title="Simple Note"
              subtitle="Free writing space with basic formatting"
              onClick={() => setType("simple")}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Note / Template Name">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-soft"
                placeholder="Example: CT Feedback Sheet"
              />
            </Field>

            <Field label={type === "evaluation" ? "Course" : "Course (optional)"}>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="input-soft">
                <option value="">Select course</option>
                {courses.map((course) => (
                  <option key={course.id || course._id} value={course.id || course._id}>
                    {formatCourseLabel(course)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Date">
              <input type="date" value={date} onClick={openNativePicker} onFocus={openNativePicker} onChange={(e) => setDate(e.target.value)} className="input-soft" />
            </Field>

            <Field label="Time">
              <input type="time" value={time} onClick={openNativePicker} onFocus={openNativePicker} onChange={(e) => setTime(e.target.value)} className="input-soft" />
            </Field>
          </div>

          {type === "evaluation" && (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <button
                type="button"
                onClick={() => setCreateSettingsOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">Evaluation Sheet Fields</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:hidden">
                    Tap to {createSettingsOpen ? "hide" : "show"} roll, category, feedback and MCQ column options.
                  </p>
                </div>
                <span className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {createSettingsOpen ? "Hide" : "Show"}
                </span>
              </button>

              <div className={`${createSettingsOpen ? "mt-4 block" : "hidden"} sm:mt-4 sm:block`}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CheckboxField
                    checked={normalizedSettings.includeRoll}
                    label="Roll Number"
                    onChange={(value) => updateSetting("includeRoll", value)}
                  />
                  <CheckboxField
                    checked={normalizedSettings.includeName}
                    label="Student Name"
                    onChange={(value) => updateSetting("includeName", value)}
                  />
                  <CheckboxField
                    checked={normalizedSettings.includeFeedback}
                    label="Feedback / Comments"
                    onChange={(value) => updateSetting("includeFeedback", value)}
                  />
                  <CheckboxField
                    checked={normalizedSettings.includeTotal}
                    label="Total"
                    onChange={(value) => updateSetting("includeTotal", value)}
                  />
                  <CheckboxField
                    checked={normalizedSettings.includeBlankFields}
                    label="Blank Fields / Marks/Text"
                    onChange={(value) => updateSetting("includeBlankFields", value)}
                  />
                  <CheckboxField
                    checked={normalizedSettings.includeMcq}
                    label="MCQ / Category Dropdown"
                    onChange={(value) => updateSetting("includeMcq", value)}
                  />
                </div>

                {normalizedSettings.includeBlankFields && (
                  <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-black text-slate-950 dark:text-white">Blank Fields / Marks/Text Columns</h4>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Add columns where the teacher can type marks, digits, short notes, or any value.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addBlankField}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
                      >
                        <PlusIcon /> Add Blank Field
                      </button>
                    </div>

                    {normalizedSettings.blankFields.map((field, fieldIndex) => (
                      <div key={field.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <Field label={`Blank Field ${fieldIndex + 1} Column Name`}>
                              <input
                                value={field.label}
                                onChange={(e) => updateBlankField(field.id, { label: e.target.value })}
                                className="input-soft"
                                placeholder={`Blank Field ${fieldIndex + 1}`}
                              />
                            </Field>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeBlankField(field.id)}
                            disabled={normalizedSettings.blankFields.length <= 1}
                            className="rounded-2xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300 sm:mt-6"
                          >
                            Remove Field
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {normalizedSettings.includeMcq && (
                  <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-black text-slate-950 dark:text-white">MCQ / Category Columns</h4>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Add multiple dropdown columns. Each column can have different options.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addMcqField}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
                      >
                        <PlusIcon /> Add MCQ Column
                      </button>
                    </div>

                    {normalizedSettings.mcqFields.map((field, fieldIndex) => (
                      <div key={field.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <Field label={`Column ${fieldIndex + 1} Name`}>
                              <input
                                value={field.label}
                                onChange={(e) => updateMcqField(field.id, { label: e.target.value })}
                                className="input-soft"
                                placeholder={`Category ${fieldIndex + 1}`}
                              />
                            </Field>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMcqField(field.id)}
                            disabled={normalizedSettings.mcqFields.length <= 1}
                            className="rounded-2xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300 sm:mt-6"
                          >
                            Remove Column
                          </button>
                        </div>

                        <div className="mt-3 space-y-2">
                          <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Options
                          </div>
                          {field.options.map((option, optionIndex) => (
                            <div key={`${field.id}-option-${optionIndex}`} className="flex gap-2">
                              <input
                                value={option}
                                onChange={(e) => updateOption(field.id, optionIndex, e.target.value)}
                                className="input-soft"
                              />
                              <button
                                type="button"
                                onClick={() => removeOption(field.id, optionIndex)}
                                disabled={field.options.length <= 1}
                                className="rounded-2xl border border-red-200 px-3 text-xs font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addOption(field.id)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
                          >
                            <PlusIcon /> Add Option
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {createError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {createError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create & Open"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NotebookEditor({ note, courses, saveStatus, onBack, onChange, onDelete, onRefreshStudents, refreshingStudents }) {
  const type = note.type || "simple";
  const selectedCourse = note.course || courses.find((c) => (c.id || c._id) === (note.courseId || note.course));

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              ← Back to list
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={type} />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                {saveStatus}
              </span>
            </div>

            <input
              value={note.title || ""}
              onChange={(e) => onChange({ title: e.target.value })}
              className="mt-3 w-full rounded-2xl border border-transparent bg-transparent px-0 text-2xl font-black tracking-tight text-slate-950 outline-none focus:border-violet-300 focus:bg-slate-50 focus:px-3 dark:text-white dark:focus:border-violet-500/50 dark:focus:bg-slate-900 sm:text-3xl"
              placeholder="Untitled note"
            />
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatCourseLabel(selectedCourse)}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:items-center">
            <input
              type="date"
              value={note.date || todayInput()}
              onClick={openNativePicker}
              onFocus={openNativePicker}
              onChange={(e) => onChange({ date: e.target.value })}
              className="input-soft sm:w-40"
            />
            <input
              type="time"
              value={note.time || timeInput()}
              onClick={openNativePicker}
              onFocus={openNativePicker}
              onChange={(e) => onChange({ time: e.target.value })}
              className="input-soft sm:w-32"
            />
            {type === "evaluation" ? (
              <>
                <button
                  type="button"
                  onClick={onRefreshStudents}
                  disabled={refreshingStudents}
                  className="btn-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshingStudents ? "Refreshing..." : "Refresh Students"}
                </button>
                <button type="button" onClick={() => exportEvaluationExcel(note)} className="btn-soft">
                  Excel
                </button>
                <button type="button" onClick={() => exportEvaluationPdf(note)} className="btn-soft">
                  PDF
                </button>
                <button type="button" onClick={() => printEvaluationPdf(note)} className="btn-soft">
                  Print
                </button>
              </>
            ) : (
              <button type="button" onClick={() => exportSimplePdf(note)} className="btn-soft">
                Export PDF
              </button>
            )}
            <button type="button" onClick={onDelete} className="btn-danger">
              Delete
            </button>
          </div>
        </div>
      </div>

      {type === "evaluation" ? (
        <EvaluationEditor note={note} onChange={onChange} />
      ) : (
        <SimpleNoteEditor note={note} onChange={onChange} />
      )}
    </section>
  );
}

function EvaluationEditor({ note, onChange }) {
  const settings = normalizeSettings(note.settings || {});
  const rows = Array.isArray(note.evaluationRows) ? note.evaluationRows : [];
  const mcqFields = settings.mcqFields || [];
  const blankFields = settings.blankFields || [];
  const visibleColumns = buildVisibleColumns(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowSearch, setRowSearch] = useState("");

  const updateRow = (index, patch) => {
    const nextRows = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange({ evaluationRows: nextRows });
  };

  const updateRowMcq = (rowIndex, field, fieldIndex, value) => {
    const row = rows[rowIndex] || {};
    const selectedOptions = { ...(row.selectedOptions || {}) };
    selectedOptions[field.id] = value;

    updateRow(rowIndex, {
      selectedOptions,
      selectedOption: fieldIndex === 0 ? value : row.selectedOption || "",
    });
  };

  const updateRowBlank = (rowIndex, field, value) => {
    const row = rows[rowIndex] || {};
    const blankValues = { ...(row.blankValues || {}) };
    blankValues[field.id] = value;
    updateRow(rowIndex, { blankValues });
  };

  const updateSetting = (key, value) => {
    onChange({ settings: normalizeSettings({ ...settings, [key]: value }) });
  };

  const updateMcqField = (fieldId, patch) => {
    const nextFields = mcqFields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field));
    onChange({ settings: normalizeSettings({ ...settings, mcqFields: nextFields }) });
  };

  const updateOption = (fieldId, index, value) => {
    const nextFields = mcqFields.map((field) => {
      if (field.id !== fieldId) return field;
      return {
        ...field,
        options: field.options.map((option, i) => (i === index ? value : option)),
      };
    });
    onChange({ settings: normalizeSettings({ ...settings, mcqFields: nextFields }) });
  };

  const addOption = (fieldId) => {
    const nextFields = mcqFields.map((field) => {
      if (field.id !== fieldId) return field;
      return {
        ...field,
        options: [...field.options, `Option ${field.options.length + 1}`],
      };
    });
    onChange({ settings: normalizeSettings({ ...settings, mcqFields: nextFields }) });
  };

  const removeOption = (fieldId, optionIndex) => {
    const targetField = mcqFields.find((field) => field.id === fieldId);
    const optionToRemove = targetField?.options?.[optionIndex];
    const nextFields = mcqFields.map((field) => {
      if (field.id !== fieldId) return field;
      return {
        ...field,
        options: field.options.filter((_, i) => i !== optionIndex),
      };
    });
    const nextRows = rows.map((row) => {
      const selectedOptions = { ...(row.selectedOptions || {}) };
      if (selectedOptions[fieldId] === optionToRemove) selectedOptions[fieldId] = "";
      const firstField = nextFields[0];
      const firstValue = firstField ? selectedOptions[firstField.id] || "" : "";
      return {
        ...row,
        selectedOptions,
        selectedOption: firstValue,
      };
    });
    onChange({ settings: normalizeSettings({ ...settings, mcqFields: nextFields }), evaluationRows: nextRows });
  };

  const addMcqField = () => {
    const nextField = makeMcqField(mcqFields.length + 1);
    onChange({ settings: normalizeSettings({ ...settings, mcqFields: [...mcqFields, nextField] }) });
  };

  const removeMcqField = (fieldId) => {
    const nextFields = mcqFields.filter((field) => field.id !== fieldId);
    const nextRows = rows.map((row) => {
      const selectedOptions = { ...(row.selectedOptions || {}) };
      delete selectedOptions[fieldId];
      const firstField = nextFields[0];
      return {
        ...row,
        selectedOptions,
        selectedOption: firstField ? selectedOptions[firstField.id] || "" : "",
      };
    });
    onChange({ settings: normalizeSettings({ ...settings, mcqFields: nextFields }), evaluationRows: nextRows });
  };

  const updateBlankField = (fieldId, patch) => {
    const nextFields = blankFields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field));
    onChange({ settings: normalizeSettings({ ...settings, blankFields: nextFields }) });
  };

  const addBlankField = () => {
    const nextField = makeBlankField(blankFields.length + 1);
    onChange({ settings: normalizeSettings({ ...settings, blankFields: [...blankFields, nextField] }) });
  };

  const removeBlankField = (fieldId) => {
    const nextFields = blankFields.filter((field) => field.id !== fieldId);
    const nextRows = rows.map((row) => {
      const blankValues = { ...(row.blankValues || {}) };
      delete blankValues[fieldId];
      return { ...row, blankValues };
    });
    onChange({ settings: normalizeSettings({ ...settings, blankFields: nextFields }), evaluationRows: nextRows });
  };

  const reorderColumns = (activeId, overId) => {
    if (!activeId || !overId || activeId === overId || activeId === COLUMN_IDS.total || overId === COLUMN_IDS.total) return;
    const currentOrder = normalizeColumnOrder(settings.columnOrder, settings);
    const activeIndex = currentOrder.indexOf(activeId);
    const overIndex = currentOrder.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0) return;
    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(activeIndex, 1);
    nextOrder.splice(overIndex, 0, moved);
    onChange({ settings: normalizeSettings({ ...settings, columnOrder: nextOrder }) });
  };

  const moveColumnByStep = (columnId, step) => {
    const currentOrder = normalizeColumnOrder(settings.columnOrder, settings);
    const currentIndex = currentOrder.indexOf(columnId);
    const nextIndex = currentIndex + step;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) return;
    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, moved);
    onChange({ settings: normalizeSettings({ ...settings, columnOrder: nextOrder }) });
  };

  const filteredRows = (() => {
    const term = rowSearch.trim().toLowerCase();
    const withIndex = rows.map((row, rowIndex) => ({ row, rowIndex }));
    if (!term) return withIndex;

    return withIndex.filter(({ row }) => {
      const selectedValues = mcqFields.map((field, fieldIndex) => getRowMcqValue(row, field, fieldIndex)).join(" ");
      const blankValues = blankFields.map((field) => getRowBlankValue(row, field)).join(" ");
      const totalValue = calculateBlankFieldsTotal(row, settings.includeBlankFields ? blankFields : []).value;
      return [row.roll, row.name, row.feedback, selectedValues, blankValues, totalValue]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  })();

  const visibleColumnCount = 1 + visibleColumns.length;

  const renderCell = (column, row, rowIndex) => {
    if (column.type === "roll") {
      return (
        <td key={column.id} className="min-w-32 px-4 py-3 font-bold text-slate-700 dark:text-slate-200">
          {row.roll || "-"}
        </td>
      );
    }

    if (column.type === "name") {
      return (
        <td key={column.id} className="min-w-56 px-4 py-3 text-slate-700 dark:text-slate-200">
          {row.name || "-"}
        </td>
      );
    }

    if (column.type === "blank") {
      return (
        <td key={column.id} className="px-4 py-3">
          <input
            value={getRowBlankValue(row, column.field)}
            onChange={(e) => updateRowBlank(rowIndex, column.field, e.target.value)}
            placeholder="Write value..."
            inputMode="decimal"
            className="input-soft min-w-40"
          />
        </td>
      );
    }

    if (column.type === "mcq") {
      return (
        <td key={column.id} className="px-4 py-3">
          <select
            value={getRowMcqValue(row, column.field, column.fieldIndex)}
            onChange={(e) => updateRowMcq(rowIndex, column.field, column.fieldIndex, e.target.value)}
            className="input-soft min-w-44"
          >
            <option value="">Select</option>
            {column.field.options.map((option, optionIndex) => (
              <option key={`${column.field.id}-${option}-${optionIndex}`} value={option}>
                {displayText(option, `Option ${optionIndex + 1}`)}
              </option>
            ))}
          </select>
        </td>
      );
    }

    if (column.type === "feedback") {
      return (
        <td key={column.id} className="px-4 py-3">
          <textarea
            value={row.feedback || ""}
            onChange={(e) => updateRow(rowIndex, { feedback: e.target.value })}
            rows={2}
            placeholder="Write feedback..."
            className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-violet-500"
          />
        </td>
      );
    }

    if (column.type === "total") {
      const total = calculateBlankFieldsTotal(row, settings.includeBlankFields ? blankFields : []);
      return (
        <td key={column.id} className="px-4 py-3">
          <div
            className={`min-w-36 rounded-2xl border px-3 py-2 text-sm font-black ${
              total.hasError
                ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            }`}
          >
            {total.value || "-"}
          </div>
        </td>
      );
    }

    return null;
  };

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <button
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-white">Sheet Settings</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Add columns, reorder visible columns, and change sheet fields whenever needed.
            </p>
          </div>
          <span className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {settingsOpen ? "Hide" : "Show"}
          </span>
        </button>

        <div className={`${settingsOpen ? "mt-4 block" : "hidden"}`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <CheckboxField checked={settings.includeRoll} label="Roll" onChange={(v) => updateSetting("includeRoll", v)} />
            <CheckboxField checked={settings.includeName} label="Name" onChange={(v) => updateSetting("includeName", v)} />
            <CheckboxField checked={settings.includeBlankFields} label="Blank Fields" onChange={(v) => updateSetting("includeBlankFields", v)} />
            <CheckboxField checked={settings.includeMcq} label="Category" onChange={(v) => updateSetting("includeMcq", v)} />
            <CheckboxField checked={settings.includeFeedback} label="Feedback" onChange={(v) => updateSetting("includeFeedback", v)} />
            <CheckboxField checked={settings.includeTotal} label="Total" onChange={(v) => updateSetting("includeTotal", v)} />
          </div>

          <ColumnOrderManager
            columns={visibleColumns.filter((column) => !column.locked)}
            onReorder={reorderColumns}
            onMove={moveColumnByStep}
          />

          {settings.includeBlankFields && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-black text-slate-950 dark:text-white">Blank Fields / Marks/Text Columns</h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Current columns: {blankFields.length}. Numeric values will be added in Total; text will show “Please input number”.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addBlankField}
                  className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
                >
                  + Add Blank Field
                </button>
              </div>

              {blankFields.map((field, fieldIndex) => (
                <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                    <Field label={`Blank Field ${fieldIndex + 1} Column Name`}>
                      <input
                        value={field.label || ""}
                        onChange={(e) => updateBlankField(field.id, { label: e.target.value })}
                        className="input-soft"
                        placeholder={`Blank Field ${fieldIndex + 1}`}
                      />
                    </Field>

                    <button
                      type="button"
                      onClick={() => removeBlankField(field.id)}
                      disabled={blankFields.length <= 1}
                      className="rounded-2xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300"
                    >
                      Remove Field
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {settings.includeMcq && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-black text-slate-950 dark:text-white">MCQ / Category Columns</h4>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Current columns: {mcqFields.length}. You can add, remove, rename, and give different options to each one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addMcqField}
                  className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
                >
                  + Add MCQ Column
                </button>
              </div>

              {mcqFields.map((field, fieldIndex) => (
                <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="grid gap-3 lg:grid-cols-[260px_1fr_auto] lg:items-end">
                    <Field label={`Column ${fieldIndex + 1} Name`}>
                      <input
                        value={field.label || ""}
                        onChange={(e) => updateMcqField(field.id, { label: e.target.value })}
                        className="input-soft"
                        placeholder={`Category ${fieldIndex + 1}`}
                      />
                    </Field>

                    <div>
                      <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Options
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {field.options.map((option, optionIndex) => (
                          <div
                            key={`${field.id}-option-${optionIndex}`}
                            className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900/70"
                          >
                            <input
                              value={option}
                              onChange={(e) => updateOption(field.id, optionIndex, e.target.value)}
                              className="w-32 rounded-xl bg-transparent px-2 py-1 text-xs font-bold text-slate-700 outline-none dark:text-slate-200"
                              placeholder={`Option ${optionIndex + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(field.id, optionIndex)}
                              disabled={field.options.length <= 1}
                              className="rounded-xl px-2 py-1 text-xs font-black text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addOption(field.id)}
                          className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
                        >
                          + Option
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeMcqField(field.id)}
                      disabled={mcqFields.length <= 1}
                      className="rounded-2xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300"
                    >
                      Remove Column
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
        <div className="max-h-[70vh] overflow-auto overscroll-contain">
          <div className="sticky left-0 top-0 z-40 border-b border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <SearchIcon />
                </span>
                <input
                  value={rowSearch}
                  onChange={(e) => setRowSearch(e.target.value)}
                  placeholder="Search roll, name, blank fields, feedback, category..."
                  className="input-soft h-11 pl-10 text-sm"
                />
              </div>
              <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                {filteredRows.length}/{rows.length}
              </div>
            </div>
          </div>

          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="sticky top-[69px] z-30 bg-slate-50 dark:bg-slate-900/95">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="hidden w-14 px-4 py-3 font-black sm:table-cell">#</th>
                {visibleColumns.map((column) => (
                  <th key={column.id} className={`${column.minWidth || "min-w-44"} px-4 py-3 font-black`}>
                    {column.label}
                    {column.locked && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] dark:bg-slate-800">Auto</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No student found for this course.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No matching student found.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ row, rowIndex }, visibleIndex) => (
                  <tr key={row.student || `${row.roll}-${rowIndex}`} className="text-sm">
                    <td className="hidden px-4 py-3 text-xs font-black text-slate-400 sm:table-cell">{visibleIndex + 1}</td>
                    {visibleColumns.map((column) => renderCell(column, row, rowIndex))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ColumnOrderManager({ columns, onReorder, onMove }) {
  const [draggingId, setDraggingId] = useState(null);
  const activeIdRef = useRef(null);

  const finishDrag = () => {
    activeIdRef.current = null;
    setDraggingId(null);
  };

  const handlePointerMove = (event) => {
    const activeId = activeIdRef.current;
    if (!activeId) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest?.("[data-column-drop-id]");
    const overId = target?.getAttribute("data-column-drop-id");
    if (overId && overId !== activeId) {
      onReorder(activeId, overId);
    }
  };

  const handlePointerDown = (event, columnId) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activeIdRef.current = columnId;
    setDraggingId(columnId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleDragStart = (event, columnId) => {
    activeIdRef.current = columnId;
    setDraggingId(columnId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnId);
  };

  const handleDrop = (event, overId) => {
    event.preventDefault();
    const activeId = event.dataTransfer.getData("text/plain") || activeIdRef.current;
    onReorder(activeId, overId);
    finishDrag();
  };

  if (!columns.length) return null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-black text-slate-950 dark:text-white">Column Order</h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Drag the chips to rearrange sheet columns. On mobile, hold a chip and move it over another chip.
          </p>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
          Total stays last
        </span>
      </div>

      <div
        className="mt-3 flex flex-wrap gap-2"
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDragOver={(event) => event.preventDefault()}
      >
        {columns.map((column, index) => (
          <div
            key={column.id}
            data-column-drop-id={column.id}
            draggable
            onDragStart={(event) => handleDragStart(event, column.id)}
            onDragEnd={finishDrag}
            onDrop={(event) => handleDrop(event, column.id)}
            onPointerDown={(event) => handlePointerDown(event, column.id)}
            className={`flex touch-none select-none items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-black transition ${
              draggingId === column.id
                ? "scale-[1.03] border-violet-400 bg-violet-50 text-violet-800 shadow-lg dark:border-violet-500/50 dark:bg-violet-500/10 dark:text-violet-200"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            }`}
            title="Drag to move column"
          >
            <span className="text-slate-400">☰</span>
            <span>{column.label}</span>
            <div className="ml-1 flex gap-1">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(column.id, -1);
                }}
                disabled={index === 0}
                className="rounded-lg px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-white disabled:opacity-30 dark:hover:bg-slate-800"
                aria-label={`Move ${column.label} left`}
              >
                ←
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(column.id, 1);
                }}
                disabled={index === columns.length - 1}
                className="rounded-lg px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-white disabled:opacity-30 dark:hover:bg-slate-800"
                aria-label={`Move ${column.label} right`}
              >
                →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleNoteEditor({ note, onChange }) {
  const editorRef = useRef(null);
  const lastLoadedNoteIdRef = useRef(null);
  const savedRangeRef = useRef(null);

  useEffect(() => {
    const noteId = getNoteId(note);
    if (!editorRef.current || lastLoadedNoteIdRef.current === noteId) return;
    editorRef.current.innerHTML = note.content || "";
    lastLoadedNoteIdRef.current = noteId;
  }, [note]);

  const saveSelection = () => {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const selection = window.getSelection?.();
    if (!selection || !savedRangeRef.current) return;

    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
  };

  const syncContent = () => {
    onChange({ content: editorRef.current?.innerHTML || "" });
  };

  const runCommand = (command, value = null) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    saveSelection();
    syncContent();
  };

  const setFontSize = (size) => {
    const className = size === "large" ? "text-lg" : size === "small" ? "text-sm" : "text-base";
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("fontSize", false, "3");
    const fonts = editorRef.current?.querySelectorAll("font[size='3']") || [];
    fonts.forEach((font) => {
      const span = document.createElement("span");
      span.className = className;
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
    saveSelection();
    syncContent();
  };

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
        <ToolbarButton onClick={() => runCommand("bold")}>Bold</ToolbarButton>
        <ToolbarButton onClick={() => runCommand("insertUnorderedList")}>Bullets</ToolbarButton>
        <ToolbarButton onClick={() => runCommand("insertOrderedList")}>Numbers</ToolbarButton>
        <ToolbarButton onClick={() => setFontSize("small")}>Small</ToolbarButton>
        <ToolbarButton onClick={() => setFontSize("medium")}>Medium</ToolbarButton>
        <ToolbarButton onClick={() => setFontSize("large")}>Large</ToolbarButton>
      </div>

      <div
        ref={editorRef}
        key={getNoteId(note)}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => {
          saveSelection();
          onChange({ content: e.currentTarget.innerHTML });
        }}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onBlur={saveSelection}
        className="notebook-rich-editor min-h-[420px] rounded-3xl border border-slate-200 bg-white p-5 text-base leading-7 text-slate-800 outline-none transition focus:border-violet-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-violet-500"
        data-placeholder="Start writing your note here..."
      />
    </div>
  );
}

function buildEvaluationExport(note) {
  const settings = normalizeSettings(note.settings || {});
  const rows = Array.isArray(note.evaluationRows) ? note.evaluationRows : [];
  const columns = buildVisibleColumns(settings);
  const headers = columns.map((column) => column.label);
  const body = rows.map((row) => columns.map((column) => getColumnExportValue(column, row, settings)));
  return { settings, columns, headers, body, rows };
}

function exportEvaluationExcel(note) {
  const { columns, headers, body, rows } = buildEvaluationExport(note);
  const course = formatCourseLabel(note.course);
  const totalColumns = Math.max(headers.length, 1);
  const lastCol = totalColumns - 1;

  const data = [
    [note.title || "Evaluation Sheet"],
    ["Course", course, "Date", note.date || "-", "Time", note.time || "-"],
    ["Generated", new Date().toLocaleString(), "Total Students", String(rows.length)],
    [],
    headers,
    ...body,
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }];
  ws["!cols"] = columns.map((column) => {
    if (column.type === "feedback") return { wch: 44 };
    if (column.type === "name") return { wch: 28 };
    if (column.type === "roll") return { wch: 18 };
    if (column.type === "total") return { wch: 18 };
    return { wch: 22 };
  });
  ws["!rows"] = [{ hpt: 28 }, { hpt: 22 }, { hpt: 22 }, { hpt: 8 }, { hpt: 24 }];
  if (headers.length) {
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + body.length, c: lastCol } }) };
  }

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const border = {
    top: { style: "thin", color: { rgb: "CBD5E1" } },
    bottom: { style: "thin", color: { rgb: "CBD5E1" } },
    left: { style: "thin", color: { rgb: "CBD5E1" } },
    right: { style: "thin", color: { rgb: "CBD5E1" } },
  };

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].s = {
        font: { name: "Calibri", sz: 11, color: { rgb: "0F172A" } },
        alignment: { vertical: "center", wrapText: true },
      };
    }
  }

  for (let c = 0; c <= lastCol; c += 1) {
    const titleRef = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[titleRef]) ws[titleRef] = { t: "s", v: "" };
    ws[titleRef].s = {
      font: { name: "Calibri", sz: 18, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "312E81" } },
      alignment: { horizontal: c === 0 ? "left" : "center", vertical: "center" },
    };
  }

  [1, 2].forEach((r) => {
    for (let c = 0; c <= lastCol; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      ws[ref].s = {
        font: { name: "Calibri", sz: c % 2 === 0 ? 10 : 11, bold: c % 2 === 0, color: { rgb: c % 2 === 0 ? "475569" : "0F172A" } },
        fill: { fgColor: { rgb: "EEF2FF" } },
        alignment: { vertical: "center", wrapText: true },
        border,
      };
    }
  });

  headers.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r: 4, c });
    ws[ref].s = {
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "4338CA" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border,
    };
  });

  for (let r = 5; r <= range.e.r; r += 1) {
    for (let c = 0; c <= lastCol; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      ws[ref].s = {
        font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
        fill: { fgColor: { rgb: r % 2 === 0 ? "F8FAFC" : "FFFFFF" } },
        alignment: { vertical: "center", wrapText: true },
        border,
      };
    }
  }

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: note.title || "Evaluation Sheet",
    Subject: course,
    Author: "BUBT Marks Portal",
    CreatedDate: new Date(),
  };
  XLSX.utils.book_append_sheet(wb, ws, "Evaluation Sheet");
  XLSX.writeFile(wb, `${safeFileName(note.title)}.xlsx`);
}

function createEvaluationPdfDocument(note) {
  const { columns, headers, body, rows } = buildEvaluationExport(note);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  const course = formatCourseLabel(note.course);

  const drawHeader = () => {
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 78, "F");
    doc.setFillColor(79, 70, 229);
    doc.roundedRect(margin, 18, 96, 22, 11, 11, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("EVALUATION SHEET", margin + 13, 33);
    doc.setFontSize(18);
    doc.text(String(note.title || "Evaluation Sheet"), margin, 60, { maxWidth: pageWidth - margin * 2 });

    doc.setTextColor(71, 85, 105);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, 92, pageWidth - margin * 2, 44, 10, 10, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Course", margin + 14, 108);
    doc.text("Date", pageWidth - 210, 108);
    doc.text("Time", pageWidth - 118, 108);
    doc.text("Students", pageWidth - 58, 108, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(course, margin + 14, 126, { maxWidth: pageWidth - 330 });
    doc.text(note.date || "-", pageWidth - 210, 126);
    doc.text(note.time || "-", pageWidth - 118, 126);
    doc.text(String(rows.length), pageWidth - 58, 126, { align: "right" });
  };

  drawHeader();

  const columnStyles = columns.reduce((acc, column, index) => {
    if (column.type === "roll") acc[index] = { cellWidth: 72, fontStyle: "bold" };
    if (column.type === "name") acc[index] = { cellWidth: 120 };
    if (column.type === "feedback") acc[index] = { cellWidth: 170 };
    if (column.type === "total") acc[index] = { cellWidth: 70, halign: "center", fontStyle: "bold" };
    return acc;
  }, {});

  autoTable(doc, {
    startY: 152,
    head: [headers],
    body,
    margin: { top: 152, left: margin, right: margin, bottom: 42 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.4,
      cellPadding: { top: 6, right: 5, bottom: 6, left: 5 },
      overflow: "linebreak",
      lineColor: [226, 232, 240],
      lineWidth: 0.6,
      textColor: [15, 23, 42],
      valign: "middle",
    },
    headStyles: {
      fillColor: [67, 56, 202],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      lineColor: [67, 56, 202],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    willDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader();
    },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated from BUBT Marks Portal • ${new Date().toLocaleString()}`, margin, pageHeight - 20);
      doc.text(`Page ${data.pageNumber}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    },
  });

  return doc;
}

function exportEvaluationPdf(note) {
  createEvaluationPdfDocument(note).save(`${safeFileName(note.title)}.pdf`);
}

function printEvaluationPdf(note) {
  const doc = createEvaluationPdfDocument(note);
  doc.autoPrint({ variant: "non-conform" });
  const blobUrl = doc.output("bloburl");
  const printWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    doc.save(`${safeFileName(note.title)}_print.pdf`);
  }
}

function exportSimplePdf(note) {
  const doc = new jsPDF();
  const text = stripHtml(note.content || "");
  const lines = doc.splitTextToSize(text || "No content written.", 180);

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(note.title || "Simple Note", 14, 20);
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Course: ${formatCourseLabel(note.course)}`, 14, 42);
  doc.text(`Date: ${note.date || "-"}    Time: ${note.time || "-"}`, 14, 49);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(lines, 14, 62);
  doc.save(`${safeFileName(note.title)}.pdf`);
}

function TemplateButton({ active, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-3xl border p-4 text-left transition",
        active
          ? "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-100"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-900/70",
      ].join(" ")}
    >
      <div className="font-black">{title}</div>
      <div className="mt-1 text-xs opacity-80">{subtitle}</div>
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function CheckboxField({ checked, label, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-violet-600"
      />
      {label}
    </label>
  );
}

function TypeBadge({ type }) {
  const isEvaluation = type === "evaluation";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black",
        isEvaluation
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
      ].join(" ")}
    >
      {TYPE_LABELS[type] || "Simple Note"}
    </span>
  );
}

function ToolbarButton({ children, onClick }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function NotebookSmallIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
