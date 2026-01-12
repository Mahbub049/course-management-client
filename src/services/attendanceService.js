// client/src/services/attendanceService.js
import api from "./api";

// ---------------- TEACHER ----------------

// Create/save one attendance (single period)
export const createAttendanceRecord = async (payload) => {
  const res = await api.post("/attendance", payload);
  return res.data;
};

// Create/save attendance for multiple periods at once
export const createAttendanceBulk = async (payload) => {
  const res = await api.post("/attendance/bulk", payload);
  return res.data;
};

export const fetchAttendanceSheet = async (courseId) => {
  const res = await api.get("/attendance/sheet", { params: { courseId } });
  return res.data;
};

// period-wise fetch (teacher)
export const fetchAttendanceDay = async (courseId, date, period) => {
  const res = await api.get("/attendance/day", {
    params: { courseId, date, period },
  });
  return res.data;
};

// period-wise update (teacher)
export const updateAttendanceDay = async (payload) => {
  const res = await api.put("/attendance/day", payload);
  return res.data;
};

// ---------------- STUDENT ----------------

// ✅ Student attendance sheet (period-wise)
export const fetchStudentAttendanceSheet = async (courseId) => {
  const res = await api.get("/attendance/student-sheet", { params: { courseId } });
  return res.data;
};
