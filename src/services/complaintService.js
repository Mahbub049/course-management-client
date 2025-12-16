import api from './api';

// STUDENT: create complaint
export const createStudentComplaint = async (payload) => {
  const res = await api.post('/complaints/student', payload);
  return res.data;
};

// STUDENT: get own complaints
export const fetchStudentComplaints = async () => {
  const res = await api.get('/complaints/student');
  return res.data;
};

// TEACHER: get all complaints
export const fetchTeacherComplaints = async () => {
  const res = await api.get('/complaints/teacher');
  return res.data;
};

// TEACHER: reply / change status
export const replyTeacherComplaint = async (complaintId, reply, status) => {
  const res = await api.put(`/complaints/teacher/${complaintId}`, {
    reply,
    status,
  });
  return res.data;
};

export const deleteCourseRequest = async (courseId) => {
  const res = await api.delete(`/courses/${courseId}`);
  return res.data;
};
