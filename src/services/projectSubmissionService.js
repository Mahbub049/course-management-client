import api from "./api";

// teacher
export const fetchTeacherProjectSubmissions = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/project-submissions`);
  return res.data;
};

// student
export const fetchStudentProjectSubmissions = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/project-submissions`);
  return res.data;
};

export const submitStudentProjectPhase = async (courseId, phaseId, payload) => {
  const res = await api.post(
    `/student/courses/${courseId}/project-submissions/${phaseId}`,
    payload
  );
  return res.data;
};