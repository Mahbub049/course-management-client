import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchStudentCourses } from "../services/studentService";
import { fetchStudentSubmissionAssessments } from "../services/labSubmissionService";
import { fetchStudentPendingProjectSubmissions } from "../services/projectSubmissionService";
import { academicCalendarService } from "../services/academicCalendarService";

const categoryStyles = {
  Holiday:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  Exam:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  Payment:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  Registration:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20",
  Class:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20",
  Result:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20",
  Event:
    "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/20",
  Attendance:
    "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20",
  Other:
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const monthMap = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function StudentDashboard() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingSubmissionItems, setPendingSubmissionItems] = useState([]);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const studentName = localStorage.getItem("marksPortalName") || "Student";

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setCalendarLoading(true);
      setError("");

      try {
        const [courseData, submissionData, projectSubmissionData, calendarData] =
          await Promise.all([
            fetchStudentCourses(),
            fetchStudentSubmissionAssessments(),
            fetchStudentPendingProjectSubmissions(),
            academicCalendarService.getLatest().catch((calendarError) => {
              console.error(calendarError);
              return null;
            }),
          ]);

        setCourses(courseData || []);
        setCalendar(calendarData?.calendar || null);

        const labPendingItems = Array.isArray(submissionData)
          ? submissionData.map((item) => ({
              ...item,
              taskType: "lab_submission",
              taskLabel: "Assessment Submission",
              badgeLabel: "You have an assessment",
              actionLabel: "Go to Submission Page",
              navigateTo: `/student/courses/${item.course?.id}?tab=submissions`,
            }))
          : [];

        const projectPendingItems = Array.isArray(projectSubmissionData)
          ? projectSubmissionData.map((item) => ({
              ...item,
              taskType: "project_phase",
              taskLabel: item.submissionLabel || "Project Phase",
              badgeLabel: item.missingGroup
                ? "Create or join group first"
                : "Project phase pending",
              actionLabel: item.missingGroup ? "Go to Project Group" : "Go to Project Phase",
              navigateTo: item.missingGroup
                ? `/student/courses/${item.course?.id}?tab=project&projectTab=my-group`
                : `/student/courses/${item.course?.id}?tab=project&projectTab=workflow&phaseId=${item.phaseId || item.id}`,
            }))
          : [];

        const pendingItems = [...labPendingItems, ...projectPendingItems]
          .filter((item) => isPendingSubmissionActive(item, Date.now()))
          .sort((a, b) => {
            const aDue = getDueTime(a.dueDate) || Number.MAX_SAFE_INTEGER;
            const bDue = getDueTime(b.dueDate) || Number.MAX_SAFE_INTEGER;
            return aDue - bDue;
          });

        setPendingSubmissionItems(pendingItems.slice(0, 8));
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
        setCalendarLoading(false);
      }
    };

    load();
  }, []);

  const recent = useMemo(() => (courses || []).slice(0, 4), [courses]);

  const activePendingSubmissionItems = useMemo(
    () =>
      (pendingSubmissionItems || []).filter((item) =>
        isPendingSubmissionActive(item, nowTick)
      ),
    [pendingSubmissionItems, nowTick]
  );

  const showPendingSection = activePendingSubmissionItems.length > 0;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {/* Top intro + quick actions */}
      <section className="order-1 rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/85 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
              {greeting},{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {studentName}
              </span>
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Student Dashboard
            </h1>

            <p className="mt-2 hidden max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400 md:block">
              View your courses, track published results, monitor progress, and access important student actions from one clean dashboard.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:w-auto xl:min-w-[520px]">
            <QuickButton
              primary
              icon={<GridIcon />}
              label="Courses"
              onClick={() => navigate("/student/courses")}
            />
            <QuickButton
              icon={<CounsellingIcon />}
              label="Counselling"
              onClick={() => navigate("/student/counselling")}
            />
            <QuickButton
              icon={<AttendanceIcon />}
              label="Attendance"
              onClick={() => navigate("/student/attendance")}
            />
            <QuickButton
              icon={<ChatIcon />}
              label="Complaints"
              onClick={() => navigate("/student/complaints")}
            />
          </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <section className="order-2 rounded-[24px] border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-rose-700 dark:text-rose-300">
              <AlertIcon />
            </div>
            <div>
              <div className="font-semibold text-rose-800 dark:text-rose-200">
                Could not load dashboard
              </div>
              <div className="mt-1 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </div>
            </div>
          </div>
        </section>
      )}

      {showPendingSection && (
        <PendingSubmissionsSection
          className="order-2 md:order-4"
          items={activePendingSubmissionItems}
          loading={loading}
          nowTick={nowTick}
          onNavigate={navigate}
        />
      )}

      <AcademicCalendarPreview
        className="order-3 md:order-3"
        calendar={calendar}
        loading={calendarLoading}
        onViewCalendar={() => navigate("/academic-calendar")}
      />

      {/* Recent Courses */}
      <section className="order-5 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Recent Courses
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Quick access to your latest enrolled courses
            </p>
          </div>

          <button
            onClick={() => navigate("/student/courses")}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            type="button"
          >
            View All
            <ArrowRightIcon />
          </button>
        </div>

        {loading ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-[24px] border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-slate-600 dark:text-slate-300">
                <InfoIcon />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  No courses found
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  You are not enrolled in any courses yet.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((c, idx) => {
              const id = c?._id || c?.id;

              return (
                <button
                  key={id || idx}
                  onClick={() => id && navigate(`/student/courses/${id}`)}
                  className="group relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500/25 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-500/30"
                  type="button"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/5 via-violet-500/5 to-fuchsia-500/5 dark:from-sky-500/5 dark:via-violet-500/5 dark:to-fuchsia-500/5" />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          <HashIcon />
                          {c?.code || "—"}
                        </div>

                        <div className="mt-3 line-clamp-2 text-sm font-bold text-slate-900 transition group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">
                          {c?.title || "Untitled Course"}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon />
                            {c?.semester || "—"} {c?.year || ""}
                          </span>

                          <span className="inline-flex items-center gap-1">
                            <TagIcon />
                            Section{" "}
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {c?.section || "—"}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:border-violet-200 group-hover:bg-violet-50 group-hover:text-violet-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:group-hover:border-violet-500/30 dark:group-hover:bg-violet-500/10 dark:group-hover:text-violet-300">
                        <ChevronIcon />
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                      {c?.summaryStatus === "published" ? (
                        <div className="flex items-center justify-between gap-6">
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            Current Total
                            <div className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                              {c?.summary?.total ?? 0}/100
                            </div>
                          </div>

                          <div className="text-right text-xs text-slate-600 dark:text-slate-400">
                            Grade
                            <div className="mt-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                              {c?.summary?.grade || "—"}
                            </div>
                          </div>
                        </div>
                      ) : c?.summaryStatus === "in_progress" ? (
                        <div className="text-xs text-amber-700 dark:text-amber-300">
                          Marks are being updated
                          <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                            Some assessments are pending.
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Marks not published yet
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">
                            Assessment structure not finalized.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PendingSubmissionsSection({ className = "", items, loading, nowTick, onNavigate }) {
  return (
    <section className={`${className} rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Pending Submissions
          </h3>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Lab assessments and project phases created by your teachers appear here.
          </p>
        </div>

        <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
          {loading ? "..." : `${items.length} pending`}
        </div>
      </div>

      {loading ? (
        <div className="mt-5 text-sm text-slate-500 dark:text-slate-400">
          Loading pending submissions...
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <div
              key={`${item.course?.id}-${item.id}`}
              className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-800/50"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-base font-semibold text-slate-900 dark:text-white">
                    {item.name}
                  </div>

                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {item.course?.code} • Section {item.course?.section}
                  </div>

                  <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {item.taskLabel || "Submission Task"}
                  </div>

                  <div
                    className={[
                      "mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                      item.taskType === "project_phase"
                        ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
                        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
                    ].join(" ")}
                  >
                    {item.badgeLabel || "Pending submission"}
                  </div>

                  <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Due:{" "}
                    {item.dueDate
                      ? new Date(item.dueDate).toLocaleString()
                      : "No deadline set"}{" "}
                    {item.taskType === "project_phase"
                      ? ` • Marks ${item.fullMarks ?? item.totalMarks ?? 0}`
                      : ` • Max ${item.maxFileSizeMB || 10} MB`}
                  </div>

                  <div className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                    Time remaining: {formatRemainingTime(item, nowTick)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onNavigate(
                      item.navigateTo || `/student/courses/${item.course?.id}?tab=submissions`
                    )
                  }
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                  {item.actionLabel || "Go to Submission Page"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AcademicCalendarPreview({ className = "", calendar, loading, onViewCalendar }) {
  const events = useMemo(
    () => getDashboardAcademicEvents(calendar?.events || [], 3),
    [calendar]
  );

  return (
    <section className={`${className} relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-white via-violet-50/60 to-sky-50/70 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 sm:p-6`}>
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
      <div className="pointer-events-none absolute -bottom-16 left-0 h-40 w-40 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />

      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              <CalendarIcon />
              Academic Calendar
            </div>

            <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
              Upcoming Academic Days & Events
            </h2>

            {calendar?.semester || calendar?.academicYear ? (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {[calendar?.semester, calendar?.academicYear].filter(Boolean).join(" • ")}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onViewCalendar}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            View Calendar
            <ArrowRightIcon />
          </button>
        </div>

        {loading ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-[24px] border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-800/50"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-white/75 p-5 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-slate-600 dark:text-slate-300">
                <InfoIcon />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  No academic calendar events found
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Published academic calendar items will appear here for students.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {events.map((event) => {
              const categoryClass =
                categoryStyles[event.category] || categoryStyles.Other;

              return (
                <article
                  key={event.key}
                  className="rounded-[24px] border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/75"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryClass}`}
                    >
                      {event.category || "Other"}
                    </span>

                    {event.statusLabel ? (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {event.statusLabel}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-3 line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">
                    {event.title}
                  </h3>

                  <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <div className="inline-flex items-center gap-1.5">
                      <CalendarIcon />
                      <span>{event.dateText || event.formattedDate}</span>
                    </div>

                    {event.dayText ? (
                      <div className="inline-flex items-center gap-1.5 sm:flex">
                        <TagIcon />
                        <span>{event.dayText}</span>
                      </div>
                    ) : null}
                  </div>

                  {event.note ? (
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {event.note}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function getDueTime(dueDate) {
  if (!dueDate) return null;

  const parsed = new Date(dueDate).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function isPendingSubmissionActive(item, now = Date.now()) {
  if (!item) return false;
  if (item.isVisibleToStudents !== true) return false;
  if (item.submission) return false;
  if (item.submissionsOpen === false) return false;
  if (item.dueDatePassed === true) return false;

  const dueTime = getDueTime(item.dueDate);
  if (dueTime && dueTime <= now) return false;

  return true;
}

function formatRemainingTime(item, now = Date.now()) {
  const dueTime = getDueTime(item?.dueDate);

  if (!dueTime) return "No deadline set";

  const diff = Math.max(0, dueTime - now);

  if (diff <= 0) return "Deadline passed";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function makeLocalDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

function formatDate(date) {
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function startOfToday() {
  const now = new Date();
  return makeLocalDate(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDatePart(part = "", defaults = {}) {
  const cleaned = String(part)
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = cleaned.match(/(\d{1,2})(?:\s+([A-Za-z]+))?(?:\s+(\d{4}))?/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthText = match[2]?.toLowerCase();
  const monthIndex = monthText ? monthMap[monthText] : defaults.monthIndex;
  const year = match[3] ? Number(match[3]) : defaults.year;

  if (!day || monthIndex === undefined || !year) return null;

  const date = makeLocalDate(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function parseAcademicDateRange(dateText = "") {
  const normalized = String(dateText)
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  const pieces = normalized.split(/\s*-\s*/);

  if (pieces.length >= 2) {
    const end = parseDatePart(pieces.slice(1).join(" - "));
    const start = parseDatePart(pieces[0], {
      monthIndex: end?.getMonth(),
      year: end?.getFullYear(),
    });

    if (start && end) {
      return start <= end ? { start, end } : { start, end: start };
    }
  }

  const single = parseDatePart(normalized);
  return single ? { start: single, end: single } : null;
}

function getStatusLabel(range) {
  if (!range) return "";

  const today = startOfToday();
  const msPerDay = 24 * 60 * 60 * 1000;

  if (range.start <= today && range.end >= today) return "Today";

  if (range.start > today) {
    const days = Math.ceil((range.start - today) / msPerDay);
    if (days === 1) return "Tomorrow";
    return `In ${days} days`;
  }

  return "Completed";
}

function getDashboardAcademicEvents(events = [], limit = 3) {
  const today = startOfToday();

  const withDates = events
    .map((event, index) => {
      const range = parseAcademicDateRange(event.dateText);
      return {
        ...event,
        key: event._id || `${event.title}-${index}`,
        range,
        formattedDate: range
          ? range.start.getTime() === range.end.getTime()
            ? formatDate(range.start)
            : `${formatDate(range.start)} - ${formatDate(range.end)}`
          : event.dateText,
        statusLabel: getStatusLabel(range),
        sortTime: range?.start?.getTime() ?? Number.MAX_SAFE_INTEGER,
        isUpcoming: range ? range.end >= today : false,
      };
    })
    .sort((a, b) => {
      if (a.sortTime !== b.sortTime) return a.sortTime - b.sortTime;
      return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    });

  const upcoming = withDates.filter((event) => event.isUpcoming);

  if (upcoming.length > 0) {
    return upcoming.slice(0, limit);
  }

  return withDates.slice(0, limit);
}

export default StudentDashboard;

/* ---------- UI Components ---------- */

function QuickButton({ label, icon, onClick, primary = false }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex min-h-[58px] items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center text-xs font-semibold leading-snug transition-all duration-200 sm:text-sm",
        "focus:outline-none focus:ring-2 focus:ring-violet-500/40",
        primary
          ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:bg-slate-800",
      ].join(" ")}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ---------- Icons ---------- */

function ArrowRightIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function CounsellingIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M4 21a8 8 0 0 1 16 0" />
      <path d="M19 8h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2l-3 3v-3h-1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function AttendanceIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M8 2v4M16 2v4" />
      <path d="M3 10h18" />
      <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M8 14l2 2 4-4" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 9h16M4 15h16" />
      <path d="M10 3L8 21M16 3l-2 18" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20.59 13.41L11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M8 2v4M16 2v4" />
      <path d="M3 10h18" />
      <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10z" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
