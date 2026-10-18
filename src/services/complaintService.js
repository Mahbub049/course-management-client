import api from './api';

// STUDENT: create complaint
export const createStudentComplaint = async (payload) => {
  // Multipart allows a single attendance application plus supporting evidence.
  const body = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value == null) return;
    if (key === "attachments") {
      (value || []).forEach((file) => body.append("attachments", file));
    } else if (typeof value === "object") {
      body.append(key, JSON.stringify(value));
    } else {
      body.append(key, value);
    }
  });
  const res = await api.post('/complaints/student', body);
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

export const resolveAttendanceComplaint = async (complaintId, reply = "", includePendingForStudent = false) => {
  const res = await api.post(`/complaints/teacher/${complaintId}/resolve-attendance`, {
    reply,
    includePendingForStudent,
  });
  return res.data;
};

// TEACHER: one server-authorized operation over all owned active courses.
export const bulkManageIssueAccess = async (payload) => {
  const res = await api.post('/complaints/teacher/access/bulk', payload);
  return res.data;
};
