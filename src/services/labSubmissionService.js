import api from "./api";

export const getPublicFileUrl = (fileUrl = "") => {
  if (!fileUrl) return "#";
  return fileUrl;
};

// =========================
// Teacher
// =========================

export const createTeacherSubmissionAssessment = async (courseId, payload) => {
  const res = await api.post(
    `/lab-submissions/teacher/courses/${courseId}/assessments`,
    payload
  );
  return res.data;
};

export const fetchTeacherSubmissionAssessments = async (courseId) => {
  const res = await api.get(
    `/lab-submissions/teacher/courses/${courseId}/assessments`
  );
  return res.data;
};

export const fetchTeacherMarksSyncConfiguration = async (courseId) => {
  const res = await api.get(
    `/lab-submissions/teacher/courses/${courseId}/marks-sync`
  );
  return res.data;
};

export const updateTeacherMarksSyncConfiguration = async (
  courseId,
  assessmentId,
  payload
) => {
  const res = await api.patch(
    `/lab-submissions/teacher/courses/${courseId}/assessments/${assessmentId}/marks-sync`,
    payload
  );
  return res.data;
};

export const updateTeacherSubmissionAssessment = async (
  courseId,
  assessmentId,
  body
) => {
  const res = await api.patch(
    `/lab-submissions/teacher/courses/${courseId}/assessments/${assessmentId}`,
    body
  );
  return res.data;
};

export const deleteTeacherSubmissionAssessment = async (
  courseId,
  assessmentId
) => {
  const res = await api.delete(
    `/lab-submissions/teacher/courses/${courseId}/assessments/${assessmentId}`
  );
  return res.data;
};

export const fetchTeacherAssessmentSubmissions = async (
  courseId,
  assessmentId
) => {
  const res = await api.get(
    `/lab-submissions/teacher/courses/${courseId}/assessments/${assessmentId}/submissions`
  );
  return res.data;
};

export const updateLabSubmissionStatus = async (submissionId, payload) => {
  const res = await api.patch(
    `/lab-submissions/teacher/submissions/${submissionId}`,
    payload
  );
  return res.data;
};

export const deleteTeacherLabSubmission = async (submissionId) => {
  const res = await api.delete(
    `/lab-submissions/teacher/submissions/${submissionId}`
  );
  return res.data;
};

export const syncSubmissionMarks = async (submissionId) => {
  const res = await api.post(
    `/lab-submissions/teacher/submissions/${submissionId}/sync-marks`
  );
  return res.data;
};

export const downloadAllTeacherSubmissions = async (courseId, assessmentId) => {
  const res = await api.get(
    `/lab-submissions/teacher/courses/${courseId}/assessments/${assessmentId}/download-all`,
    {
      responseType: "blob",
    }
  );

  const blob = new Blob([res.data], {
    type: "application/zip",
  });

  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `submissions_${assessmentId}.zip`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
};

// =========================
// Student
// =========================

export const fetchStudentSubmissionAssessments = async () => {
  const res = await api.get(`/lab-submissions/student/assessments`);
  return res.data;
};

export const fetchStudentCourseSubmissionAssessments = async (courseId) => {
  const res = await api.get(
    `/lab-submissions/student/courses/${courseId}/assessments`
  );
  return res.data;
};

export const submitStudentLabAssessmentFile = async (assessmentId, file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await api.post(
    `/lab-submissions/student/assessments/${assessmentId}/submit`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return res.data;
};

export const saveAllSubmissionMarks = async (courseId, assessmentId, rows) => {
  const res = await api.post(
    `/lab-submissions/teacher/courses/${courseId}/assessments/${assessmentId}/save-all-marks`,
    { rows }
  );
  return res.data;
};

export const syncAllSubmissionMarks = async (courseId, assessmentId) => {
  const res = await api.post(
    `/lab-submissions/teacher/courses/${courseId}/assessments/${assessmentId}/sync-marks`
  );
  return res.data;
};
// =========================
// Public no-login submission link
// =========================

const PUBLIC_SUBMISSION_DEVICE_KEY = "bubtPublicSubmissionDeviceId";

export const getPublicSubmissionDeviceId = () => {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(PUBLIC_SUBMISSION_DEVICE_KEY);
    if (existing && existing.length >= 20) return existing;

    const generated =
      window.crypto?.randomUUID?.() ||
      `bubt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

    window.localStorage.setItem(PUBLIC_SUBMISSION_DEVICE_KEY, generated);
    return generated;
  } catch (_err) {
    return `bubt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
};

export const fetchTeacherPublicSubmissionLink = async (courseId) => {
  const res = await api.get(
    `/public-lab-submissions/teacher/courses/${courseId}/link`
  );
  return res.data;
};

export const updateTeacherPublicSubmissionLink = async (courseId, payload) => {
  const res = await api.patch(
    `/public-lab-submissions/teacher/courses/${courseId}/link`,
    payload
  );
  return res.data;
};


export const fetchTeacherPublicSubmissionClaims = async (courseId) => {
  const res = await api.get(
    `/public-lab-submissions/teacher/courses/${courseId}/claims`
  );
  return res.data;
};

export const releaseTeacherPublicSubmissionClaim = async (courseId, claimId) => {
  const res = await api.post(
    `/public-lab-submissions/teacher/courses/${courseId}/claims/${claimId}/release`
  );
  return res.data;
};

export const fetchPublicSubmissionPortal = async () => {
  const res = await api.get(`/public-lab-submissions/portal`);
  return res.data;
};

export const fetchCurrentPublicSubmissionPage = async () => {
  const res = await api.get(`/public-lab-submissions/current`);
  return res.data;
};

export const fetchPublicSubmissionPage = async (token) => {
  const res = await api.get(`/public-lab-submissions/${token}`);
  return res.data;
};

export const fetchPublicSubmissionDeviceSession = async (token, deviceId) => {
  const resolvedDeviceId = deviceId || getPublicSubmissionDeviceId();
  const res = await api.get(`/public-lab-submissions/${token}/device-session`, {
    // Query parameters survive refresh/proxy/CORS setups more reliably than a
    // custom request header, and the server accepts deviceId from req.query.
    params: { deviceId: resolvedDeviceId },
  });
  return res.data;
};

export const verifyPublicSubmissionRoll = async (token, roll, deviceId) => {
  const res = await api.post(`/public-lab-submissions/${token}/verify-roll`, {
    roll,
    deviceId: deviceId || getPublicSubmissionDeviceId(),
  });
  return res.data;
};

export const fetchPublicSubmittedFiles = async (token, roll, deviceId) => {
  const res = await api.get(`/public-lab-submissions/${token}/submitted-files`, {
    params: {
      roll,
      deviceId: deviceId || getPublicSubmissionDeviceId(),
    },
  });
  return res.data;
};

export const submitPublicLabAssessmentFile = async ({
  token,
  assessmentId,
  roll,
  file,
  deviceId,
}) => {
  const formData = new FormData();
  formData.append("roll", roll);
  formData.append("deviceId", deviceId || getPublicSubmissionDeviceId());
  formData.append("file", file);

  const res = await api.post(
    `/public-lab-submissions/${token}/assessments/${assessmentId}/submit`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return res.data;
};
