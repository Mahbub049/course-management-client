import api from "./api";

// Add one student
export const addStudentToCourseRequest = async (courseId, data) => {
  const res = await api.post(`/courses/${courseId}/students`, data);
  return res.data;
};

// Bulk add students
export const bulkAddStudentsToCourseRequest = async (courseId, students) => {
  const res = await api.post(`/courses/${courseId}/students/bulk`, { students });
  return res.data;
};

// Get students list
export const getCourseStudents = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/students`);
  return res.data;
};

// Delete by enrollmentId
export const deleteStudentFromCourseRequest = async (courseId, enrollmentId) => {
  const res = await api.delete(`/courses/${courseId}/students/${enrollmentId}`);
  return res.data;
};

// ✅ Regenerate password (by studentId)
export const resetStudentPasswordRequest = async (courseId, studentId) => {
  const res = await api.post(`/courses/${courseId}/students/${studentId}/reset-password`);
  return res.data;
};

export const resetAllStudentPasswordsRequest = async (courseId) => {
  const res = await api.post(`/courses/${courseId}/students/reset-password-all`);
  return res.data;
};

// ✅ Export students (Excel)
export const exportCourseStudentsRequest = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/students/export`);
  return res.data;
};

export const sendPasswordsByEmailRequest = async (courseId, payload) => {
  const res = await api.post(`/courses/${courseId}/students/send-password-emails`, payload);
  return res.data;
};

// ✅ NEW: Remove all students from a course
export const removeAllStudentsFromCourseRequest = async (courseId) => {
  const res = await api.delete(`/courses/${courseId}/students`);
  return res.data;
};

// Copy/enroll the same student accounts from another course owned by this teacher.
// Marks, attendance, passwords and OBE data are intentionally not copied.
export const copyStudentsFromCourseRequest = async (courseId, sourceCourseId) => {
  const res = await api.post(`/courses/${courseId}/students/copy-from-course`, {
    sourceCourseId,
  });
  return res.data;
};

// Update an enrolled student's account details (roll/name/email).
export const updateCourseStudentRequest = async (courseId, studentId, data) => {
  const res = await api.patch(`/courses/${courseId}/students/${studentId}`, data);
  return res.data;
};
