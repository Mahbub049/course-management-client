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
  const res = await api.post(
    `/courses/${courseId}/students/${studentId}/reset-password`
  );
  return res.data;
};


// ✅ Export students (Excel)
export const exportCourseStudentsRequest = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/students/export`);
  return res.data;
};
