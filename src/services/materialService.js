import api from "./api";

// Teacher
export const fetchTeacherCourseMaterials = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/materials`);
  return res.data;
};

export const createCourseMaterialRequest = async (courseId, payload) => {
  const res = await api.post(`/courses/${courseId}/materials`, payload);
  return res.data;
};

export const updateCourseMaterialRequest = async (materialId, payload) => {
  const res = await api.put(`/courses/materials/${materialId}`, payload);
  return res.data;
};

export const deleteCourseMaterialRequest = async (materialId) => {
  const res = await api.delete(`/courses/materials/${materialId}`);
  return res.data;
};

// Student
export const fetchStudentCourseMaterials = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/materials`);
  return res.data;
};