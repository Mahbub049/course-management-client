import api from "./api";

export const getRoutineReferenceData = async () => {
  const res = await api.get("/routine/reference-data");
  return res.data;
};

export const getMyRoutine = async () => {
  const res = await api.get("/routine/my");
  return res.data;
};

export const saveMyRoutine = async (payload) => {
  const res = await api.put("/routine/my", payload);
  return res.data;
};

export const downloadRoutineDocument = async (kind) => {
  const endpoint = kind === "faculty-nameplate"
    ? "/routine/my/download/faculty-nameplate"
    : "/routine/my/download/class-routine";
  const res = await api.get(endpoint, { responseType: "blob" });
  const disposition = String(res.headers?.["content-disposition"] || "");
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  const filename = filenameMatch?.[1] || (kind === "faculty-nameplate" ? "Faculty_Nameplate.docx" : "Class_Routine.docx");
  const url = window.URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const getTeacherCounsellingBookings = async ({ includeRegister = false } = {}) => {
  const res = await api.get("/routine/my/counselling-bookings", {
    params: includeRegister ? { includeRegister: true } : undefined,
  });
  return res.data;
};

export const updateTeacherCounsellingBooking = async (bookingId, payload) => {
  const res = await api.patch(`/routine/my/counselling-bookings/${bookingId}`, payload);
  return res.data;
};

export const getStudentCounsellingInfo = async () => {
  const res = await api.get("/routine/student/counselling");
  return res.data;
};

export const createStudentCounsellingBooking = async (payload) => {
  const res = await api.post("/routine/student/counselling-bookings", payload);
  return res.data;
};

export const deleteStudentCounsellingBooking = async (bookingId) => {
  const res = await api.delete(`/routine/student/counselling-bookings/${bookingId}`);
  return res.data;
};

export const deleteTeacherCounsellingBooking = async (bookingId) => {
  const res = await api.delete(`/routine/my/counselling-bookings/${bookingId}`);
  return res.data;
};

export const createTeacherCounsellingRecord = async (payload) => {
  const res = await api.post("/routine/my/counselling-records", payload);
  return res.data;
};

export const deleteTeacherCounsellingRecord = async (recordId) => {
  const res = await api.delete(`/routine/my/counselling-records/${recordId}`);
  return res.data;
};

export const getTeacherCounsellingReport = async (params = {}) => {
  const res = await api.get("/routine/my/counselling-records/report", { params });
  return res.data;
};
