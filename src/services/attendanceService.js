// client/src/services/attendanceService.js

import api from './api';

// Create/save one attendance sheet
export const createAttendanceRecord = async (payload) => {
  // POST /api/attendance
  const res = await api.post('/attendance', payload);
  return res.data;
};
