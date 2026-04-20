import api from "./api";

// Teacher side
export const fetchTeacherProjectPhases = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/project-phases`);
  return res.data;
};

export const createProjectPhase = async (courseId, payload) => {
  const res = await api.post(`/courses/${courseId}/project-phases`, payload);
  return res.data;
};

export const updateProjectPhase = async (courseId, phaseId, payload) => {
  const res = await api.put(`/courses/${courseId}/project-phases/${phaseId}`, payload);
  return res.data;
};

export const deleteProjectPhase = async (courseId, phaseId) => {
  const res = await api.delete(`/courses/${courseId}/project-phases/${phaseId}`);
  return res.data;
};

// Student side
export const fetchStudentProjectPhases = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/project-phases`);
  return res.data;
};