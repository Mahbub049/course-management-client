import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { getCourseStudents } from "../services/enrollmentService";
import {
  createTeacherCounsellingRecord,
  deleteTeacherCounsellingRecord,
  getTeacherCounsellingReport,
} from "../services/routineService";
import {
  downloadCounsellingReportPdf,
  printCounsellingReportPdf,
} from "../utils/counsellingPdfExport";

const SEMESTER_ORDER = { Spring: 1, Summer: 2, Fall: 3 };

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function semesterKey(course = {}) {
  return [course.semester, course.year].filter(Boolean).join("|");
}

function semesterLabel(key) {
  const [semester, year] = String(key || "").split("|");
  return [semester, year].filter(Boolean).join(" ") || "All Semesters";
}

function getSemesterOptions(courses = []) {
  const map = new Map();
  courses.forEach((course) => {
    const key = semesterKey(course);
    if (key) map.set(key, { key, semester: course.semester, year: Number(course.year) || 0 });
  });
  return [...map.values()].sort((a, b) => {
    const yearDiff = b.year - a.year;
    if (yearDiff) return yearDiff;
    return (SEMESTER_ORDER[b.semester] || 0) - (SEMESTER_ORDER[a.semester] || 0);
  });
}

function courseLabel(course = {}) {
  return [
    course.code,
    course.title,
    course.intake ? `Intake ${course.intake}` : "",
    course.section ? `Sec ${course.section}` : "",
    course.archived ? "Archived" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatDate(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateString || "—";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return dateString || "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return value || "—";
  let hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${String(hour).padStart(2, "0")}:${match[2]} ${suffix}`;
}

function statusText(value) {
  return value === "completed" ? "Counselling Taken" : "Will Be Taken";
}

function ModalShell({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
      <div
        className={[
          "max-h-[94vh] w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-white shadow-2xl dark:bg-slate-950",
          wide ? "max-w-6xl" : "max-w-4xl",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-violet-600/10 via-fuchsia-500/5 to-sky-500/10 px-5 py-4 dark:border-slate-800 sm:px-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(94vh-5.5rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const fieldClass =
  "mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-violet-500/20";

function FieldLabel({ children }) {
  return <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{children}</span>;
}

export function CounsellingCreateModal({ open, courses = [], onClose, onSaved }) {
  const semesters = useMemo(() => getSemesterOptions(courses), [courses]);
  const [form, setForm] = useState({
    semesterKey: "",
    courseId: "",
    sessionStatus: "scheduled",
    date: todayString(),
    startTime: "",
    endTime: "",
    venue: "",
    topic: "",
    notes: "",
  });
  const [students, setStudents] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const defaultCourse = courses.find((course) => !course.archived) || courses[0] || null;
    setForm({
      semesterKey: defaultCourse ? semesterKey(defaultCourse) : semesters[0]?.key || "",
      courseId: defaultCourse?.id || "",
      sessionStatus: "scheduled",
      date: todayString(),
      startTime: "",
      endTime: "",
      venue: "",
      topic: "",
      notes: "",
    });
    setSelectedIds([]);
    setStudentSearch("");
    setError("");
  }, [open, courses, semesters]);

  useEffect(() => {
    if (!open || !form.courseId) {
      setStudents([]);
      return;
    }

    let ignore = false;
    const run = async () => {
      try {
        setLoadingStudents(true);
        setError("");
        const result = await getCourseStudents(form.courseId);
        if (!ignore) setStudents(Array.isArray(result) ? result : []);
      } catch (err) {
        if (!ignore) {
          setStudents([]);
          setError(err?.response?.data?.message || "Could not load students for this course.");
        }
      } finally {
        if (!ignore) setLoadingStudents(false);
      }
    };

    run();
    return () => {
      ignore = true;
    };
  }, [open, form.courseId]);

  const coursesForSemester = useMemo(
    () => courses.filter((course) => !form.semesterKey || semesterKey(course) === form.semesterKey),
    [courses, form.semesterKey]
  );

  const selectedCourse = courses.find((course) => String(course.id) === String(form.courseId));

  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [student.roll, student.name, student.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [studentSearch, students]);

  if (!open) return null;

  const toggleStudent = (studentId) => {
    const id = String(studentId);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const allVisibleSelected =
    visibleStudents.length > 0 && visibleStudents.every((student) => selectedIds.includes(String(student.id)));

  const toggleAllVisible = () => {
    const visibleIds = visibleStudents.map((student) => String(student.id));
    setSelectedIds((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleIds.includes(id));
      return [...new Set([...prev, ...visibleIds])];
    });
  };

  const handleSemesterChange = (value) => {
    const firstCourse = courses.find((course) => semesterKey(course) === value) || null;
    setForm((prev) => ({ ...prev, semesterKey: value, courseId: firstCourse?.id || "" }));
    setSelectedIds([]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.courseId) return setError("Please select a course.");
    if (!selectedIds.length) return setError("Please select at least one student.");
    if (!form.date || !form.startTime || !form.topic.trim()) {
      return setError("Date, start time and counselling topic are required.");
    }
    if (form.endTime && form.endTime <= form.startTime) {
      return setError("End time must be later than start time.");
    }

    try {
      setSaving(true);
      setError("");
      await createTeacherCounsellingRecord({
        courseId: form.courseId,
        studentIds: selectedIds,
        sessionStatus: form.sessionStatus,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        venue: form.venue,
        topic: form.topic,
        notes: form.notes,
      });
      await onSaved?.();
      onClose();
      Swal.fire({
        icon: "success",
        title: "Counselling entry saved",
        text: "The selected students have been added to the counselling register.",
        confirmButtonColor: "#7c3aed",
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Could not save the counselling entry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Add Counselling Entry"
      subtitle="Record counselling already taken or schedule a future session for selected students."
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit}>
        <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[0.95fr_1.25fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/45">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Session Information</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label>
                  <FieldLabel>Entry Type</FieldLabel>
                  <select
                    value={form.sessionStatus}
                    onChange={(e) => setForm((prev) => ({ ...prev, sessionStatus: e.target.value }))}
                    className={fieldClass}
                  >
                    <option value="completed">Counselling Taken</option>
                    <option value="scheduled">Will Be Taken</option>
                  </select>
                </label>
                <label>
                  <FieldLabel>Semester</FieldLabel>
                  <select
                    value={form.semesterKey}
                    onChange={(e) => handleSemesterChange(e.target.value)}
                    className={fieldClass}
                  >
                    {semesters.map((semester) => (
                      <option key={semester.key} value={semester.key}>
                        {semesterLabel(semester.key)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-3 block">
                <FieldLabel>Course / Section</FieldLabel>
                <select
                  value={form.courseId}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, courseId: e.target.value }));
                    setSelectedIds([]);
                  }}
                  className={fieldClass}
                >
                  <option value="">Select course</option>
                  {coursesForSemester.map((course) => (
                    <option key={course.id} value={course.id}>
                      {courseLabel(course)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedCourse && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <span className="text-slate-400">Intake</span>
                    <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">{selectedCourse.intake || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <span className="text-slate-400">Section</span>
                    <p className="mt-1 font-bold text-slate-800 dark:text-slate-100">{selectedCourse.section || "—"}</p>
                  </div>
                </div>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label>
                  <FieldLabel>Date</FieldLabel>
                  <input
                    type="date"
                    value={form.date}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label>
                  <FieldLabel>Start Time</FieldLabel>
                  <input
                    type="time"
                    value={form.startTime}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                    className={fieldClass}
                  />
                </label>
                <label>
                  <FieldLabel>End Time</FieldLabel>
                  <input
                    type="time"
                    value={form.endTime}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                    className={fieldClass}
                  />
                </label>
              </div>

              <label className="mt-3 block">
                <FieldLabel>Venue / Room</FieldLabel>
                <input
                  value={form.venue}
                  onChange={(e) => setForm((prev) => ({ ...prev, venue: e.target.value }))}
                  placeholder="Example: B4-R301 or Faculty Room"
                  className={fieldClass}
                />
              </label>

              <label className="mt-3 block">
                <FieldLabel>Topic / Purpose</FieldLabel>
                <input
                  value={form.topic}
                  onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
                  placeholder="Academic progress, attendance, registration guidance..."
                  className={fieldClass}
                  maxLength={240}
                />
              </label>

              <label className="mt-3 block">
                <FieldLabel>Remarks / Follow-up Notes</FieldLabel>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes, decisions or follow-up action."
                  rows={4}
                  className={`${fieldClass} resize-none font-medium`}
                  maxLength={2400}
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Select Students</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {selectedIds.length} selected from {students.length} enrolled students
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAllVisible}
                disabled={!visibleStudents.length}
                className="rounded-2xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
              >
                {allVisibleSelected ? "Clear Shown" : "Select All Shown"}
              </button>
            </div>

            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search by roll, name or email"
              className={`${fieldClass} mt-4`}
            />

            <div className="mt-3 max-h-[31rem] space-y-2 overflow-y-auto pr-1">
              {loadingStudents ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-700">
                  Loading students...
                </div>
              ) : !form.courseId ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-700">
                  Select a course to load students.
                </div>
              ) : !visibleStudents.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-700">
                  No matching student found.
                </div>
              ) : (
                visibleStudents.map((student) => {
                  const id = String(student.id);
                  const checked = selectedIds.includes(id);
                  return (
                    <label
                      key={id}
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition",
                        checked
                          ? "border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10"
                          : "border-slate-200 bg-slate-50/70 hover:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(id)}
                        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{student.name || "Student"}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Roll: {student.roll || "—"}{student.email ? ` · ${student.email}` : ""}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 sm:mx-6">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Counselling Entry"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export function CounsellingReportModal({ open, courses = [], onClose }) {
  const semesters = useMemo(() => getSemesterOptions(courses), [courses]);
  const [filters, setFilters] = useState({
    reportTitle: "Counselling Register",
    semesterKey: "",
    courseId: "",
    intake: "",
    section: "",
    sessionStatus: "all",
    dateFrom: "",
    dateTo: "",
    includeNotes: true,
  });
  const [generating, setGenerating] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFilters({
      reportTitle: "Counselling Register",
      semesterKey: "",
      courseId: "",
      intake: "",
      section: "",
      sessionStatus: "all",
      dateFrom: "",
      dateTo: "",
      includeNotes: true,
    });
    setError("");
  }, [open]);

  const semesterCourses = useMemo(
    () => courses.filter((course) => !filters.semesterKey || semesterKey(course) === filters.semesterKey),
    [courses, filters.semesterKey]
  );

  const intakeOptions = useMemo(
    () => [...new Set(semesterCourses.map((course) => String(course.intake || "").trim()).filter(Boolean))].sort(),
    [semesterCourses]
  );
  const sectionOptions = useMemo(
    () => [...new Set(semesterCourses.map((course) => String(course.section || "").trim()).filter(Boolean))].sort(),
    [semesterCourses]
  );

  if (!open) return null;

  const generate = async (mode) => {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setError("The From date cannot be later than the To date.");
      return;
    }

    const [semester, year] = filters.semesterKey.split("|");
    try {
      setGenerating(mode);
      setError("");
      const report = await getTeacherCounsellingReport({
        semester: semester || undefined,
        year: year || undefined,
        courseId: filters.courseId || undefined,
        intake: filters.intake || undefined,
        section: filters.section || undefined,
        sessionStatus: filters.sessionStatus === "all" ? undefined : filters.sessionStatus,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      });

      if (!report?.records?.length) {
        setError("No counselling records match the selected filters.");
        return;
      }

      const options = {
        reportTitle: filters.reportTitle,
        includeNotes: filters.includeNotes,
      };
      if (mode === "print") printCounsellingReportPdf(report, options);
      else downloadCounsellingReportPdf(report, options);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not prepare the counselling report.");
    } finally {
      setGenerating("");
    }
  };

  return (
    <ModalShell
      title="Print or Download Counselling List"
      subtitle="Choose semester, course, section, status and date range before generating the professional report."
      onClose={onClose}
    >
      <div className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <FieldLabel>Report Title</FieldLabel>
            <input
              value={filters.reportTitle}
              onChange={(e) => setFilters((prev) => ({ ...prev, reportTitle: e.target.value }))}
              className={fieldClass}
              placeholder="Counselling Register"
            />
          </label>

          <label>
            <FieldLabel>Semester</FieldLabel>
            <select
              value={filters.semesterKey}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  semesterKey: e.target.value,
                  courseId: "",
                  intake: "",
                  section: "",
                }))
              }
              className={fieldClass}
            >
              <option value="">All Semesters</option>
              {semesters.map((semester) => (
                <option key={semester.key} value={semester.key}>
                  {semesterLabel(semester.key)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <FieldLabel>Course</FieldLabel>
            <select
              value={filters.courseId}
              onChange={(e) => setFilters((prev) => ({ ...prev, courseId: e.target.value }))}
              className={fieldClass}
            >
              <option value="">All Courses</option>
              {semesterCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {courseLabel(course)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <FieldLabel>Intake</FieldLabel>
            <select
              value={filters.intake}
              onChange={(e) => setFilters((prev) => ({ ...prev, intake: e.target.value }))}
              className={fieldClass}
            >
              <option value="">All Intakes</option>
              {intakeOptions.map((intake) => (
                <option key={intake} value={intake}>{intake}</option>
              ))}
            </select>
          </label>

          <label>
            <FieldLabel>Section</FieldLabel>
            <select
              value={filters.section}
              onChange={(e) => setFilters((prev) => ({ ...prev, section: e.target.value }))}
              className={fieldClass}
            >
              <option value="">All Sections</option>
              {sectionOptions.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
          </label>

          <label>
            <FieldLabel>Record Type</FieldLabel>
            <select
              value={filters.sessionStatus}
              onChange={(e) => setFilters((prev) => ({ ...prev, sessionStatus: e.target.value }))}
              className={fieldClass}
            >
              <option value="all">All Records</option>
              <option value="completed">Counselling Taken</option>
              <option value="scheduled">Will Be Taken</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <FieldLabel>From Date</FieldLabel>
              <input
                type="date"
                value={filters.dateFrom}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                className={fieldClass}
              />
            </label>
            <label>
              <FieldLabel>To Date</FieldLabel>
              <input
                type="date"
                value={filters.dateTo}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                className={fieldClass}
              />
            </label>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <input
            type="checkbox"
            checked={filters.includeNotes}
            onChange={(e) => setFilters((prev) => ({ ...prev, includeNotes: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Include teacher remarks and follow-up notes in the report
          </span>
        </label>

        <div className="mt-4 rounded-3xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200">
          The PDF will contain a university header, filter summary, student-wise counselling table, page numbers and signature areas.
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:justify-end sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => generate("print")}
          disabled={Boolean(generating)}
          className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
        >
          {generating === "print" ? "Preparing..." : "Print Report"}
        </button>
        <button
          type="button"
          onClick={() => generate("download")}
          disabled={Boolean(generating)}
          className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
        >
          {generating === "download" ? "Generating PDF..." : "Download PDF"}
        </button>
      </div>
    </ModalShell>
  );
}

export function CounsellingRegisterSection({ records = [], courses = [], onChanged }) {
  const semesters = useMemo(() => getSemesterOptions(courses), [courses]);
  const [semesterFilter, setSemesterFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (semesterFilter && `${record.semester}|${record.year}` !== semesterFilter) return false;
      if (statusFilter !== "all" && record.sessionStatus !== statusFilter) return false;
      if (!query) return true;
      return [
        record.courseCode,
        record.courseTitle,
        record.intake,
        record.section,
        record.topic,
        record.venue,
        ...(record.participants || []).flatMap((participant) => [participant.roll, participant.name]),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [records, search, semesterFilter, statusFilter]);

  const handleDelete = async (record) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete counselling entry?",
      text: "This entry will also be removed from future printed reports.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#e11d48",
    });
    if (!result.isConfirmed) return;

    try {
      setDeletingId(record.id);
      await deleteTeacherCounsellingRecord(record.id);
      await onChanged?.();
      Swal.fire({ icon: "success", title: "Entry deleted", timer: 1300, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Could not delete", err?.response?.data?.message || "Please try again.", "error");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Counselling Register</h2>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              {records.length} entries
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Past and upcoming counselling entries created by the teacher.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[44rem]">
          <select
            value={semesterFilter}
            onChange={(e) => setSemesterFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="">All Semesters</option>
            {semesters.map((semester) => (
              <option key={semester.key} value={semester.key}>{semesterLabel(semester.key)}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="all">All Record Types</option>
            <option value="completed">Counselling Taken</option>
            <option value="scheduled">Will Be Taken</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student or course"
            className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        </div>
      </div>

      {!filteredRecords.length ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            No counselling register entry found for the selected filters.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-[1050px] w-full text-left">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-bold">Date & Time</th>
                <th className="px-4 py-3 font-bold">Course</th>
                <th className="px-4 py-3 font-bold">Students</th>
                <th className="px-4 py-3 font-bold">Topic / Venue</th>
                <th className="px-4 py-3 font-bold">Type</th>
                <th className="px-4 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredRecords.map((record) => (
                <tr key={record.id} className="bg-white align-top dark:bg-slate-950">
                  <td className="px-4 py-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(record.date)}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatTime(record.startTime)}{record.endTime ? ` – ${formatTime(record.endTime)}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{record.courseCode || "—"}</p>
                    <p className="mt-1 max-w-[15rem] text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {record.courseTitle || "—"}<br />Intake {record.intake || "—"} · Section {record.section || "—"}<br />{record.semester} {record.year}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {record.participants?.length || 0} student{record.participants?.length === 1 ? "" : "s"}
                    </p>
                    <div className="mt-2 flex max-w-[22rem] flex-wrap gap-1.5">
                      {(record.participants || []).slice(0, 4).map((participant) => (
                        <span key={`${record.id}-${participant.studentId}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {participant.roll} · {participant.name}
                        </span>
                      ))}
                      {(record.participants?.length || 0) > 4 && (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                          +{record.participants.length - 4} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="max-w-[18rem] text-sm font-semibold text-slate-900 dark:text-white">{record.topic || "—"}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{record.venue || "Venue not specified"}</p>
                    {record.notes && <p className="mt-2 line-clamp-2 max-w-[18rem] text-xs leading-5 text-slate-500 dark:text-slate-400">{record.notes}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <span className={[
                      "inline-flex rounded-full border px-3 py-1 text-[11px] font-bold",
                      record.sessionStatus === "completed"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
                    ].join(" ")}>
                      {statusText(record.sessionStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(record)}
                      disabled={deletingId === record.id}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                    >
                      {deletingId === record.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
