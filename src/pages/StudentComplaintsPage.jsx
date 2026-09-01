import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createStudentComplaint,
  fetchStudentComplaints,
} from "../services/complaintService";
import {
  fetchStudentCourseDetails,
  fetchStudentCourses,
} from "../services/studentService";
import { fetchStudentAttendanceSheet } from "../services/attendanceService";
import StudentPageBack from "../components/StudentPageBack";

const CATEGORY_LABELS = {
  marks: "Marks",
  attendance: "Attendance",
  general: "General",
};

const STATUS_LABELS = {
  open: "Open",
  in_review: "In Review",
  resolved: "Resolved",
  rejected: "Rejected",
};

function getCourseId(course) {
  return course?._id || course?.id || "";
}

function getComplaintCourseId(complaint) {
  return complaint?.course?._id || complaint?.course || "";
}

function getAttendanceKey(courseId, date, period) {
  return `${String(courseId)}::${String(date)}::${Number(period || 0)}`;
}

function isAbsent(row) {
  const value = String(row?.status || "").trim().toLowerCase();
  return value === "absent" || value === "a" || value === "absence";
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StudentComplaintsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [formCourseId, setFormCourseId] = useState("");
  const [category, setCategory] = useState("marks");
  const [assessmentId, setAssessmentId] = useState("");
  const [attendanceSelections, setAttendanceSelections] = useState([]);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [contextLoading, setContextLoading] = useState(false);
  const [assessmentOptions, setAssessmentOptions] = useState([]);
  const [attendanceOptions, setAttendanceOptions] = useState([]);

  const loadIssues = async () => {
    const data = await fetchStudentComplaints();
    setComplaints(Array.isArray(data) ? data : []);
    return Array.isArray(data) ? data : [];
  };

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [courseData, issueData] = await Promise.all([
          fetchStudentCourses(),
          fetchStudentComplaints(),
        ]);
        if (!active) return;

        const safeCourses = Array.isArray(courseData) ? courseData : [];
        const safeIssues = Array.isArray(issueData) ? issueData : [];
        setCourses(safeCourses);
        setComplaints(safeIssues);

        const queryCourse = searchParams.get("course") || "";
        const queryCategory = searchParams.get("category") || "marks";
        const queryAssessment = searchParams.get("assessment") || "";

        if (queryCourse && safeCourses.some((course) => getCourseId(course) === queryCourse)) {
          setFormCourseId(queryCourse);
          setCategory(["marks", "attendance", "general"].includes(queryCategory) ? queryCategory : "marks");
          setAssessmentId(queryAssessment);
          setFormOpen(true);
        }
      } catch (err) {
        if (!active) return;
        setLoadError(err?.response?.data?.message || "Could not load your issues.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const reportedAttendanceKeys = useMemo(() => {
    return new Set(
      complaints
        .filter(
          (item) =>
            item?.category === "attendance" &&
            item?.attendanceRef?.date &&
            item?.attendanceRef?.period != null
        )
        .map((item) =>
          getAttendanceKey(
            getComplaintCourseId(item),
            item.attendanceRef.date,
            item.attendanceRef.period
          )
        )
    );
  }, [complaints]);

  const selectedCourse = useMemo(
    () => courses.find((course) => getCourseId(course) === formCourseId) || null,
    [courses, formCourseId]
  );

  const complaintsOpen =
    selectedCourse?.complaintSettings?.allowStudentComplaints !== false;
  const complaintClosedMessage =
    selectedCourse?.complaintSettings?.closedMessage ||
    "Issue submission is currently closed by the course teacher.";

  useEffect(() => {
    let active = true;

    const loadContext = async () => {
      setAssessmentOptions([]);
      setAttendanceOptions([]);
      setAttendanceSelections([]);
      setFormError("");

      if (!formOpen || !formCourseId) return;
      if (category === "general") return;

      setContextLoading(true);
      try {
        if (category === "marks") {
          const data = await fetchStudentCourseDetails(formCourseId);
          if (!active) return;
          const list = Array.isArray(data?.assessments) ? data.assessments : [];
          setAssessmentOptions(list);

          const requestedAssessment = searchParams.get("assessment") || assessmentId;
          if (
            requestedAssessment &&
            list.some((item) => (item.id || item._id) === requestedAssessment)
          ) {
            setAssessmentId(requestedAssessment);
          } else if (list.length === 1) {
            setAssessmentId(list[0].id || list[0]._id || "");
          } else if (!requestedAssessment) {
            setAssessmentId("");
          }
        } else if (category === "attendance") {
          const data = await fetchStudentAttendanceSheet(formCourseId);
          if (!active) return;
          const rows = Array.isArray(data?.rows) ? data.rows : [];
          const options = rows
            .filter(isAbsent)
            .filter(
              (row) =>
                !reportedAttendanceKeys.has(
                  getAttendanceKey(formCourseId, row.date, row.period)
                )
            )
            .sort((a, b) => {
              const dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
              if (dateCmp !== 0) return dateCmp;
              return Number(b.period || 0) - Number(a.period || 0);
            });
          setAttendanceOptions(options);
        }
      } catch (err) {
        if (!active) return;
        setFormError(
          err?.response?.data?.message ||
            (category === "marks"
              ? "Could not load assessments for this course."
              : "Could not load absent attendance records for this course.")
        );
      } finally {
        if (active) setContextLoading(false);
      }
    };

    loadContext();
    return () => {
      active = false;
    };
  }, [formOpen, formCourseId, category, reportedAttendanceKeys]);

  const filteredComplaints = useMemo(() => {
    return complaints.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      return true;
    });
  }, [complaints, statusFilter, categoryFilter]);

  const openCreateIssue = () => {
    setSuccessMessage("");
    setFormError("");
    setCategory("marks");
    setAssessmentId("");
    setAttendanceSelections([]);
    setMessage("");
    if (courses.length === 1) setFormCourseId(getCourseId(courses[0]));
    else setFormCourseId("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
    setFormError("");
    const next = new URLSearchParams(searchParams);
    next.delete("course");
    next.delete("category");
    next.delete("assessment");
    setSearchParams(next, { replace: true });
  };

  const toggleAttendance = (row) => {
    const key = getAttendanceKey(formCourseId, row.date, row.period);
    setAttendanceSelections((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");

    if (!formCourseId) return setFormError("Please choose a course.");
    if (!complaintsOpen) return setFormError(complaintClosedMessage);

    if (category === "marks" && !assessmentId) {
      return setFormError("Please choose the assessment related to your marks issue.");
    }

    if (category === "attendance" && attendanceSelections.length === 0) {
      return setFormError("Select at least one absent attendance record.");
    }

    if (!message.trim()) {
      return setFormError("Please briefly explain the issue.");
    }

    setSubmitting(true);
    try {
      if (category === "attendance") {
        const selectedRows = attendanceOptions.filter((row) =>
          attendanceSelections.includes(
            getAttendanceKey(formCourseId, row.date, row.period)
          )
        );

        const results = await Promise.allSettled(
          selectedRows.map((row) =>
            createStudentComplaint({
              courseId: formCourseId,
              category: "attendance",
              attendanceRef: {
                date: row.date,
                period: Number(row.period),
              },
              message: message.trim(),
            })
          )
        );

        const failed = results.filter((result) => result.status === "rejected");
        if (failed.length) {
          const firstError = failed[0]?.reason;
          throw firstError || new Error("Some attendance issues could not be submitted.");
        }

        setSuccessMessage(
          `${selectedRows.length} attendance issue${selectedRows.length === 1 ? "" : "s"} submitted successfully.`
        );
      } else {
        await createStudentComplaint({
          courseId: formCourseId,
          category,
          assessmentId: category === "marks" ? assessmentId : undefined,
          message: message.trim(),
        });
        setSuccessMessage("Your issue has been submitted successfully.");
      }

      await loadIssues();
      setFormOpen(false);
      const next = new URLSearchParams(searchParams);
      next.delete("course");
      next.delete("category");
      next.delete("assessment");
      setSearchParams(next, { replace: true });
    } catch (err) {
      setFormError(err?.response?.data?.message || err?.message || "Could not submit the issue.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-5 pb-8">
      <StudentPageBack />
      <section className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-gradient-to-br from-white via-violet-50/50 to-sky-50/60 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:border-violet-500/20 dark:bg-slate-800/80 dark:text-violet-300">
              <IssueIcon />
              Student Support
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Issues
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Review submitted issues and teacher replies. The form stays hidden until you need to create a new issue.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateIssue}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 sm:w-auto"
          >
            <PlusIcon />
            Create Issue
          </button>
        </div>
      </section>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {loadError}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">My issues</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {complaints.length} submitted issue{complaints.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All categories</option>
              <option value="marks">Marks</option>
              <option value="attendance">Attendance</option>
              <option value="general">General</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-center dark:border-slate-700">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <IssueIcon />
              </div>
              <div className="mt-3 text-sm font-bold text-slate-900 dark:text-white">No issues found</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Create an issue when you need your teacher to review something.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredComplaints.map((item) => (
                <IssueCard key={item._id || item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={closeForm}
            aria-label="Close issue form"
          />

          <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
              <div>
                <div className="text-lg font-black text-slate-950 dark:text-white">Create Issue</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Choose the course and issue type. Relevant options will load automatically.
                </div>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
              {formError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                  {formError}
                </div>
              ) : null}

              <Field label="Course" required>
                <select
                  value={formCourseId}
                  onChange={(event) => {
                    setFormCourseId(event.target.value);
                    setAssessmentId("");
                    setAttendanceSelections([]);
                  }}
                  className="field-control"
                >
                  <option value="">Choose course</option>
                  {courses.map((course) => {
                    const open = course?.complaintSettings?.allowStudentComplaints !== false;
                    return (
                      <option key={getCourseId(course)} value={getCourseId(course)}>
                        {course.code} — {course.title} (Sec {course.section || "—"}){open ? "" : " — Issues closed"}
                      </option>
                    );
                  })}
                </select>
              </Field>

              {selectedCourse && !complaintsOpen ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  {complaintClosedMessage}
                </div>
              ) : null}

              <Field label="Issue category" required>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["marks", "Marks", <MarksIcon key="marks" />],
                    ["attendance", "Attendance", <AttendanceIcon key="attendance" />],
                    ["general", "General", <GeneralIcon key="general" />],
                  ].map(([value, label, icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setCategory(value);
                        setAssessmentId("");
                        setAttendanceSelections([]);
                      }}
                      className={[
                        "flex min-h-[70px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-bold transition",
                        category === value
                          ? "border-violet-300 bg-violet-50 text-violet-700 ring-2 ring-violet-500/10 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      ].join(" ")}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {category === "marks" ? (
                <Field label="Assessment" required>
                  {contextLoading ? (
                    <ContextLoading label="Loading assessments…" />
                  ) : (
                    <select
                      value={assessmentId}
                      onChange={(event) => setAssessmentId(event.target.value)}
                      disabled={!formCourseId || assessmentOptions.length === 0}
                      className="field-control"
                    >
                      <option value="">
                        {formCourseId
                          ? assessmentOptions.length
                            ? "Choose assessment"
                            : "No assessments available"
                          : "Choose a course first"}
                      </option>
                      {assessmentOptions.map((assessment) => (
                        <option
                          key={assessment.id || assessment._id}
                          value={assessment.id || assessment._id}
                        >
                          {assessment.name} — {assessment.fullMarks} marks
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : null}

              {category === "attendance" ? (
                <Field label="Absent attendance" required hint="Only absent records that have not already been reported are shown. You can select one or multiple.">
                  {contextLoading ? (
                    <ContextLoading label="Loading absent records…" />
                  ) : !formCourseId ? (
                    <EmptyContext text="Choose a course first." />
                  ) : attendanceOptions.length === 0 ? (
                    <EmptyContext text="No unreported absent attendance records are available for this course." />
                  ) : (
                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                      {attendanceOptions.map((row) => {
                        const key = getAttendanceKey(formCourseId, row.date, row.period);
                        const checked = attendanceSelections.includes(key);
                        return (
                          <label
                            key={key}
                            className={[
                              "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition",
                              checked
                                ? "border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                                : "border-slate-200 bg-white hover:border-rose-200 dark:border-slate-700 dark:bg-slate-900",
                            ].join(" ")}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAttendance(row)}
                              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-slate-900 dark:text-white">{row.date}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">Period {row.period}</div>
                            </div>
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                              Absent
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Field>
              ) : null}

              <Field
                label={category === "general" ? "Describe the issue" : "Issue details"}
                required
                hint={
                  category === "general"
                    ? "Write the course-related issue you want your teacher to review."
                    : "Add a short explanation so your teacher can understand the problem quickly."
                }
              >
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  placeholder={
                    category === "marks"
                      ? "Example: My marks for this assessment do not match my script/result."
                      : category === "attendance"
                        ? "Example: I was present in the selected class(es). Please review the attendance."
                        : "Write your issue here…"
                  }
                  className="field-control min-h-[112px] resize-y"
                />
              </Field>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !complaintsOpen}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <SpinnerIcon /> : <SendIcon />}
                  {submitting ? "Submitting…" : "Submit Issue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IssueCard({ item }) {
  const category = item.category || "marks";
  const status = item.status || "open";
  const statusClass =
    status === "resolved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : status === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
        : status === "in_review"
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
          : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";

  const categoryClass =
    category === "attendance"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
      : category === "general"
        ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300";

  return (
    <article className="rounded-[24px] border border-slate-200 bg-slate-50/50 p-4 transition hover:border-violet-200 hover:bg-white dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-violet-500/30 dark:hover:bg-slate-800 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
            {item.course?.code || "Course"}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">
            {item.course?.title || "Course issue"}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass}`}>
          {STATUS_LABELS[status] || status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${categoryClass}`}>
          {CATEGORY_LABELS[category] || category}
        </span>
        {item.assessment?.name ? (
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {item.assessment.name}
          </span>
        ) : null}
        {category === "attendance" && item.attendanceRef ? (
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {item.attendanceRef.date} · Period {item.attendanceRef.period}
          </span>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {item.message}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70">
        <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Teacher reply</div>
        <div className={`mt-1 text-sm leading-6 ${item.reply ? "text-slate-700 dark:text-slate-200" : "italic text-slate-400"}`}>
          {item.reply || "No reply yet."}
        </div>
      </div>

      <div className="mt-3 text-[11px] font-medium text-slate-400">
        Submitted {formatDateTime(item.createdAt)}
      </div>
    </article>
  );
}

function Field({ label, required = false, hint = "", children }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold text-slate-700 dark:text-slate-200">
        {label}{required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      {children}
      {hint ? <div className="mt-1.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
}

function ContextLoading({ label }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      <SpinnerIcon />
      {label}
    </div>
  );
}

function EmptyContext({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
      {text}
    </div>
  );
}

function IssueIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 2.8 19h18.4z"/><path d="M12 9v4M12 17h.01"/></svg>;
}
function PlusIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>;
}
function CloseIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18"/></svg>;
}
function MarksIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>;
}
function AttendanceIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 15l2 2 5-5"/></svg>;
}
function GeneralIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>;
}
function SendIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>;
}
function SpinnerIcon() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
