import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthItem } from "../utils/authStorage";
import {
  fetchTeacherComplaints,
  replyTeacherComplaint,
  resolveAttendanceComplaint,
} from "../services/complaintService";
import { fetchTeacherCourses, updateCourseRequest } from "../services/courseService";
import Swal from "sweetalert2";
import { attendanceIssueRefs } from "../utils/issueAccess";

const STATUS_BADGE_CLASSES = {
  open: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  in_review:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  resolved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  rejected:
    "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600",
};

const STATUS_LABEL = {
  open: "Open",
  in_review: "In Review",
  resolved: "Resolved",
  rejected: "Rejected",
};

const CATEGORY_BADGE_CLASSES = {
  marks:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20",
  attendance:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  general:
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const CATEGORY_LABEL = {
  marks: "Marks",
  attendance: "Attendance",
  general: "General",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStudentRoll(student) {
  return student?.roll || student?.username || "—";
}

function getAttendancePercentage(stats) {
  if (!stats || stats.percentage == null) return "—";
  return `${Number(stats.percentage).toFixed(2)}%`;
}

function getAttendanceCount(stats) {
  return stats?.totalClasses > 0
    ? `${stats.totalPresent}/${stats.totalClasses} classes`
    : "No recorded classes";
}

function isSameStudentCourse(first, second) {
  return (
    String(first?.student?._id || first?.student || "") ===
      String(second?.student?._id || second?.student || "") &&
    String(first?.course?._id || first?.course || "") ===
      String(second?.course?._id || second?.course || "")
  );
}

function getComponentText(c) {
  const cat = c?.category || "marks";

  if (cat === "attendance") {
    const refs = attendanceIssueRefs(c);
    if (refs.length === 1) return `${refs[0].date} (P${refs[0].period})`;
    return refs.length ? `${refs.length} attendance sessions` : "Attendance";
  }

  if (cat === "general") {
    return "General Issue";
  }

  return c?.assessment?.name || "Whole course";
}

const toInputDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const toIsoDate = (value) => value ? new Date(value).toISOString() : null;
const getCourseId = (course) => course?._id || course?.id || "";
const prepareDraft = (course) => {
  const settings = course?.complaintSettings || {};
  return {
    attendanceTargetPercentage: settings.attendanceTargetPercentage ?? 50,
    categories: Object.fromEntries(["marks", "attendance", "general"].map((category) => {
      const rule = settings.categories?.[category] || {};
      return [category, {
        enabled: rule.enabled !== false,
        startAt: toInputDate(rule.startAt),
        endAt: toInputDate(rule.endAt),
      }];
    })),
  };
};

export default function TeacherComplaintsPage() {
  const navigate = useNavigate();
  const role = getAuthItem("marksPortalRole");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [complaints, setComplaints] = useState([]);
  const [courses, setCourses] = useState([]);
  const [courseSettingsLoading, setCourseSettingsLoading] = useState(true);
  const [togglingCourseId, setTogglingCourseId] = useState("");
  const [showCourseControls, setShowCourseControls] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({});
  const [includeAllPending, setIncludeAllPending] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [groupAttendance, setGroupAttendance] = useState(true);

  const [selected, setSelected] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role !== "teacher") navigate("/login");
  }, [role, navigate]);

  useEffect(() => {
    if (role !== "teacher") return;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [complaintData, courseData] = await Promise.all([
          fetchTeacherComplaints(),
          fetchTeacherCourses({ archived: false }),
        ]);

        setComplaints(complaintData || []);
        setCourses(Array.isArray(courseData) ? courseData : []);
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || "Failed to load issues");
      } finally {
        setLoading(false);
        setCourseSettingsLoading(false);
      }
    };

    load();
  }, [role]);

  const handleResolveAttendance = async () => {
    if (!selected) return;
    const related = complaints.filter((issue) =>
      issue.category === "attendance" && isSameStudentCourse(issue, selected) &&
      ["open", "in_review"].includes(issue.status));
    const pendingCount = includeAllPending ? related.length : 1;
    const sessionCount = (includeAllPending ? related : [selected])
      .reduce((count, issue) => count + attendanceIssueRefs(issue).length, 0);
    const confirm = await Swal.fire({
      icon: "question", title: "Approve attendance correction?",
      html: `This will mark <b>${sessionCount} class(es) present</b> and resolve <b>${pendingCount} issue(s)</b>. Please verify the submitted application and evidence first.`,
      showCancelButton: true, confirmButtonText: "Yes, approve", reverseButtons: true,
    });
    if (!confirm.isConfirmed) return;
    setSaving(true);
    try {
      const res = await resolveAttendanceComplaint(selected._id, replyDraft, includeAllPending);
      const changed = new Map((res.complaints || []).map((issue) => [issue._id, issue]));
      const updated = res.complaint;
      setComplaints((prev) => prev.map((issue) => {
        if (changed.has(issue._id)) return changed.get(issue._id);
        if (issue.category === "attendance" && isSameStudentCourse(issue, updated)) {
          return { ...issue, attendanceStats: updated.attendanceStats };
        }
        return issue;
      }));
      setSelected(updated);
      setReplyDraft(updated.reply || "");
      Swal.fire({
        icon: "success", title: "Attendance updated",
        text: `${res.updatedSessions} session(s) updated · ${res.resolvedCount} application(s) resolved.`,
        timer: 2000, showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Unable to resolve",
        text: err?.response?.data?.message || "Attendance correction failed." });
    } finally {
      setSaving(false);
    }
  };

  const courseOptions = useMemo(() => {
    const map = new Map();

    courses.forEach((c) => {
      const key = c._id || c.id;
      const label = `${c.code || ""}${c.title ? " – " + c.title : ""}`;
      if (key && !map.has(key)) map.set(key, label);
    });

    complaints.forEach((c) => {
      if (c.course) {
        const key = c.course._id || c.course.code;
        const label = `${c.course.code || ""}${c.course.title ? " – " + c.course.title : ""}`;
        if (!map.has(key)) map.set(key, label);
      }
    });

    return Array.from(map.entries());
  }, [complaints, courses]);

  const handleToggleComplaintSubmission = async (course, nextValue) => {
    const courseId = course?._id || course?.id;
    if (!courseId) return;

    setTogglingCourseId(courseId);

    try {
      const updated = await updateCourseRequest(courseId, {
        complaintSettings: {
          allowStudentComplaints: nextValue,
          closedMessage:
            course?.complaintSettings?.closedMessage ||
            "Issue submission is currently closed by the course teacher.",
        },
      });

      const updatedSettings = updated?.complaintSettings || {
        allowStudentComplaints: nextValue,
        closedMessage:
          course?.complaintSettings?.closedMessage ||
          "Issue submission is currently closed by the course teacher.",
      };

      setCourses((prev) =>
        prev.map((item) => {
          const id = item._id || item.id;
          return id === courseId
            ? { ...item, complaintSettings: updatedSettings }
            : item;
        })
      );

      Swal.fire({
        icon: "success",
        title: nextValue ? "Issues opened" : "Issues closed",
        text: nextValue
          ? "Students can submit issues for this course now."
          : "Students cannot submit new issues for this course now.",
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Failed",
        text:
          err?.response?.data?.message ||
          "Failed to update issue submission setting.",
      });
    } finally {
      setTogglingCourseId("");
    }
  };

  const changeSettingsDraft = (course, category, field, value) => {
    const id = getCourseId(course);
    setSettingsDraft((current) => {
      const draft = current[id] || prepareDraft(course);
      return { ...current, [id]: category
        ? { ...draft, categories: { ...draft.categories,
            [category]: { ...draft.categories[category], [field]: value } } }
        : { ...draft, [field]: value } };
    });
  };

  const saveSettingsDraft = async (course) => {
    const id = getCourseId(course);
    const draft = settingsDraft[id] || prepareDraft(course);
    setTogglingCourseId(id);
    try {
      const target = Number(draft.attendanceTargetPercentage);
      if (!(target > 0 && target <= 100)) throw new Error("Target must be between 0.01% and 100%.");
      const categories = Object.fromEntries(Object.entries(draft.categories).map(([name, rule]) => [
        name, { enabled: rule.enabled, startAt: toIsoDate(rule.startAt), endAt: toIsoDate(rule.endAt) },
      ]));
      const updated = await updateCourseRequest(id, { complaintSettings: {
        ...course.complaintSettings,
        attendanceTargetPercentage: target, categories,
      }});
      setCourses((prev) => prev.map((item) => getCourseId(item) === id
        ? { ...item, complaintSettings: updated?.complaintSettings || { ...item.complaintSettings, categories, attendanceTargetPercentage: target } }
        : item));
      setSettingsDraft((prev) => { const next = { ...prev }; delete next[id]; return next; });
      Swal.fire({ icon: "success", title: "Issue access saved", timer: 1300, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Could not save settings",
        text: err?.response?.data?.message || err?.message || "Please try again." });
    } finally { setTogglingCourseId(""); }
  };

  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (categoryFilter !== "all" && (c.category || "marks") !== categoryFilter) {
        return false;
      }

      if (courseFilter !== "all" && c.course) {
        const key = c.course._id || c.course.code;
        if (key !== courseFilter) return false;
      }

      if (search.trim()) {
        const q = search.trim().toLowerCase();

        const attendanceText = c.category === "attendance"
          ? attendanceIssueRefs(c).map((r) => `${r.date} period ${r.period}`).join(" ")
          : "";

        const text = [
          c.student?.name,
          c.student?.roll,
          c.student?.username,
          c.course?.code,
          c.course?.title,
          c.category,
          CATEGORY_LABEL[c.category],
          c.assessment?.name,
          attendanceText,
          c.message,
          c.reply,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [complaints, statusFilter, categoryFilter, courseFilter, search]);

  const displayComplaints = useMemo(() => {
    if (!groupAttendance) return filteredComplaints;
    const grouped = new Map();
    const display = [];
    for (const issue of filteredComplaints) {
      if (issue.category !== "attendance") {
        display.push(issue);
        continue;
      }
      const student = String(issue.student?._id || issue.student || "");
      const course = String(issue.course?._id || issue.course || "");
      const key = `${student}:${course}:${issue.status}`;
      if (!grouped.has(key)) {
        const item = { ...issue, _groupCount: 1, _groupSessions: attendanceIssueRefs(issue).length };
        grouped.set(key, item);
        display.push(item);
      } else {
        const current = grouped.get(key);
        current._groupCount += 1;
        current._groupSessions += attendanceIssueRefs(issue).length;
      }
    }
    return display;
  }, [filteredComplaints, groupAttendance]);

  const courseSubmissionStats = useMemo(() => {
    const open = courses.filter(
      (course) => course?.complaintSettings?.allowStudentComplaints !== false
    ).length;

    return {
      open,
      closed: Math.max(0, courses.length - open),
    };
  }, [courses]);

  const stats = useMemo(() => {
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === "open").length;
    const inReview = complaints.filter((c) => c.status === "in_review").length;
    const resolved = complaints.filter((c) => c.status === "resolved").length;
    return { total, open, inReview, resolved };
  }, [complaints]);

  const handleSelectComplaint = (c) => {
    setSelected(c);
    setReplyDraft(c.reply || "");
  };

  const handleSaveReplyOnly = async () => {
    if (!selected) return;

    setSaving(true);
    try {
      const updated = await replyTeacherComplaint(selected._id, replyDraft, selected.status);
      setComplaints((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      setSelected(updated);

      Swal.fire({
        icon: "success",
        title: "Saved",
        text: "Reply saved successfully.",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Failed",
        text: err?.response?.data?.message || "Failed to save reply. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!selected) return;

    setSaving(true);
    try {
      const updated = await replyTeacherComplaint(selected._id, replyDraft, newStatus);
      setComplaints((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      setSelected(updated);

      Swal.fire({
        icon: "success",
        title: "Updated",
        text: `Issue marked as ${STATUS_LABEL[newStatus] || newStatus}.`,
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Failed",
        text: err?.response?.data?.message || "Failed to update issue. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmReject = async () => {
    if (!selected) return;

    const result = await Swal.fire({
      title: "Reject issue?",
      text: "This will mark the issue as rejected.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, reject it",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      handleUpdateStatus("rejected");
    }
  };

  const confirmResolve = async () => {
    if (!selected) return;

    const result = await Swal.fire({
      title: "Mark resolved?",
      text: "This will mark the issue as resolved.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, mark resolved",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      handleUpdateStatus("resolved");
    }
  };

  const selectedBadge =
    STATUS_BADGE_CLASSES[selected?.status] ||
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

  const selectedCategory = selected?.category || "marks";
  const selectedCategoryBadge =
    CATEGORY_BADGE_CLASSES[selectedCategory] ||
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

  return (
    <div className="mx-auto space-y-8 px-4 py-1 md:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <ChatIcon />
            Issues Center
          </div>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Review & Reply
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Review student issues, reply clearly, and update issue status from one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Total" value={stats.total} />
          <StatChip label="Open" value={stats.open} tone="open" />
          <StatChip label="In Review" value={stats.inReview} tone="in_review" />
          <StatChip label="Resolved" value={stats.resolved} tone="resolved" />

          <button
            onClick={() => navigate("/teacher/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeftIcon />
            Dashboard
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div
          className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
            showCourseControls ? "border-b border-slate-100 dark:border-slate-800" : ""
          }`}
        >
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Student Issue Submission
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Course-wise access is hidden until needed.</span>
              {!courseSettingsLoading && courses.length > 0 && (
                <>
                  <span className="hidden text-slate-300 sm:inline dark:text-slate-700">•</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {courseSubmissionStats.open} open
                  </span>
                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                    {courseSubmissionStats.closed} closed
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCourseControls((current) => !current)}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
            aria-expanded={showCourseControls}
          >
            <ControlsIcon />
            {showCourseControls ? "Hide Access Controls" : "Manage Issue Access"}
            <span className={`transition-transform ${showCourseControls ? "rotate-180" : ""}`}>
              <ChevronDownIcon />
            </span>
          </button>
        </div>

        {showCourseControls && (
          <div className="p-5">
            {courseSettingsLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                Loading course issue settings...
              </div>
            ) : courses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                No active courses found.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {courses.map((course) => {
                  const id = getCourseId(course);
                  const isOpen = course?.complaintSettings?.allowStudentComplaints !== false;
                  const isToggling = togglingCourseId === id;
                  const draft = settingsDraft[id] || prepareDraft(course);
                  return (
                    <div key={id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/40">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{course.code} – {course.title}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Section {course.section || "—"} · {course.semester || "—"} {course.year || ""}</div>
                        </div>
                        <button type="button" disabled={isToggling}
                          onClick={() => handleToggleComplaintSubmission(course, !isOpen)}
                          className={`rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50 ${isOpen
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                          {isOpen ? "Issue submissions: On" : "Issue submissions: Off"}
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {["attendance", "marks", "general"].map((cat) => (
                          <label key={cat} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold dark:border-slate-700 ${draft.categories[cat].enabled
                            ? "border-indigo-200 bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                            : "border-slate-200 bg-slate-100 text-slate-400 dark:bg-slate-900"}`}>
                            <input type="checkbox" checked={draft.categories[cat].enabled}
                              onChange={(event) => changeSettingsDraft(course, cat, "enabled", event.target.checked)}
                              className="h-4 w-4 rounded text-indigo-600" />
                            {CATEGORY_LABEL[cat]}
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Minimum attendance (%)</label>
                        <input type="number" min="0.01" max="100" step="0.01" value={draft.attendanceTargetPercentage}
                          onChange={(event) => changeSettingsDraft(course, null, "attendanceTargetPercentage", event.target.value)}
                          className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                        <span className="text-xs text-slate-400">Student can request only enough sessions to reach this.</span>
                      </div>
                      <details className="mt-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">Optional category submission windows</summary>
                        <div className="mt-3 space-y-3">
                          {["attendance", "marks", "general"].map((cat) => (
                            <div key={cat} className="grid gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-[90px_1fr_1fr] sm:items-center">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{CATEGORY_LABEL[cat]}</span>
                              <label className="text-[11px] text-slate-500 dark:text-slate-400">Starts (optional)
                                <input type="datetime-local" value={draft.categories[cat].startAt}
                                  onChange={(event) => changeSettingsDraft(course, cat, "startAt", event.target.value)}
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                              </label>
                              <label className="text-[11px] text-slate-500 dark:text-slate-400">Ends (optional)
                                <input type="datetime-local" value={draft.categories[cat].endAt}
                                  onChange={(event) => changeSettingsDraft(course, cat, "endAt", event.target.value)}
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                              </label>
                            </div>
                          ))}
                        </div>
                      </details>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Save changes to apply to student submissions.</span>
                        <button type="button" disabled={isToggling} onClick={() => saveSettingsDraft(course)}
                          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                          {isToggling ? "Saving…" : "Save Rules"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filters</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Narrow down by type, status, course, or keywords
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setCategoryFilter("all");
              setCourseFilter("all");
              setSearch("");
            }}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Type
            </label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All types</option>
              <option value="attendance">Attendance</option>
              <option value="marks">Marks</option>
              <option value="general">General</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Status
            </label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Course
            </label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="all">All courses</option>
              {courseOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Search
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </span>
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Search by student, roll, course, component, date, period..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Loading issues...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <div className="font-semibold">Could not load issues</div>
          <div>{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr),minmax(380px,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Issues
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Showing {displayComplaints.length} row{displayComplaints.length === 1 ? "" : "s"}
                {groupAttendance ? ` · ${filteredComplaints.length} individual applications` : ""}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={groupAttendance} onChange={(e) => setGroupAttendance(e.target.checked)} className="rounded text-indigo-600" />
              Group attendance by student
            </label>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-3">
            {filteredComplaints.length === 0 && !loading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                No issues found for the current filters.
              </div>
            ) : (
              <div className="space-y-3">
                {displayComplaints.map((c) => {
                  const badgeClass =
                    STATUS_BADGE_CLASSES[c.status] ||
                    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

                  const cat = c.category || "marks";
                  const catBadge =
                    CATEGORY_BADGE_CLASSES[cat] ||
                    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

                  const isActive = selected?._id === c._id;
                  const componentText = c._groupCount > 1
                    ? `${c._groupSessions} sessions · ${c._groupCount} applications`
                    : getComponentText(c);

                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => handleSelectComplaint(c)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isActive
                          ? "border-indigo-300 bg-indigo-50/70 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Date
                            </div>
                            <div className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                              {formatDate(c.createdAt)}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Course
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {c.course?.code || "—"}
                            </div>
                            <div className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                              {c.course?.title || "No title"}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Student
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {c.student?.name || "Unknown"}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              Roll: {getStudentRoll(c.student)}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Intake {c.course?.intake || "—"} · Sec {c.course?.section || "—"}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Component
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                              {componentText}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${catBadge}`}
                              >
                                {CATEGORY_LABEL[cat] || "Marks"}
                              </span>

                              {cat === "attendance" && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                                    {getAttendancePercentage(c.attendanceStats)}
                                  </span>
                                  {" · "}{getAttendanceCount(c.attendanceStats)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}
                          >
                            {STATUS_LABEL[c.status] || c.status || "Open"}
                          </span>

                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                            View
                            <ChevronIcon />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="h-fit rounded-3xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Details</div>

            {selected ? (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedBadge}`}
              >
                {STATUS_LABEL[selected.status] || selected.status || "Open"}
              </span>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500">Select an issue</span>
            )}
          </div>

          <div className="p-5">
            {!selected ? (
              <div className="py-14 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <ChatIcon />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  No issue selected
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Choose an issue from the left panel to view its details.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                  <div className="text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">
                    {selected.course?.code || "—"} – {selected.course?.title || "Untitled Course"}
                  </div>

                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {selected.student?.name || "Unknown"}
                    </span>{" "}
                    <span>(Roll: {getStudentRoll(selected.student)})</span>
                  </div>

                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Intake {selected.course?.intake || "—"} · Sec {selected.course?.section || "—"}
                    {selectedCategory === "attendance" && (
                      <span className="ml-2">
                        · Attendance: <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {getAttendancePercentage(selected.attendanceStats)}
                        </span> ({getAttendanceCount(selected.attendanceStats)})
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${selectedCategoryBadge}`}
                    >
                      {CATEGORY_LABEL[selectedCategory] || "Marks"}
                    </span>

                    <Pill label={`Component: ${getComponentText(selected)}`} />

                    {selectedCategory === "attendance" && attendanceIssueRefs(selected).map((ref) => (
                      <Pill key={`${ref.date}-${ref.period}`} label={`${ref.date} (P${ref.period})`} />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Student application
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 shadow-sm whitespace-pre-wrap dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    {selected.message || "No message provided."}
                  </div>
                </div>

                {selectedCategory === "attendance" && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                      Other pending applications from this student · {complaints.filter((c) => c.category === "attendance" && isSameStudentCourse(c, selected) && ["open", "in_review"].includes(c.status) && c._id !== selected._id).length}
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto">
                      {complaints.filter((c) => c.category === "attendance" && isSameStudentCourse(c, selected) && ["open", "in_review"].includes(c.status) && c._id !== selected._id).map((issue) => (
                        <div key={issue._id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-semibold text-slate-800 dark:text-white">{attendanceIssueRefs(issue).map((ref) => `${ref.date} (P${ref.period})`).join(" · ")}</div>
                          <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{issue.message}</p>
                          {!!issue.attachments?.length && <div className="mt-2 flex flex-wrap gap-2">
                            {issue.attachments.map((file, i) => file.url ? <a key={i} href={file.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 underline dark:text-indigo-300">📎 {file.name}</a> : <span key={i}>{file.name}</span>)}
                          </div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!!selected.attachments?.length && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Supporting documents</div>
                    <div className="flex flex-wrap gap-2">
                      {selected.attachments.map((file, i) => file.url ? (
                        <a key={i} href={file.url} target="_blank" rel="noopener noreferrer"
                          className="max-w-full truncate rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                          📎 {file.name}
                        </a>
                      ) : <span key={i} className="text-xs text-slate-500">{file.name} (link unavailable)</span>)}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Your reply
                  </div>

                  <textarea
                    className="min-h-[170px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    placeholder={
                      selectedCategory === "attendance"
                        ? "Write a clear response (e.g., checked attendance sheet for that date/period and updated)."
                        : selectedCategory === "general"
                        ? "Write a clear response (e.g., where to check / what will be updated)."
                        : "Write a clear response about the marks / decision."
                    }
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                  />

                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Keep the reply specific and mention the decision clearly.
                  </div>
                </div>

                <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <button
                    onClick={handleSaveReplyOnly}
                    disabled={saving}
                    data-pending-label="Saving…"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <SpinnerIcon />
                        Saving...
                      </>
                    ) : (
                      <>
                        <SaveIcon />
                        Save Reply
                      </>
                    )}
                  </button>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => handleUpdateStatus("in_review")}
                      disabled={saving || selected.status === "in_review"}
                      data-pending-label="Updating…"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                    >
                      <EyeIcon />
                      Mark In Review
                    </button>

                    {selectedCategory === "attendance" && (
                      <label className="col-span-full flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <input type="checkbox" checked={includeAllPending} onChange={(e) => setIncludeAllPending(e.target.checked)} className="h-4 w-4 rounded" />
                        Also approve this student's other pending attendance applications in this course ({complaints.filter((item) => item.category === "attendance" && isSameStudentCourse(item, selected) && ["open", "in_review"].includes(item.status)).length} pending)
                      </label>
                    )}
                    {selectedCategory === "attendance" ? (
                      <button
                        onClick={handleResolveAttendance}
                        disabled={saving || selected.status === "resolved"}
                        data-pending-label="Updating Attendance…"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                      >
                        <CheckIcon />
                        Approve Attendance Sessions
                      </button>
                    ) : (
                      <button
                        onClick={confirmResolve}
                        disabled={saving || selected.status === "resolved"}
                        data-pending-label="Resolving…"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                      >
                        <CheckIcon />
                        Mark Resolved
                      </button>
                    )}
                  </div>

                  {selectedCategory === "marks" && (
                    <button
                      onClick={() => navigate(`/teacher/courses/${selected.course?._id}`)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                    >
                      <ChevronIcon />
                      Open Marks Entry
                    </button>
                  )}

                  <button
                    onClick={confirmReject}
                    disabled={saving || selected.status === "rejected"}
                    data-pending-label="Rejecting…"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    ✕ Reject Issue
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ label }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      {label}
    </span>
  );
}

function StatChip({ label, value, tone }) {
  const cls =
    tone === "open"
      ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20"
      : tone === "in_review"
      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20"
      : tone === "resolved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
      : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${cls}`}
    >
      <span className="opacity-80">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 21l-4.3-4.3" />
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      className="h-4 w-4 text-slate-700 dark:text-slate-200"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function ControlsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M14 5v4" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <path d="M8 15v4" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
    </svg>
  );
}