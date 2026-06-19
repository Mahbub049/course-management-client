import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  fetchStudentCourseSubmissionAssessments,
  getPublicFileUrl,
  submitStudentLabAssessmentFile,
} from "../../services/labSubmissionService";

const DEFAULT_ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "zip",
  "c",
  "cpp",
  "java",
  "py",
  "js",
  "jsx",
  "html",
  "css",
];

const EXTENSION_PATTERN = /^[a-z0-9][a-z0-9_+-]{0,15}$/;

function sanitizeExtension(value = "") {
  const ext = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "");

  return EXTENSION_PATTERN.test(ext) ? ext : "";
}

function normalizeAllowedExtensions(value) {
  const selected = Array.isArray(value)
    ? value.map((item) => sanitizeExtension(item)).filter(Boolean)
    : [];

  return selected.length ? Array.from(new Set(selected)) : DEFAULT_ALLOWED_EXTENSIONS;
}

function getAcceptString(value) {
  return normalizeAllowedExtensions(value)
    .map((item) => `.${item}`)
    .join(",");
}

function formatAllowedExtensions(value) {
  return normalizeAllowedExtensions(value)
    .map((item) => item.toUpperCase())
    .join(", ");
}

function getFileExtension(fileName = "") {
  const parts = String(fileName || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function formatDateTime(value) {
  if (!value) return "No deadline set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No deadline set";
  return d.toLocaleString();
}

function getDueMs(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function formatRemainingTime(dueDate, now) {
  const dueMs = getDueMs(dueDate);

  if (!dueMs) {
    return {
      expired: false,
      label: "No deadline set",
      shortLabel: "No deadline",
    };
  }

  const diff = dueMs - now;

  if (diff <= 0) {
    return {
      expired: true,
      label: "Deadline passed",
      shortLabel: "Expired",
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const labelParts = [];
  if (days > 0) labelParts.push(`${days}d`);
  labelParts.push(`${String(hours).padStart(2, "0")}h`);
  labelParts.push(`${String(minutes).padStart(2, "0")}m`);
  labelParts.push(`${String(seconds).padStart(2, "0")}s`);

  return {
    expired: false,
    label: labelParts.join(" "),
    shortLabel: labelParts.join(" "),
  };
}

function getClosedLabel(item, deadlinePassedLive = false) {
  if (
    deadlinePassedLive ||
    item?.closedReason === "due_date_passed" ||
    item?.dueDatePassed
  ) {
    return "Deadline Passed";
  }

  if (item?.submissionsOpen === false) {
    return "Submission Closed";
  }

  return "Submission Open";
}

function isCurrentSubmissionItem(item, now) {
  const remaining = formatRemainingTime(item?.dueDate, now);
  return item?.submissionsOpen === true && !remaining.expired;
}

export default function StudentLabSubmissions({ courseId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [showOldSubmissions, setShowOldSubmissions] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchStudentCourseSubmissionAssessments(courseId);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not load submission tasks.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courseId) {
      load();
    }
  }, [courseId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const handleFileChange = async (assessmentId, file, allowedExtensions = []) => {
    if (!file) return;

    const selectedAllowedExtensions = normalizeAllowedExtensions(allowedExtensions);
    const fileExt = getFileExtension(file.name);

    if (!selectedAllowedExtensions.includes(fileExt)) {
      Swal.fire(
        "Invalid file type",
        `Only ${formatAllowedExtensions(selectedAllowedExtensions)} files are allowed for this submission.`,
        "warning"
      );
      return;
    }

    setUploadingId(assessmentId);
    try {
      const res = await submitStudentLabAssessmentFile(assessmentId, file);
      await Swal.fire(
        "Submitted",
        res?.message || "File submitted successfully.",
        "success"
      );
      await load();
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Upload failed",
        err?.response?.data?.message || "Could not submit file.",
        "error"
      );
    } finally {
      setUploadingId("");
    }
  };

  const currentSubmissionItems = items.filter((item) =>
    isCurrentSubmissionItem(item, now)
  );

  const oldSubmissionItems = items.filter(
    (item) => !isCurrentSubmissionItem(item, now)
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Loading submission tasks...
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
        No file submission assessments are available for this course yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {currentSubmissionItems.length > 0 ? (
        <div className="grid gap-4">
          {currentSubmissionItems.map((item) => (
            <SubmissionTaskCard
              key={item.id}
              item={item}
              now={now}
              uploadingId={uploadingId}
              onFileChange={handleFileChange}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
          No current running submissions are available right now.
        </div>
      )}

      {oldSubmissionItems.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Old Submissions
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Closed, expired, or previous submission tasks are hidden by default.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowOldSubmissions((value) => !value)}
            className="inline-flex w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20 sm:w-auto"
          >
            {showOldSubmissions
              ? "Hide Old Submissions"
              : `View Old Submissions (${oldSubmissionItems.length})`}
          </button>
        </div>
      )}

      {showOldSubmissions && oldSubmissionItems.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Previous Submission Tasks
          </div>

          <div className="grid gap-4">
            {oldSubmissionItems.map((item) => (
              <SubmissionTaskCard
                key={item.id}
                item={item}
                now={now}
                uploadingId={uploadingId}
                onFileChange={handleFileChange}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionTaskCard({ item, now, uploadingId, onFileChange }) {
  const submitted = !!item.submission;
  const remaining = formatRemainingTime(item.dueDate, now);
  const deadlinePassedLive = remaining.expired;
  const open = item.submissionsOpen === true && !deadlinePassedLive;
  const canUpload = open && (!submitted || item.allowResubmission !== false);

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-slate-900 dark:text-white sm:text-lg">
            {item.name}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold sm:text-xs">
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
              Max {item.maxFileSizeMB || 10} MB
            </span>

            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Allowed: {formatAllowedExtensions(item.allowedExtensions)}
            </span>

            <span
              className={`rounded-full border px-3 py-1 ${
                submitted
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
              }`}
            >
              {submitted ? "Submitted" : "Not Submitted"}
            </span>

            <span
              className={`rounded-full border px-3 py-1 ${
                open
                  ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                  : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
              }`}
            >
              {getClosedLabel(item, deadlinePassedLive)}
            </span>
          </div>

          <div
            className={`mt-4 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
              deadlinePassedLive
                ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"
                : "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                  deadlinePassedLive
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
                    : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200"
                }`}
              >
                <ClockIcon />
              </span>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70 sm:text-xs sm:tracking-[0.18em]">
                  Time Remaining
                </div>
                <div className="text-lg font-black tracking-wide sm:text-2xl">
                  {remaining.label}
                </div>
              </div>
            </div>

            <div className="text-left text-xs font-semibold opacity-80 sm:text-right">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70 sm:text-xs sm:tracking-[0.18em]">
                Deadline
              </div>
              <div className="text-sm font-black tracking-wide sm:text-2xl">
                {formatDateTime(item.dueDate)}
              </div>
            </div>
          </div>

          {item.instructions ? (
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              {item.instructions}
            </p>
          ) : null}

          {item.resourceUrl ? (
            <a
              href={getPublicFileUrl(item.resourceUrl)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
            >
              <LinkIcon />
              {item.resourceTitle || "View Resource"}
            </a>
          ) : null}

          {submitted ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              <div className="font-semibold">
                Current file: {item.submission.originalFileName}
              </div>

              <div className="mt-1 text-xs">
                Submitted at: {formatDateTime(item.submission.submittedAt)}
              </div>

              <div className="mt-2 flex flex-wrap gap-3">
                <a
                  href={getPublicFileUrl(item.submission.downloadUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  View
                </a>

                <a
                  href={getPublicFileUrl(item.submission.downloadUrl)}
                  download
                  className="underline"
                >
                  Download
                </a>
              </div>

              {item.submission.teacherNote ? (
                <div className="mt-2">
                  Teacher note: {item.submission.teacherNote}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="w-full lg:w-auto lg:min-w-[150px]">
          {canUpload ? (
            <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">
              {uploadingId === item.id
                ? "Uploading..."
                : submitted
                  ? "Replace File"
                  : "Upload File"}

              <input
                type="file"
                className="hidden"
                accept={getAcceptString(item.allowedExtensions)}
                disabled={uploadingId === item.id}
                onChange={(e) => {
                  onFileChange(
                    item.id,
                    e.target.files?.[0],
                    item.allowedExtensions
                  );
                  e.target.value = "";
                }}
              />
            </label>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {!open
                ? deadlinePassedLive ||
                  item?.closedReason === "due_date_passed" ||
                  item?.dueDatePassed
                  ? "Submission deadline has passed"
                  : "Submission is closed"
                : "Resubmission is disabled"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
