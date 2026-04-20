import api from "./api";

// teacher
export const fetchTeacherProjectSyncState = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/project-sync`);
  return res.data;
};

export const saveTeacherProjectSyncConfig = async (courseId, payload) => {
  const res = await api.put(`/courses/${courseId}/project-sync`, payload);
  return res.data;
};

export const runProjectFinalSync = async (courseId) => {
  const res = await api.post(`/courses/${courseId}/project-sync/run`);
  return res.data;
};

// student
export const fetchStudentProjectTotalSummary = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/project-total-summary`);
  return res.data;
};