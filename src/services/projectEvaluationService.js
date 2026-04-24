import api from "./api";

// teacher
export const fetchTeacherProjectEvaluations = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/project-evaluations`);
  return res.data;
};

export const saveProjectEvaluation = async (courseId, phaseId, payload) => {
  const res = await api.post(
    `/courses/${courseId}/project-evaluations/${phaseId}`,
    payload
  );
  return res.data;
};

// student
export const fetchStudentProjectEvaluations = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/project-evaluations`);
  return res.data;
};