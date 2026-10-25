import api from "./api";

export async function fetchMyExamDutyReminders() {
  const { data } = await api.get("/exam-duties/reminders");
  return Array.isArray(data?.duties) ? data.duties : [];
}
