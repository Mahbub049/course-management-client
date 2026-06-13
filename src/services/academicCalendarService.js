import api from "./api";

export const academicCalendarService = {
  getLatest: async () => {
    const res = await api.get("/academic-calendar");
    return res.data;
  },

  save: async (payload) => {
    const res = await api.post("/academic-calendar", payload);
    return res.data;
  },

  getFacultyEvents: async (params = {}) => {
    const res = await api.get("/academic-calendar/faculty-events", { params });
    return res.data;
  },

  createFacultyEvent: async (payload) => {
    const res = await api.post("/academic-calendar/faculty-events", payload);
    return res.data;
  },

  updateFacultyEvent: async (eventId, payload) => {
    const res = await api.put(`/academic-calendar/faculty-events/${eventId}`, payload);
    return res.data;
  },

  deleteFacultyEvent: async (eventId) => {
    const res = await api.delete(`/academic-calendar/faculty-events/${eventId}`);
    return res.data;
  },
};
