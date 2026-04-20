import api from "./api";

// Teacher
export const fetchTeacherProjectFormConfig = async (courseId) => {
  const res = await api.get(`/project-form/${courseId}`);
  return res.data;
};

export const updateTeacherProjectFormConfig = async (courseId, payload) => {
  const res = await api.put(`/project-form/${courseId}`, payload);
  return res.data;
};

// Student
// IMPORTANT:
// This assumes you add a student/public GET endpoint later.
// For now, if this route does not exist yet, the component will safely fall back.
export const fetchStudentProjectFormConfig = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/project-form`);
  return res.data;
};