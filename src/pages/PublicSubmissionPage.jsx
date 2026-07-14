import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Swal from "sweetalert2";
import SmartFileActions from "../components/SmartFileActions";
import {
  fetchPublicSubmissionPage,
  submitPublicLabAssessmentFile,
  verifyPublicSubmissionRoll,
} from "../services/labSubmissionService";

function formatDateTime(value) {
  if (!value) return "No deadline set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No deadline set";
  return date.toLocaleString();
}

function getDeadlineTimeLeft(dueDate, nowValue = Date.now()) {
  if (!dueDate) {
    return { hasDeadline: false, isPassed: false, label: "No deadline set" };
  }

  const deadline = new Date(dueDate);
  if (Number.isNaN(deadline.getTime())) {
    return { hasDeadline: false, isPassed: false, label: "No deadline set" };
  }

  const diff = deadline.getTime() - nowValue;

  if (diff <= 0) {
    return { hasDeadline: true, isPassed: true, label: "Deadline passed" };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const twoDigit = (value) => String(value).padStart(2, "0");

  if (days > 0) {
    return {
      hasDeadline: true,
      isPassed: false,
      label: `${days}d ${twoDigit(hours)}h ${twoDigit(minutes)}m left`,
    };
  }

  return {
    hasDeadline: true,
    isPassed: false,
    label: `${twoDigit(hours)}:${twoDigit(minutes)}:${twoDigit(seconds)} left`,
  };
}

function formatAllowedExtensions(value = []) {
  return Array.isArray(value) && value.length
    ? value.map((item) => String(item).toUpperCase()).join(", ")
    : "Teacher selected file types";
}

function getFileAcceptValue(value = []) {
  if (!Array.isArray(value) || !value.length) return undefined;

  const extensions = value
    .map((item) => String(item || "").trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean)
    .map((item) => `.${item}`);

  return extensions.length ? extensions.join(",") : undefined;
}

function getStatusMeta(item) {
  if (item?.dueDatePassed || item?.closedReason === "due_date_passed") {
    return {
      label: "Deadline Passed",
      className:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    };
  }

  if (item?.submissionsOpen) {
    return {
      label: "Open",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    };
  }

  return {
    label: "Closed",
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
}

function PublicBadge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${className}`}
    >
      {children}
    </span>
  );
}

export default function PublicSubmissionPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState(null);
  const [roll, setRoll] = useState("");
  const [student, setStudent] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [verifying, setVerifying] = useState(false);
  const [uploadingId, setUploadingId] = useState("");
  const [now, setNow] = useState(Date.now());
  const fileInputRefs = useRef({});

  const courseTitle = useMemo(() => {
    const course = pageData?.course;
    if (!course) return "Course Submission";
    return `${course.code || "Course"} - ${course.title || "Submission"}`;
  }, [pageData?.course]);

  const heroDeadline = useMemo(() => {
    const datedAssessments = assessments
      .map((assessment) => {
        const date = new Date(assessment?.dueDate || "");
        return Number.isNaN(date.getTime())
          ? null
          : {
              assessment,
              dueDate: assessment.dueDate,
              time: date.getTime(),
            };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    if (!datedAssessments.length) return null;

    return (
      datedAssessments.find((item) => item.time > now) ||
      datedAssessments[datedAssessments.length - 1]
    );
  }, [assessments, now]);

  const heroDeadlineMeta = heroDeadline
    ? getDeadlineTimeLeft(heroDeadline.dueDate, now)
    : null;

  const loadPage = async () => {
    setLoading(true);
    try {
      const data = await fetchPublicSubmissionPage(token);
      setPageData(data);
      setAssessments(Array.isArray(data?.assessments) ? data.assessments : []);
    } catch (err) {
      console.error(err);
      setPageData({
        error:
          err?.response?.data?.message ||
          "This public submission page is not available right now.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleVerifyRoll = async (e) => {
    e.preventDefault();

    const cleanRoll = String(roll || "").trim();
    if (!cleanRoll) {
      Swal.fire("Roll required", "Please enter your full roll number or last 3/4 digits.", "warning");
      return;
    }

    setVerifying(true);
    try {
      const data = await verifyPublicSubmissionRoll(token, cleanRoll);
      setStudent(data?.student || null);
      setAssessments(Array.isArray(data?.assessments) ? data.assessments : []);
    } catch (err) {
      console.error(err);
      setStudent(null);
      Swal.fire(
        "Not found",
        err?.response?.data?.message || "Could not verify this roll number.",
        "error"
      );
    } finally {
      setVerifying(false);
    }
  };

  const refreshVerifiedRoll = async () => {
    if (!student?.roll) return;
    const data = await verifyPublicSubmissionRoll(token, student.roll);
    setStudent(data?.student || null);
    setAssessments(Array.isArray(data?.assessments) ? data.assessments : []);
  };

  const handleUploadButtonClick = (assessment) => {
    if (!student?.roll) {
      Swal.fire("Verify roll first", "Please verify your roll number first.", "warning");
      return;
    }

    const deadlineMeta = getDeadlineTimeLeft(assessment?.dueDate);
    if (!assessment?.submissionsOpen || deadlineMeta.isPassed) {
      Swal.fire("Submission closed", deadlineMeta.isPassed ? "The deadline has already passed." : "This submission is closed now.", "warning");
      return;
    }

    const input = fileInputRefs.current[assessment.id];
    if (input) {
      input.value = "";
      input.click();
    }
  };

  const handleAutoSubmitFile = async (assessment, file) => {
    if (!student?.roll) {
      Swal.fire("Verify roll first", "Please verify your roll number first.", "warning");
      return;
    }

    if (!file) return;

    const deadlineMeta = getDeadlineTimeLeft(assessment?.dueDate);
    if (!assessment?.submissionsOpen || deadlineMeta.isPassed) {
      Swal.fire(
        "Submission closed",
        deadlineMeta.isPassed ? "The deadline has already passed." : "This submission is closed now.",
        "warning"
      );
      return;
    }

    const existing = assessment?.submission;
    if (existing) {
      const result = await Swal.fire({
        title: "Replace file?",
        text: "Your previous file will be replaced with the selected file.",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Replace",
      });

      if (!result.isConfirmed) return;
    }

    setUploadingId(assessment.id);
    try {
      await submitPublicLabAssessmentFile({
        token,
        assessmentId: assessment.id,
        roll: student.roll,
        file,
      });

      await refreshVerifiedRoll();
      await Swal.fire(
        "Submitted",
        existing ? "File replaced successfully." : "File uploaded successfully.",
        "success"
      );
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not upload the file.",
        "error"
      );
    } finally {
      setUploadingId("");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Loading submission page...
        </div>
      </div>
    );
  }

  if (pageData?.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
        <div className="max-w-lg rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm dark:border-rose-500/20 dark:bg-slate-900">
          <div className="text-lg font-bold text-rose-600 dark:text-rose-300">
            Public submission unavailable
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {pageData.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="bg-gradient-to-br from-indigo-600 via-slate-900 to-emerald-700 px-6 py-8 text-white sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                  Public Submission Portal
                </div>
                <h1 className="mt-4 text-2xl font-bold sm:text-3xl">
                  {pageData?.link?.title || courseTitle}
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-white/80">
                  {courseTitle}
                  {pageData?.course?.section ? ` • Section ${pageData.course.section}` : ""}
                  {pageData?.course?.intake ? ` • Intake ${pageData.course.intake}` : ""}
                </p>
                {pageData?.teacher?.name ? (
                  <p className="mt-1 text-sm text-white/70">
                    Teacher: {pageData.teacher.name}
                  </p>
                ) : null}
              </div>

              {heroDeadlineMeta ? (
                <div
                  className={`rounded-3xl border px-5 py-4 text-left shadow-lg backdrop-blur lg:min-w-[260px] lg:text-right ${
                    heroDeadlineMeta.isPassed
                      ? "border-rose-300/30 bg-rose-500/15"
                      : "border-emerald-300/30 bg-emerald-500/15"
                  }`}
                >
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                    Time Remaining
                  </div>
                  <div className="mt-2 text-3xl font-black leading-tight text-white sm:text-4xl">
                    {heroDeadlineMeta.label}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-white/75">
                    Deadline: {formatDateTime(heroDeadline.dueDate)}
                  </div>
                  {assessments.length > 1 && heroDeadline?.assessment?.name ? (
                    <div className="mt-1 text-xs text-white/60">
                      For: {heroDeadline.assessment.name}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-[360px_minmax(0,1fr)] sm:p-6">
            <div className="space-y-4">
              <form
                onSubmit={handleVerifyRoll}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800"
              >
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Student Roll Number
                </label>
                <input
                  type="text"
                  value={roll}
                  onChange={(e) => setRoll(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="Full roll or last 3/4 digits"
                />

                <button
                  type="submit"
                  disabled={verifying}
                  className="mt-3 w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  {verifying ? "Checking..." : "Continue"}
                </button>
              </form>

              {student ? (
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Verified Student
                  </div>
                  <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                    {student.name || "Student"}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Roll: {student.roll}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  Enter your roll number to view your upload status and submit files.
                </div>
              )}

              {pageData?.link?.instructions ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Instructions
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                    {pageData.link.instructions}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              {!assessments.length ? (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  No public submissions are available from this link yet.
                </div>
              ) : (
                assessments.map((assessment) => {
                  const deadlineMeta = getDeadlineTimeLeft(assessment.dueDate, now);
                  const statusMeta = getStatusMeta({
                    ...assessment,
                    dueDatePassed: assessment.dueDatePassed || deadlineMeta.isPassed,
                    closedReason: deadlineMeta.isPassed ? "due_date_passed" : assessment.closedReason,
                  });
                  const clientSubmissionsOpen = assessment.submissionsOpen && !deadlineMeta.isPassed;
                  const canUpload = !!student && clientSubmissionsOpen;
                  const submitted = assessment.submission;

                  return (
                    <div
                      key={assessment.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                            {assessment.name}
                          </h2>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <PublicBadge className={statusMeta.className}>
                              {statusMeta.label}
                            </PublicBadge>
                            <PublicBadge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                              Marks: {assessment.fullMarks || 0}
                            </PublicBadge>
                          </div>
                        </div>

                        <div className="text-sm text-slate-500 dark:text-slate-400 sm:text-right">
                          <div className="font-semibold text-slate-700 dark:text-slate-200">
                            Deadline
                          </div>
                          <div>{formatDateTime(assessment.dueDate)}</div>
                        </div>
                      </div>

                      {assessment.instructions ? (
                        <p className="mt-4 whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {assessment.instructions}
                        </p>
                      ) : null}

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            File Rules
                          </div>
                          <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                            Allowed: {formatAllowedExtensions(assessment.allowedExtensions)}
                          </div>
                          <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                            Max size: {assessment.maxFileSizeMB || 10} MB
                          </div>
                          {assessment.resourceUrl ? (
                            <a
                              href={assessment.resourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                            >
                              {assessment.resourceTitle || "View Resource"}
                            </a>
                          ) : null}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Current Status
                          </div>
                          {submitted ? (
                            <div className="mt-2 space-y-2">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                Submitted: {submitted.originalFileName}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {formatDateTime(submitted.submittedAt)}
                              </div>
                              {submitted.downloadUrl ? (
                                <SmartFileActions
                                  file={submitted}
                                  compact
                                />
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                              {student
                                ? "No file submitted yet."
                                : "Verify roll to check your submission status."}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Upload File
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Click the button, choose your file, and it will upload automatically.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUploadButtonClick(assessment)}
                            disabled={!canUpload || uploadingId === assessment.id}
                            className={`rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${submitted
                              ? "bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                              : "bg-emerald-600 hover:bg-emerald-700"
                              }`}
                          >
                            {uploadingId === assessment.id
                              ? "Uploading..."
                              : submitted
                                ? "Choose & Replace File"
                                : "Choose File to Upload"}
                          </button>
                        </div>

                        <input
                          ref={(element) => {
                            if (element) fileInputRefs.current[assessment.id] = element;
                          }}
                          type="file"
                          accept={getFileAcceptValue(assessment.allowedExtensions)}
                          disabled={!canUpload || uploadingId === assessment.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) handleAutoSubmitFile(assessment, file);
                          }}
                          className="hidden"
                        />

                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                          Allowed files: {formatAllowedExtensions(assessment.allowedExtensions)} • Max size: {assessment.maxFileSizeMB || 10} MB
                        </p>

                        {!student ? (
                          <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                            Please verify your roll number before uploading.
                          </p>
                        ) : !clientSubmissionsOpen ? (
                          <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">
                            {deadlineMeta.isPassed ? "The deadline has already passed." : "This submission is closed now."}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
