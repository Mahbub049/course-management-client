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