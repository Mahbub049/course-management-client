import api from "./api";

export const getMyRoutine = async () => {
  const res = await api.get("/routine/my");
  return res.data;
};

export const saveMyRoutine = async (payload) => {
  const res = await api.put("/routine/my", payload);
  return res.data;
};

export const getTeacherCounsellingBookings = async () => {
  const res = await api.get("/routine/my/counselling-bookings");
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
