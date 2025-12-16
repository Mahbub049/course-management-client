import api from "./api";

export const fetchAttendanceSummary = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/attendance-summary`);
  return res.data;
};

export const saveAttendanceSummary = async (courseId, records) => {
  const res = await api.post(`/courses/${courseId}/attendance-summary`, {
    records,
  });
  return res.data;
};
