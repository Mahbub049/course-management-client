import api from "./api";

// Teacher side
export const fetchTeacherProjectGroups = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/project-groups`);
  return res.data;
};

export const createTeacherProjectGroup = async (courseId, payload) => {
  const res = await api.post(`/courses/${courseId}/project-groups`, payload);
  return res.data;
};

export const updateTeacherProjectGroup = async (courseId, groupId, payload) => {
  const res = await api.put(
    `/courses/${courseId}/project-groups/${groupId}`,
    payload
  );
  return res.data;
};

export const deleteTeacherProjectGroup = async (courseId, groupId) => {
  const res = await api.delete(`/courses/${courseId}/project-groups/${groupId}`);
  return res.data;
};

// Student side
export const fetchStudentProjectGroups = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/project-groups`);
  return res.data;
};

export const createStudentProjectGroup = async (courseId, payload) => {
  const res = await api.post(`/student/courses/${courseId}/project-groups`, payload);
  return res.data;
};

export const updateStudentProjectInfo = async (courseId, payload) => {
  const res = await api.put(`/student/courses/${courseId}/project-info`, payload);
  return res.data;
};