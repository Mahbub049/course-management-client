// client/src/services/attendanceService.js

import api from './api';

// Create/save one attendance sheet
export const createAttendanceRecord = async (payload) => {
  // POST /api/attendance
  const res = await api.post('/attendance', payload);
  return res.data;
};

export const fetchAttendanceSheet = async (courseId) => {
  const res = await api.get("/attendance/sheet", { params: { courseId } });
  return res.data;
};

export const fetchAttendanceDay = async (courseId, date) => {
  const res = await api.get("/attendance/day", { params: { courseId, date } });
  return res.data;
};

export const updateAttendanceDay = async (payload) => {
  // payload: { courseId, date, numClasses, records }
  const res = await api.put("/attendance/day", payload);
  return res.data;
};
