import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import SmartFileActions from "../components/SmartFileActions";
import {
  fetchCurrentPublicSubmissionPage,
  fetchPublicSubmissionDeviceSession,
  fetchPublicSubmissionPage,
  getPublicSubmissionDeviceId,
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

const PUBLIC_SUBMISSION_LOCK_CACHE_PREFIX = "bubtPublicSubmissionLock:";
const PUBLIC_SUBMISSION_ACTIVE_LOCK_KEY = "bubtPublicSubmissionActiveLock";

function getPublicSubmissionLockCacheKey(token = "") {
  const cleanToken = String(token || "").trim();
  return cleanToken ? `${PUBLIC_SUBMISSION_LOCK_CACHE_PREFIX}${cleanToken}` : "";
}

function parseStoredLock(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.student?.roll) return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}

function readPublicSubmissionLockCache(token = "") {
  if (typeof window === "undefined") return null;

  try {
    const key = getPublicSubmissionLockCacheKey(token);
    const tokenCache = key ? parseStoredLock(window.localStorage.getItem(key)) : null;
    if (tokenCache) return tokenCache;

    // /submit does not know its token until the current portal is loaded.
    // Keep one active-lock pointer so refreshes can still recover the student
    // even if the public link token is recreated/changed by the teacher.
    return parseStoredLock(window.localStorage.getItem(PUBLIC_SUBMISSION_ACTIVE_LOCK_KEY));
  } catch (_err) {
    return null;
  }
}

function writePublicSubmissionLockCache(token, payload) {
  if (typeof window === "undefined") return;
  const key = getPublicSubmissionLockCacheKey(token);

  try {
    if (!payload?.student?.roll) {
      if (key) window.localStorage.removeItem(key);
      return;
    }

    const record = {
      token: String(token || ""),
      courseId: String(payload.courseId || ""),
      linkId: String(payload.linkId || ""),
      student: payload.student,
      deviceLock: payload.deviceLock || { locked: true },
      assessmentIds: Array.isArray(payload.assessmentIds)
        ? payload.assessmentIds.map((id) => String(id))
        : [],
      savedAt: Date.now(),
    };

    const serialized = JSON.stringify(record);
    if (key) window.localStorage.setItem(key, serialized);
    window.localStorage.setItem(PUBLIC_SUBMISSION_ACTIVE_LOCK_KEY, serialized);
  } catch (_err) {
    // The backend claim still prevents another roll from using the same device.
  }
}

function clearPublicSubmissionLockCache(token = "") {
  if (typeof window === "undefined") return;
  const key = getPublicSubmissionLockCacheKey(token);

  try {
    if (key) window.localStorage.removeItem(key);

    const active = parseStoredLock(window.localStorage.getItem(PUBLIC_SUBMISSION_ACTIVE_LOCK_KEY));
    if (!active || !token || !active.token || String(active.token) === String(token)) {
      window.localStorage.removeItem(PUBLIC_SUBMISSION_ACTIVE_LOCK_KEY);
    }
  } catch (_err) {
    // Ignore storage failures.
  }
}

function clearAllPublicSubmissionLockCaches() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PUBLIC_SUBMISSION_ACTIVE_LOCK_KEY);
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PUBLIC_SUBMISSION_LOCK_CACHE_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (_err) {
    // Ignore storage failures.
  }
}

function isCachedLockUsable(cache, assessments = [], nowValue = Date.now(), courseId = "") {
  if (!cache?.student?.roll) return false;

  if (cache.courseId && courseId && String(cache.courseId) !== String(courseId)) {
    return false;
  }

  const lockedUntil = cache.deviceLock?.lockedUntil;
  if (lockedUntil) {
    const expiry = new Date(lockedUntil);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= nowValue) {
      return false;
    }
    // A server-issued future expiry is enough to preserve the lock. This is
    // important when the teacher changes which assessment is shown on /submit.
    return true;
  }

  const cachedIds = new Set(
    (cache.assessmentIds || cache.deviceLock?.assessmentIds || []).map((id) => String(id))
  );
  const liveAssessmentIds = new Set(
    (assessments || [])
      .filter((assessment) => assessment?.submissionsOpen)
      .map((assessment) => String(assessment?.id || assessment?._id || ""))
      .filter(Boolean)
  );

  if (!cachedIds.size) return liveAssessmentIds.size > 0;
  return [...cachedIds].some((id) => liveAssessmentIds.has(id));
}

function buildFallbackDeviceLock(assessments = []) {
  const openAssessments = (assessments || []).filter((assessment) => assessment?.submissionsOpen);
  if (!openAssessments.length) return null;

  const sorted = [...openAssessments].sort((a, b) => {
    const aTime = new Date(a?.dueDate || "").getTime();
    const bTime = new Date(b?.dueDate || "").getTime();
    const safeA = Number.isNaN(aTime) ? Number.MAX_SAFE_INTEGER : aTime;
    const safeB = Number.isNaN(bTime) ? Number.MAX_SAFE_INTEGER : bTime;
    return safeA - safeB;
  });

  const sessionAssessment = sorted[0];
  const dueDate = sessionAssessment?.dueDate ? new Date(sessionAssessment.dueDate) : null;
  const lockedUntil =
    dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null;

  return {
    locked: true,
    lockedUntil,
    assessmentIds: [String(sessionAssessment?.id || sessionAssessment?._id || "")].filter(Boolean),
    clientFallback: true,
  };
}

function isConfirmedReleaseForCache(session, cache) {
  if (!session?.released) return false;

  const releasedAt = new Date(session?.releasedAt || "");
  if (Number.isNaN(releasedAt.getTime())) {
    // Older API versions only returned released=true. That boolean can refer to
    // an old historical release, so it must not erase a newly-created browser lock.
    return false;
  }

  const savedAt = Number(cache?.savedAt || 0);
  return !savedAt || releasedAt.getTime() >= savedAt;
}

export default function PublicSubmissionPage({ useDefaultPortal = false }) {
  const { token: routeToken } = useParams();
  const [resolvedToken, setResolvedToken] = useState(routeToken || "");
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState(null);
  const [roll, setRoll] = useState("");
  const [student, setStudent] = useState(null);
  const [deviceLock, setDeviceLock] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [verifying, setVerifying] = useState(false);
  const [uploadingId, setUploadingId] = useState("");
  const [now, setNow] = useState(Date.now());
  const fileInputRefs = useRef({});
  const deviceId = useMemo(() => getPublicSubmissionDeviceId(), []);

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
      const data = useDefaultPortal
        ? await fetchCurrentPublicSubmissionPage()
        : await fetchPublicSubmissionPage(routeToken);

      const nextToken = data?.link?.token || routeToken || "";
      const currentCourseId = data?.course?.id || data?.course?._id || "";
      const currentLinkId = data?.link?.id || data?.link?._id || "";
      const pageAssessments = Array.isArray(data?.assessments) ? data.assessments : [];

      setPageData(data);
      setResolvedToken(nextToken);
      setAssessments(pageAssessments);

      // Restore the browser-owned student before asking the server. The server
      // remains authoritative for every upload, but a normal refresh must never
      // reopen the roll field while the saved session deadline is still active.
      const cachedLock = readPublicSubmissionLockCache(nextToken);
      const usableCachedLock = isCachedLockUsable(
        cachedLock,
        pageAssessments,
        Date.now(),
        currentCourseId
      );

      if (usableCachedLock) {
        setStudent(cachedLock.student);
        setRoll(cachedLock.student.roll || "");
        setDeviceLock(cachedLock.deviceLock || { locked: true });
      } else {
        setStudent(null);
        setRoll("");
        setDeviceLock(null);
      }

      if (nextToken && deviceId) {
        try {
          const session = await fetchPublicSubmissionDeviceSession(nextToken, deviceId);

          if (session?.locked && session?.student) {
            const sessionAssessments = Array.isArray(session?.assessments)
              ? session.assessments
              : pageAssessments;
            const nextDeviceLock = session.deviceLock || { locked: true };

            setStudent(session.student);
            setRoll(session.student.roll || "");
            setDeviceLock(nextDeviceLock);
            setAssessments(sessionAssessments);
            writePublicSubmissionLockCache(nextToken, {
              courseId: currentCourseId,
              linkId: currentLinkId,
              student: session.student,
              deviceLock: nextDeviceLock,
              assessmentIds:
                nextDeviceLock?.assessmentIds ||
                sessionAssessments
                  .filter((assessment) => assessment?.submissionsOpen)
                  .map((assessment) => assessment?.id || assessment?._id),
            });
          } else if (isConfirmedReleaseForCache(session, cachedLock)) {
            // Only a release that happened after this exact browser lock was saved
            // may clear it. Historical release records must not unlock a refreshed PC.
            clearAllPublicSubmissionLockCaches();
            setStudent(null);
            setRoll("");
            setDeviceLock(null);
          } else if (!usableCachedLock) {
            setStudent(null);
            setRoll("");
            setDeviceLock(null);
          }
          // If the server returns a plain "not found" but the local lock is still
          // within its server-issued deadline, keep it visible. Upload requests
          // will still be checked against the backend claim.
        } catch (sessionErr) {
          console.error("Could not restore public submission device lock", sessionErr);
          if (!usableCachedLock) {
            setStudent(null);
            setRoll("");
            setDeviceLock(null);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setResolvedToken("");
      setStudent(null);
      setRoll("");
      setDeviceLock(null);
      setPageData({
        error:
          err?.response?.data?.message ||
          "This public submission page is not available right now.",
      });
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, [routeToken, useDefaultPortal]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!student?.roll || !resolvedToken) return;

    const lockedUntil = deviceLock?.lockedUntil;
    if (!lockedUntil) return;

    const expiry = new Date(lockedUntil);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() > now) return;

    clearAllPublicSubmissionLockCaches();
    setStudent(null);
    setRoll("");
    setDeviceLock(null);
  }, [now, student?.roll, deviceLock?.lockedUntil, resolvedToken]);

  const handleVerifyRoll = async (e) => {
    e.preventDefault();

    const cleanRoll = String(roll || "").trim();
    if (!cleanRoll) {
      Swal.fire("Roll required", "Please enter your full roll number or last 3/4 digits.", "warning");
      return;
    }

    if (!resolvedToken) {
      Swal.fire("Unavailable", "No submission course is currently selected for /submit.", "warning");
      return;
    }

    setVerifying(true);
    try {
      const data = await verifyPublicSubmissionRoll(resolvedToken, cleanRoll, deviceId);
      const verifiedStudent = data?.student || null;
      const verifiedAssessments = Array.isArray(data?.assessments) ? data.assessments : [];
      const verifiedDeviceLock =
        data?.deviceLock?.locked ? data.deviceLock : buildFallbackDeviceLock(verifiedAssessments);

      setStudent(verifiedStudent);
      setRoll(verifiedStudent?.roll || cleanRoll);
      setDeviceLock(verifiedDeviceLock);
      setAssessments(verifiedAssessments);

      if (verifiedStudent?.roll && verifiedDeviceLock?.locked) {
        writePublicSubmissionLockCache(resolvedToken, {
          courseId: pageData?.course?.id || pageData?.course?._id || "",
          linkId: pageData?.link?.id || pageData?.link?._id || "",
          student: verifiedStudent,
          deviceLock: verifiedDeviceLock,
          assessmentIds:
            verifiedDeviceLock?.assessmentIds ||
            verifiedAssessments
              .filter((assessment) => assessment?.submissionsOpen)
              .map((assessment) => assessment?.id || assessment?._id),
        });
      }
    } catch (err) {
      console.error(err);
      const code = err?.response?.data?.code;

      if (code === "DEVICE_LOCKED") {
        try {
          const session = await fetchPublicSubmissionDeviceSession(resolvedToken, deviceId);
          if (session?.locked && session?.student) {
            const restoredAssessments = Array.isArray(session?.assessments) ? session.assessments : [];
            const restoredDeviceLock =
              session?.deviceLock?.locked
                ? session.deviceLock
                : buildFallbackDeviceLock(restoredAssessments) || { locked: true };
            setStudent(session.student);
            setRoll(session.student.roll || "");
            setDeviceLock(restoredDeviceLock);
            setAssessments(restoredAssessments);
            writePublicSubmissionLockCache(resolvedToken, {
              courseId: pageData?.course?.id || pageData?.course?._id || "",
              linkId: pageData?.link?.id || pageData?.link?._id || "",
              student: session.student,
              deviceLock: restoredDeviceLock,
              assessmentIds:
                restoredDeviceLock?.assessmentIds ||
                restoredAssessments
                  .filter((assessment) => assessment?.submissionsOpen)
                  .map((assessment) => assessment?.id || assessment?._id),
            });
          }
        } catch (_restoreErr) {
          setStudent(null);
          setDeviceLock(null);
        }
      } else {
        setStudent(null);
        setDeviceLock(null);
        clearPublicSubmissionLockCache(resolvedToken);
      }

      Swal.fire(
        code === "DEVICE_LOCKED" ? "Device already locked" : code === "ROLL_LOCKED" ? "Roll already in use" : "Could not verify",
        err?.response?.data?.message || "Could not verify this roll number.",
        "error"
      );
    } finally {
      setVerifying(false);
    }
  };

  const refreshVerifiedRoll = async () => {
    if (!student?.roll || !resolvedToken) return;
    const data = await fetchPublicSubmissionDeviceSession(resolvedToken, deviceId);
    if (data?.locked && data?.student) {
      const refreshedDeviceLock = data?.deviceLock || deviceLock || { locked: true };
      const refreshedAssessments = Array.isArray(data?.assessments) ? data.assessments : [];
      setStudent(data.student);
      setRoll(data.student.roll || student.roll || "");
      setDeviceLock(refreshedDeviceLock);
      setAssessments(refreshedAssessments);
      writePublicSubmissionLockCache(resolvedToken, {
        courseId: pageData?.course?.id || pageData?.course?._id || "",
        linkId: pageData?.link?.id || pageData?.link?._id || "",
        student: data.student,
        deviceLock: refreshedDeviceLock,
        assessmentIds:
          refreshedDeviceLock?.assessmentIds ||
          refreshedAssessments
            .filter((assessment) => assessment?.submissionsOpen)
            .map((assessment) => assessment?.id || assessment?._id),
      });
      return;
    }

    const cachedLock = readPublicSubmissionLockCache(resolvedToken);
    if (isConfirmedReleaseForCache(data, cachedLock)) {
      clearAllPublicSubmissionLockCaches();
      setStudent(null);
      setRoll("");
      setDeviceLock(null);
      return;
    }

    // The uploaded assessment may have just closed exactly at the deadline.
    // Keep the verified student on screen for the current response; the timer
    // effect below clears the identity exactly when its saved lock expires.
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
        token: resolvedToken,
        assessmentId: assessment.id,
        roll: student.roll,
        file,
        deviceId,
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
          <Link
            to={useDefaultPortal ? "/login" : "/submit"}
            className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            {useDefaultPortal ? "Portal Login" : "Open Main Submission Page"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        {!useDefaultPortal ? (
          <Link
            to="/submit"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
          >
            <span aria-hidden="true">←</span>
            Main Submission Page
          </Link>
        ) : null}

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
              {!student ? (
                <>
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
                      {verifying ? "Checking..." : "Continue & Lock Roll"}
                    </button>
                  </form>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    Enter your roll number once. This browser will stay assigned to that roll until the current submission session ends.
                  </div>
                </>
              ) : (
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Verified Student
                    </div>
                    {deviceLock?.locked ? (
                      <span className="rounded-full border border-emerald-300 bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-900/60 dark:text-emerald-300">
                        Device Locked
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                    {student.name || "Student"}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Roll: {student.roll}
                  </div>
                  <div className="mt-3 rounded-2xl border border-emerald-200/70 bg-white/60 p-3 text-xs leading-5 text-emerald-800 dark:border-emerald-500/20 dark:bg-slate-900/40 dark:text-emerald-200">
                    Your device is locked to this roll for the current submission session. Contact the course teacher if any correction is required.
                    {deviceLock?.lockedUntil ? (
                      <span className="mt-1 block font-semibold">
                        Lock ends: {formatDateTime(deviceLock.lockedUntil)}
                      </span>
                    ) : null}
                  </div>
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
