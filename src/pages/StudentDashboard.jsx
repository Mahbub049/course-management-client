import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthData, getAuthItem } from "../utils/authStorage";
import { useTheme } from "../context/ThemeContext";
import { fetchStudentCourses } from "../services/studentService";
import {
  fetchStudentSubmissionAssessments,
  getPublicFileUrl,
  submitStudentLabAssessmentFile,
} from "../services/labSubmissionService";
import Swal from "sweetalert2";
import SmartFileActions from "../components/SmartFileActions";
import { fetchStudentPendingProjectSubmissions } from "../services/projectSubmissionService";

const actionItems = [
  {
    title: "Marks",
    description: "View your published marks, totals, grades and assessment breakdowns.",
    route: "/student/marks",
    accent: "violet",
    icon: <CoursesIcon />,
  },
  {
    title: "Submissions",
    description: "Open running submissions and review previous submission tasks by course.",
    route: "/student/submissions",
    accent: "amber",
    icon: <SubmissionIcon />,
  },
  {
    title: "Attendance",
    description: "Check your class attendance records and overall attendance status.",
    route: "/student/attendance",
    accent: "emerald",
    icon: <AttendanceIcon />,
  },
  {
    title: "Counselling",
    description: "Request counselling appointments and review appointment updates.",
    route: "/student/counselling",
    accent: "sky",
    icon: <CounsellingIcon />,
  },
  {
    title: "Issues",
    description: "Create academic issues and monitor replies from your teacher.",
    route: "/student/issues",
    accent: "indigo",
    icon: <ComplaintsIcon />,
  },
  {
    title: "Academic Calendar",
    description: "View important university dates, examinations, holidays and events.",
    route: "/academic-calendar",
    accent: "amber",
    icon: <CalendarIcon />,
  },
];

function StudentDashboard() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const studentName = getAuthItem("marksPortalName") || "Student";
  const studentRoll = getAuthItem("marksPortalUsername") || "—";
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [submissionRefreshKey, setSubmissionRefreshKey] = useState(0);
  const [submissionsCollapsed, setSubmissionsCollapsed] = useState(() => {
    return localStorage.getItem("studentDashboardSubmissionsCollapsed") === "true";
  });

  const handleLogout = () => {
    clearAuthData();
    localStorage.removeItem("marksPortalRememberMe");
    sessionStorage.removeItem("studentCoursesCache");
    navigate("/login", { replace: true });
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);


  useEffect(() => {
    let active = true;
    fetchStudentCourses()
      .then((list) => {
        if (!active) return;
        sessionStorage.setItem("studentCoursesCache", JSON.stringify(Array.isArray(list) ? list : []));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "studentDashboardSubmissionsCollapsed",
      String(submissionsCollapsed)
    );
  }, [submissionsCollapsed]);

  useEffect(() => {
    let cancelled = false;

    const loadPendingSubmissions = async () => {
      setSubmissionsLoading(true);

      try {
        const [assessmentData, projectData] = await Promise.all([
          fetchStudentSubmissionAssessments().catch((error) => {
            console.error("Could not load pending assessment submissions", error);
            return [];
          }),
          fetchStudentPendingProjectSubmissions().catch((error) => {
            console.error("Could not load pending project submissions", error);
            return [];
          }),
        ]);

        if (cancelled) return;

        const assessmentItems = Array.isArray(assessmentData)
          ? assessmentData.map((item) => ({
              ...item,
              taskType: "lab_submission",
              taskLabel: "Assessment Submission",
              navigateTo: `/student/submissions?course=${item.course?.id || ""}`,
            }))
          : [];

        const projectItems = Array.isArray(projectData)
          ? projectData.map((item) => ({
              ...item,
              taskType: "project_phase",
              taskLabel: item.submissionLabel || "Project Phase",
              navigateTo: item.missingGroup
                ? `/student/courses/${item.course?.id}?tab=project&projectTab=my-group`
                : `/student/courses/${item.course?.id}?tab=project&projectTab=workflow&phaseId=${item.phaseId || item.id}`,
            }))
          : [];

        const items = [...assessmentItems, ...projectItems]
          .filter((item) => isPendingSubmissionActive(item, Date.now()))
          .sort((a, b) => {
            const aDue = getDueTime(a.dueDate) || Number.MAX_SAFE_INTEGER;
            const bDue = getDueTime(b.dueDate) || Number.MAX_SAFE_INTEGER;
            return aDue - bDue;
          });

        setPendingSubmissions(items);
      } finally {
        if (!cancelled) setSubmissionsLoading(false);
      }
    };

    loadPendingSubmissions();

    return () => {
      cancelled = true;
    };
  }, [submissionRefreshKey]);

  const activePendingSubmissions = useMemo(
    () => pendingSubmissions.filter((item) => isPendingSubmissionActive(item, nowTick)),
    [pendingSubmissions, nowTick]
  );

  const openDashboardAction = async (item) => {
    if (item.route !== "/student/marks") {
      navigate(item.route);
      return;
    }

    try {
      let list = [];
      try {
        list = JSON.parse(sessionStorage.getItem("studentCoursesCache") || "[]");
      } catch {
        list = [];
      }
      if (!Array.isArray(list) || list.length === 0) {
        const data = await fetchStudentCourses();
        list = Array.isArray(data) ? data : [];
        sessionStorage.setItem("studentCoursesCache", JSON.stringify(list));
      }
      if (list.length === 1) {
        const id = list[0]?._id || list[0]?.id;
        if (id) {
          navigate(`/student/courses/${id}`);
          return;
        }
      }
    } catch {
      // Fall back to the marks selector page.
    }
    navigate("/student/marks");
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Mobile dashboard */}
      <section className="space-y-4 md:hidden">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-violet-50/70 to-sky-50/70 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-violet-600 dark:text-violet-300">
              Student Portal
            </p>
            <h1 className="mt-2 break-words text-xl font-bold tracking-tight text-slate-950 dark:text-white">
              {greeting}, {studentName}
            </h1>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
              <IdCardIcon />
              Roll {studentRoll}
            </div>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] gap-2">
              <DashboardUtilityButton
                compact
                onClick={() => navigate("/change-password")}
                label="Account"
                icon={<AccountIcon />}
              />
              <DashboardUtilityButton
                compact
                iconOnly
                onClick={toggleTheme}
                label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                icon={isDark ? <SunIcon /> : <MoonIcon />}
              />
              <DashboardUtilityButton
                compact
                onClick={handleLogout}
                label="Logout"
                icon={<LogoutIcon />}
                danger
              />
            </div>
          </div>
        </div>

        {!submissionsLoading && activePendingSubmissions.length > 0 && (
          <CompactSubmissionPanel
            items={activePendingSubmissions}
            loading={submissionsLoading}
            collapsed={submissionsCollapsed}
            nowTick={nowTick}
            onToggle={() => setSubmissionsCollapsed((value) => !value)}
            onOpen={(item) => navigate(item.navigateTo || "/student/submissions")}
            onUploaded={() => setSubmissionRefreshKey((value) => value + 1)}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          {actionItems.map((item) => (
            <MobileActionCard
              key={item.route}
              title={item.title}
              icon={item.icon}
              accent={item.accent}
              onClick={() => openDashboardAction(item)}
            />
          ))}
        </div>
      </section>

      {/* Desktop dashboard */}
      <section className="hidden space-y-5 md:block">
        <div className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-gradient-to-br from-white via-violet-50/55 to-sky-50/70 p-7 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 lg:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-violet-700 shadow-sm dark:border-violet-500/20 dark:bg-slate-800/80 dark:text-violet-300">
                <StudentIcon />
                Student Dashboard
              </div>

              <h1 className="mt-5 break-words text-3xl font-black tracking-tight text-slate-950 dark:text-white lg:text-4xl">
                {greeting}, {studentName}
              </h1>

              <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800/85 dark:text-slate-200">
                <IdCardIcon />
                Roll {studentRoll}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-[420px] lg:justify-end">
              <DashboardUtilityButton
                onClick={() => navigate("/change-password")}
                label="Manage Account"
                icon={<AccountIcon />}
              />
              <DashboardUtilityButton
                onClick={toggleTheme}
                label={isDark ? "Light Mode" : "Dark Mode"}
                icon={isDark ? <SunIcon /> : <MoonIcon />}
              />
              <DashboardUtilityButton
                onClick={handleLogout}
                label="Logout"
                icon={<LogoutIcon />}
                danger
              />
            </div>
          </div>
        </div>

        {!submissionsLoading && activePendingSubmissions.length > 0 && (
          <CompactSubmissionPanel
            items={activePendingSubmissions}
            loading={submissionsLoading}
            collapsed={submissionsCollapsed}
            nowTick={nowTick}
            onToggle={() => setSubmissionsCollapsed((value) => !value)}
            onOpen={(item) => navigate(item.navigateTo || "/student/submissions")}
            onUploaded={() => setSubmissionRefreshKey((value) => value + 1)}
          />
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {actionItems.map((item) => (
            <DesktopActionCard
              key={item.route}
              title={item.title}
              description={item.description}
              icon={item.icon}
              accent={item.accent}
              onClick={() => openDashboardAction(item)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DashboardUtilityButton({
  onClick,
  label,
  icon,
  danger = false,
  compact = false,
  iconOnly = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={[
        "inline-flex items-center justify-center rounded-xl border font-bold shadow-sm transition",
        iconOnly ? "gap-0" : "gap-1.5",
        compact
          ? iconOnly
            ? "h-10 w-11 min-w-0 p-0"
            : "h-10 w-full min-w-0 whitespace-nowrap px-2 text-[11px]"
          : "px-3.5 py-2 text-xs",
        danger
          ? "border-rose-200 bg-white/90 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900/80 dark:text-rose-300 dark:hover:bg-rose-500/10"
          : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-800",
      ].join(" ")}
    >
      {icon && (
        <span className={compact ? "inline-flex [&>svg]:h-4 [&>svg]:w-4" : "inline-flex [&>svg]:h-4 [&>svg]:w-4"}>
          {icon}
        </span>
      )}
      {!iconOnly && <span className="min-w-0 truncate">{label}</span>}
    </button>
  );
}

function CompactSubmissionPanel({
  items,
  loading,
  collapsed,
  nowTick,
  onToggle,
  onOpen,
  onUploaded,
}) {
  const [uploadingId, setUploadingId] = useState("");
  const visibleItems = items.slice(0, 2);
  const nearestItem = items[0];

  const handleFileSelection = async (item, file, inputElement) => {
    if (!file || item?.taskType !== "lab_submission") return;

    const maxFileSizeMB = Number(item.maxFileSizeMB || 10);
    const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;

    if (Number(file.size || 0) > maxFileSizeBytes) {
      await Swal.fire({
        icon: "error",
        title: "File is too large",
        text: `Please select a file that is ${maxFileSizeMB} MB or smaller.`,
      });
      if (inputElement) inputElement.value = "";
      return;
    }

    const allowedExtensions = normalizeAllowedExtensions(item.allowedExtensions);
    const selectedExtension = getFileExtension(file.name);

    if (
      allowedExtensions.length > 0 &&
      !allowedExtensions.includes(selectedExtension)
    ) {
      await Swal.fire({
        icon: "error",
        title: "Unsupported file type",
        text: `Allowed file types: ${allowedExtensions
          .map((extension) => extension.toUpperCase())
          .join(", ")}.`,
      });
      if (inputElement) inputElement.value = "";
      return;
    }

    const replacingExistingFile = Boolean(item.submission);

    // Upload immediately after the student chooses a valid file.
    // The extra confirmation dialog made replacement unnecessarily repetitive.
    setUploadingId(item.id);

    try {
      const response = await submitStudentLabAssessmentFile(item.id, file);

      await Swal.fire({
        icon: "success",
        title: replacingExistingFile ? "File replaced" : "Submission completed",
        text:
          response?.message ||
          (replacingExistingFile
            ? "Your submitted file was replaced successfully."
            : "Your file was submitted successfully."),
      });

      onUploaded?.();
    } catch (error) {
      console.error("Dashboard submission upload failed", error);
      await Swal.fire({
        icon: "error",
        title: "Upload failed",
        text:
          error?.response?.data?.message ||
          "The file could not be submitted. Please try again.",
      });
    } finally {
      setUploadingId("");
      if (inputElement) inputElement.value = "";
    }
  };

  return (
    <section className="overflow-hidden rounded-[24px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 shadow-sm dark:border-amber-500/20 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/20 md:rounded-[28px]">
      <div className="flex min-h-[62px] items-center gap-3 px-4 py-3 sm:px-5 md:min-h-[72px] md:px-6 md:py-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/20">
          <SubmissionIcon />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-slate-950 dark:text-white md:text-base">
              Pending Submissions
            </h2>
            {!loading && items.length > 0 ? (
              <span className="rounded-full border border-amber-200 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                {items.length} active
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400 md:text-sm">
            {loading
              ? "Checking submission deadlines..."
              : nearestItem
                ? `${nearestItem.course?.code || "Course"} · ${formatRemainingTime(nearestItem, nowTick)}`
                : "No active submission is waiting."}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          disabled={loading || items.length === 0}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/85 text-slate-500 transition hover:border-amber-300 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800/85 dark:text-slate-400 dark:hover:border-amber-500/40 dark:hover:text-amber-300"
          aria-label={collapsed ? "Expand pending submissions" : "Minimize pending submissions"}
          title={collapsed ? "Expand" : "Minimize"}
        >
          {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
      </div>

      {!collapsed && (
        <div className="border-t border-amber-200/70 px-3 pb-3 pt-3 dark:border-amber-500/15 sm:px-4 sm:pb-4 md:px-5 md:pb-5 md:pt-4">
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[1, 2].map((item) => (
                <div
                  key={item}
                  className="h-[190px] animate-pulse rounded-2xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-800/60"
                />
              ))}
            </div>
          ) : (
            <div
              className={
                visibleItems.length === 1
                  ? "grid gap-3"
                  : "grid gap-3 md:grid-cols-2"
              }
            >
              {visibleItems.map((item) => {
                const courseLabel = [
                  item.course?.code,
                  item.course?.section ? `Section ${item.course.section}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ");

                const isLabSubmission = item.taskType === "lab_submission";
                const submitted = Boolean(item.submission);
                const dueTime = getDueTime(item.dueDate);
                const canUpload =
                  isLabSubmission &&
                  item.submissionsOpen !== false &&
                  item.dueDatePassed !== true &&
                  (!dueTime || dueTime > nowTick) &&
                  (!submitted || item.allowResubmission !== false);
                const submissionUrl = getPublicFileUrl(
                  item.submission?.downloadUrl || item.submission?.fileUrl || ""
                );
                const resourceUrl = item.resourceUrl
                  ? getPublicFileUrl(item.resourceUrl)
                  : "";
                const statusLabel = submitted
                  ? "Submitted"
                  : item.missingGroup
                    ? "Group required"
                    : "Not submitted";

                return (
                  <article
                    key={`${item.taskType}-${item.id}`}
                    className="min-w-0 rounded-2xl border border-slate-200/90 bg-white/90 p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 sm:p-4 md:rounded-[22px] md:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-slate-900 dark:text-white md:text-base">
                          {item.name || item.taskLabel || "Submission"}
                        </div>
                        <div className="mt-1 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400 md:text-xs">
                          {courseLabel || "Course submission"}
                        </div>
                      </div>

                      <span
                        className={[
                          "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold",
                          submitted
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : item.missingGroup
                              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
                        ].join(" ")}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 md:mt-4 md:gap-3">
                      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 dark:border-amber-500/15 dark:bg-amber-500/10 md:px-4 md:py-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                          <ClockSmallIcon />
                          Time Remaining
                        </div>
                        <div className="mt-1 text-sm font-black text-slate-900 dark:text-white md:text-lg">
                          {formatRemainingTime(item, nowTick)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/70 md:px-4 md:py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                          Deadline
                        </div>
                        <div className="mt-1 text-xs font-bold leading-5 text-slate-800 dark:text-slate-100 md:text-sm">
                          {formatCompactDeadline(item.dueDate)}
                        </div>
                      </div>
                    </div>

                    {submitted ? (
                      <div className="mt-2 truncate text-[11px] text-slate-500 dark:text-slate-400 md:mt-3 md:text-xs">
                        Submitted {formatSubmittedAt(item.submission?.submittedAt)}
                        {item.submission?.originalFileName
                          ? ` · ${item.submission.originalFileName}`
                          : ""}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2 md:mt-4 md:gap-2.5">
                      {resourceUrl && resourceUrl !== "#" ? (
                        <a
                          href={resourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-[11px] font-bold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20 sm:flex-none md:min-h-10 md:px-4 md:text-sm"
                        >
                          <ExternalLinkIcon />
                          View Resource
                        </a>
                      ) : null}

                      {submitted && submissionUrl && submissionUrl !== "#" ? (
                        <SmartFileActions
                          file={{
                            ...item.submission,
                            downloadUrl: submissionUrl,
                          }}
                          compact
                          previewLabel="View Submission"
                          showDownload={false}
                          className="flex-1 sm:flex-none [&>button]:min-h-9 [&>button]:w-full [&>button]:px-3 [&>button]:text-[11px] md:[&>button]:min-h-10 md:[&>button]:px-4 md:[&>button]:text-sm"
                        />
                      ) : null}

                      {canUpload ? (
                        <label className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-700 sm:flex-none md:min-h-10 md:px-4 md:text-sm">
                          <UploadIcon />
                          {uploadingId === item.id
                            ? "Uploading..."
                            : submitted
                              ? "Replace File"
                              : "Submit File"}
                          <input
                            type="file"
                            className="hidden"
                            accept={buildAcceptValue(item.allowedExtensions)}
                            disabled={uploadingId === item.id}
                            onChange={(event) =>
                              handleFileSelection(
                                item,
                                event.target.files?.[0],
                                event.target
                              )
                            }
                          />
                        </label>
                      ) : null}

                      {!isLabSubmission ? (
                        <button
                          type="button"
                          onClick={() => onOpen(item)}
                          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-[11px] font-bold text-slate-950 transition hover:bg-amber-400 sm:flex-none md:min-h-10 md:px-4 md:text-sm"
                        >
                          {item.missingGroup ? "Create Group" : "Submit Project"}
                          <ArrowIcon />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpen(item)}
                          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:flex-none md:min-h-10 md:px-4 md:text-sm"
                        >
                          Details
                          <ArrowIcon />
                        </button>
                      )}
                    </div>

                    {isLabSubmission && submitted && item.allowResubmission === false ? (
                      <p className="mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        Resubmission is disabled for this task.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          {!loading && items.length > 2 ? (
            <div className="mt-2 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              +{items.length - 2} more pending {items.length - 2 === 1 ? "submission" : "submissions"}. Open Courses to view all.
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function normalizeAllowedExtensions(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((extension) => String(extension || "").trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

function buildAcceptValue(value) {
  return normalizeAllowedExtensions(value)
    .map((extension) => `.${extension}`)
    .join(",");
}

function getFileExtension(fileName = "") {
  const name = String(fileName || "");
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
}

function formatSubmittedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDueTime(dueDate) {
  if (!dueDate) return null;
  const parsed = new Date(dueDate).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function isPendingSubmissionActive(item, now = Date.now()) {
  if (!item) return false;
  if (item.isVisibleToStudents !== true) return false;
  if (item.taskType === "project_phase" && item.submission) return false;
  if (item.submissionsOpen === false) return false;
  if (item.dueDatePassed === true) return false;

  const dueTime = getDueTime(item.dueDate);
  if (dueTime && dueTime <= now) return false;

  return true;
}

function formatRemainingTime(item, now = Date.now()) {
  const dueTime = getDueTime(item?.dueDate);
  if (!dueTime) return "No deadline";

  const diff = dueTime - now;
  if (diff <= 0) return "Deadline passed";

  const totalSeconds = Math.max(0, Math.floor(diff / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s left`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s left`;
  return `${minutes}m ${seconds}s left`;
}

function formatCompactDeadline(value) {
  if (!value) return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline";

  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MobileActionCard({ title, icon, accent, onClick }) {
  const accentClasses = {
    violet: "from-violet-500 to-fuchsia-500 shadow-violet-500/20",
    emerald: "from-emerald-500 to-cyan-500 shadow-emerald-500/20",
    sky: "from-sky-500 to-blue-600 shadow-sky-500/20",
    indigo: "from-indigo-500 to-violet-600 shadow-indigo-500/20",
    amber: "from-amber-400 to-orange-500 shadow-amber-500/20",
    rose: "from-rose-500 to-pink-600 shadow-rose-500/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-[112px] rounded-[24px] border border-slate-200/80 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${
              accentClasses[accent] || accentClasses.violet
            }`}
          >
            {icon}
          </span>
          <span className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500 dark:text-slate-600">
            <ArrowIcon />
          </span>
        </div>

        <div className="text-sm font-bold leading-5 text-slate-900 dark:text-white">
          {title}
        </div>
      </div>
    </button>
  );
}

function DesktopActionCard({ title, description, icon, accent, onClick }) {
  const accentClasses = {
    violet: {
      icon: "from-violet-500 to-fuchsia-500 shadow-violet-500/20",
      glow: "from-violet-500/10 via-fuchsia-500/5 to-transparent",
      hover: "hover:border-violet-300 dark:hover:border-violet-500/40",
    },
    emerald: {
      icon: "from-emerald-500 to-cyan-500 shadow-emerald-500/20",
      glow: "from-emerald-500/10 via-cyan-500/5 to-transparent",
      hover: "hover:border-emerald-300 dark:hover:border-emerald-500/40",
    },
    sky: {
      icon: "from-sky-500 to-blue-600 shadow-sky-500/20",
      glow: "from-sky-500/10 via-blue-500/5 to-transparent",
      hover: "hover:border-sky-300 dark:hover:border-sky-500/40",
    },
    indigo: {
      icon: "from-indigo-500 to-violet-600 shadow-indigo-500/20",
      glow: "from-indigo-500/10 via-violet-500/5 to-transparent",
      hover: "hover:border-indigo-300 dark:hover:border-indigo-500/40",
    },
    amber: {
      icon: "from-amber-400 to-orange-500 shadow-amber-500/20",
      glow: "from-amber-500/10 via-orange-500/5 to-transparent",
      hover: "hover:border-amber-300 dark:hover:border-amber-500/40",
    },
    rose: {
      icon: "from-rose-500 to-pink-600 shadow-rose-500/20",
      glow: "from-rose-500/10 via-pink-500/5 to-transparent",
      hover: "hover:border-rose-300 dark:hover:border-rose-500/40",
    },
  };

  const styles = accentClasses[accent] || accentClasses.violet;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative min-h-[190px] overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-6 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-800 dark:bg-slate-900 ${styles.hover}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.glow}`} />
      <div className="pointer-events-none absolute -bottom-14 -right-14 h-36 w-36 rounded-full border border-slate-200/60 dark:border-slate-700/50" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <span
            className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br p-3.5 text-white shadow-lg ${styles.icon}`}
          >
            {icon}
          </span>
          <span className="rounded-xl border border-slate-200 bg-white/85 p-2 text-slate-400 transition group-hover:translate-x-0.5 group-hover:border-slate-300 group-hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800/85 dark:text-slate-500 dark:group-hover:text-slate-200">
            <ArrowIcon />
          </span>
        </div>

        <h2 className="mt-5 text-lg font-bold text-slate-950 dark:text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </button>
  );
}

export default StudentDashboard;

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function CoursesIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </svg>
  );
}

function AttendanceIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 15l2 2 5-5" />
    </svg>
  );
}

function CounsellingIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M4 21a8 8 0 0 1 16 0" />
      <path d="M18 5h3v5h-3l-2 2v-2h-1" />
    </svg>
  );
}

function ComplaintsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}


function SunIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  );
}

function IdCardIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M5.5 16a3 3 0 0 1 5 0M13 10h5M13 14h4" />
    </svg>
  );
}

function StudentIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 10 12 4 2 10l10 6 10-6z" />
      <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
    </svg>
  );
}


function SubmissionIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v5h5M10 13h6M10 17h4" />
    </svg>
  );
}


function ClockSmallIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 3h7v7" />
      <path d="m10 14 11-11" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

