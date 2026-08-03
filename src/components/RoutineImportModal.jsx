import { useMemo, useRef, useState } from "react";
import {
  OFFICIAL_DAYS,
  OFFICIAL_TIME_SLOTS,
  courseKey,
} from "../utils/routineConfig";
import {
  applyCourseSelection,
  readRoutineFile,
} from "../utils/routineImport";

function compactCourse(course = {}) {
  return [
    course.code,
    course.title,
    [course.intake, course.section].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function RoutineImportModal({ open, onClose, onApply, courses = [], routine }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [replaceClasses, setReplaceClasses] = useState(true);
  const [replaceOccupiedActivities, setReplaceOccupiedActivities] = useState(true);
  const [useDocumentTerm, setUseDocumentTerm] = useState(true);

  const courseOptions = useMemo(() => {
    const semester = String(result?.semester || routine?.semester || "").toLowerCase();
    const year = Number(result?.year || routine?.year);
    return [...courses].sort((a, b) => {
      const aPreferred = String(a.semester || "").toLowerCase() === semester && Number(a.year) === year;
      const bPreferred = String(b.semester || "").toLowerCase() === semester && Number(b.year) === year;
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
      return compactCourse(a).localeCompare(compactCourse(b), undefined, { numeric: true });
    });
  }, [courses, result, routine]);

  const reset = () => {
    setFile(null);
    setProcessing(false);
    setProgress(0);
    setStatus("");
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const closeModal = () => {
    if (processing) return;
    reset();
    onClose();
  };

  const processFile = async () => {
    if (!file) {
      setError("Choose a routine PDF or image first.");
      return;
    }
    setProcessing(true);
    setError("");
    setResult(null);
    setProgress(0.02);
    try {
      const parsed = await readRoutineFile(file, {
        courses,
        currentSemester: routine?.semester,
        currentYear: routine?.year,
        onProgress: (update) => {
          setProgress(Number(update?.progress || 0));
          setStatus(update?.status || "Reading routine...");
        },
      });
      setResult(parsed);
    } catch (readError) {
      console.error("Routine import failed:", readError);
      setError(readError?.message || "The routine could not be read.");
    } finally {
      setProcessing(false);
    }
  };

  const updateRecord = (id, patch) => {
    setResult((previous) => ({
      ...previous,
      records: previous.records.map((record) =>
        record.id === id ? { ...record, ...patch } : record
      ),
    }));
  };

  const selectCourse = (record, courseId) => {
    const updated = applyCourseSelection(record, courseId, courses);
    updateRecord(record.id, updated);
  };

  const removeRecord = (id) => {
    setResult((previous) => ({
      ...previous,
      records: previous.records.filter((record) => record.id !== id),
    }));
  };

  const applyImport = async () => {
    if (!result?.records?.length) return;
    const outcome = await onApply({
      ...result,
      replaceClasses,
      replaceOccupiedActivities,
      useDocumentTerm,
    });
    if (outcome !== false) closeModal();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-3 sm:p-5"
      onMouseDown={(event) => event.target === event.currentTarget && closeModal()}
    >
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">Routine importer</span>
            <h2 className="mt-2 text-xl font-black text-slate-950 dark:text-white">Import Classes from BUBT Routine</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Upload either supported BUBT routine format. The file is read locally, mapped to the exact day and university time slot, then shown for review before anything is applied.
            </p>
          </div>
          <button type="button" onClick={closeModal} disabled={processing} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black dark:border-slate-700">Close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!result && (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-5 dark:border-violet-500/30 dark:bg-violet-500/5">
                <h3 className="font-black text-slate-950 dark:text-white">Choose routine file</h3>
                <p className="mt-1 text-sm text-slate-500">Accepted: PDF, PNG, JPG, or JPEG. The first page is used.</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    setError("");
                  }}
                  className="mt-4 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:font-bold file:text-white dark:border-slate-700 dark:bg-slate-900 dark:file:bg-white dark:file:text-slate-950"
                />
                {file && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <p className="font-black text-slate-900 dark:text-white">{file.name}</p>
                    <p className="text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB</p>
                  </div>
                )}
                {processing && (
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-bold text-violet-700 dark:text-violet-300">{status || "Reading routine..."}</p>
                  </div>
                )}
                {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
                <button type="button" onClick={processFile} disabled={!file || processing} className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {processing ? "Reading Routine..." : "Read & Detect Classes"}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                <h3 className="font-black text-slate-950 dark:text-white">What is detected</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <InfoRow label="Schedule" value="Day and exact start/end time" />
                  <InfoRow label="Course" value="Course code and optional course title" />
                  <InfoRow label="Students" value="Intake and section" />
                  <InfoRow label="Location" value="Building number and room number" />
                  <InfoRow label="Matching" value="Links imported rows with your portal courses" />
                </div>
                <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  Scanned routines are reviewed before applying. Unmatched courses stay visible so the teacher can select the correct portal course or correct the imported text.
                </p>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Detected Format" value={result.formatLabel} />
                <SummaryCard label="Classes Found" value={result.records.length} />
                <SummaryCard label="Semester" value={result.semester || "Use current"} />
                <SummaryCard label="Year" value={result.year || routine?.year || "Current"} />
              </div>

              {result.warnings?.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <p className="font-black">Review required</p>
                  {result.warnings.slice(0, 8).map((warning) => <p key={warning} className="mt-1">• {warning}</p>)}
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-[1390px] w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <tr>
                      <th className="p-3">Day</th>
                      <th className="p-3">Time Slot</th>
                      <th className="p-3">Portal Course Mapping</th>
                      <th className="p-3">Course Code</th>
                      <th className="p-3">Course Title <span className="font-medium text-slate-400">(optional)</span></th>
                      <th className="p-3">Intake</th>
                      <th className="p-3">Section</th>
                      <th className="p-3">Building</th>
                      <th className="p-3">Room</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.records.map((record) => (
                      <tr key={record.id} className="border-t border-slate-200 align-top dark:border-slate-800">
                        <td className="p-2">
                          <select value={record.day} onChange={(event) => updateRecord(record.id, { day: event.target.value })} className="routine-select w-28 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
                            {OFFICIAL_DAYS.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <select value={record.slotId} onChange={(event) => {
                            const slot = OFFICIAL_TIME_SLOTS.find((item) => item.id === event.target.value);
                            updateRecord(record.id, { slotId: event.target.value, slotLabel: slot?.label || "", courseShift: slot?.shift || "" });
                          }} className="routine-select w-48 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
                            {OFFICIAL_TIME_SLOTS.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <select value={record.courseId || ""} onChange={(event) => selectCourse(record, event.target.value)} className="routine-select w-80 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
                            <option value="">Keep imported details / not matched</option>
                            {courseOptions.map((course) => <option key={courseKey(course)} value={courseKey(course)}>{compactCourse(course)}</option>)}
                          </select>
                          {record.courseTitle && <p className="mt-1 max-w-80 text-[11px] text-slate-500">{record.courseTitle}</p>}
                        </td>
                        <td className="p-2"><input value={record.courseCode} onChange={(event) => updateRecord(record.id, { courseCode: event.target.value, matched: false, courseId: "" })} className="w-28 rounded-lg border border-slate-200 bg-transparent px-2 py-2 font-black dark:border-slate-700" /></td>
                        <td className="p-2"><input value={record.courseTitle || ""} onChange={(event) => updateRecord(record.id, { courseTitle: event.target.value })} placeholder="Optional" className="w-52 rounded-lg border border-slate-200 bg-transparent px-2 py-2 dark:border-slate-700" /></td>
                        <td className="p-2"><input value={record.intake} onChange={(event) => updateRecord(record.id, { intake: event.target.value, matched: false, courseId: "" })} className="w-20 rounded-lg border border-slate-200 bg-transparent px-2 py-2 dark:border-slate-700" /></td>
                        <td className="p-2"><input value={record.section} onChange={(event) => updateRecord(record.id, { section: event.target.value, matched: false, courseId: "" })} className="w-20 rounded-lg border border-slate-200 bg-transparent px-2 py-2 dark:border-slate-700" /></td>
                        <td className="p-2"><span className="inline-flex min-w-20 justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 font-black dark:border-slate-700 dark:bg-slate-900">{record.buildingNo || String(record.room || "").charAt(0) || "—"}</span></td>
                        <td className="p-2"><input value={record.room} onChange={(event) => updateRecord(record.id, { room: event.target.value })} className="w-24 rounded-lg border border-slate-200 bg-transparent px-2 py-2 dark:border-slate-700" /></td>
                        <td className="p-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${record.matched ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>
                            {record.matched ? "Matched" : "Review"}
                          </span>
                          <p className="mt-1 text-[10px] text-slate-400">OCR {record.confidence || 0}%</p>
                        </td>
                        <td className="p-2 text-right"><button type="button" onClick={() => removeRecord(record.id)} className="rounded-lg border border-rose-200 px-2 py-1.5 font-black text-rose-600">Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-3 dark:border-slate-800">
                <CheckOption checked={replaceClasses} onChange={setReplaceClasses} title="Replace current class entries" description="Existing classes are cleared first; CH, DM, DCW, IS, OBEI-W, and RW remain." />
                <CheckOption checked={replaceOccupiedActivities} onChange={setReplaceOccupiedActivities} title="Use exact imported slots" description="An activity already occupying an imported class slot will be replaced by the class." />
                <CheckOption checked={useDocumentTerm} onChange={setUseDocumentTerm} disabled={!result.semester || !result.year} title="Use semester and year from file" description={result.semester && result.year ? `${result.semester} ${result.year}` : "No semester/year was printed in this routine."} />
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <button type="button" onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black dark:border-slate-700">Choose Another File</button>
            <div className="flex gap-2">
              <button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black dark:border-slate-700">Cancel</button>
              <button type="button" onClick={applyImport} disabled={!result.records.length} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">Apply {result.records.length} Classes</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-900"><span className="font-black text-slate-900 dark:text-white">{label}</span><span className="text-right">{value}</span></div>;
}

function SummaryCard({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{value}</p></div>;
}

function CheckOption({ checked, onChange, title, description, disabled = false }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} className="mt-1 h-4 w-4 accent-violet-600" />
      <span><span className="block text-sm font-black text-slate-900 dark:text-white">{title}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
    </label>
  );
}

export default RoutineImportModal;
