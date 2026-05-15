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
};