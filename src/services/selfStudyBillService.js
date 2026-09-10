import api from "./api";

export async function fetchSelfStudyBill(courseId) {
  const res = await api.get(`/courses/${courseId}/self-study-bill`);
  return res.data;
}

export async function saveSelfStudyStudentIntakes(courseId, students) {
  const res = await api.put(`/courses/${courseId}/self-study-bill/intakes`, { students });
  return res.data;
}

export async function downloadSelfStudyBill(courseId, students) {
  const res = await api.post(
    `/courses/${courseId}/self-study-bill/download`,
    { students },
    { responseType: "blob" }
  );

  const disposition = res.headers?.["content-disposition"] || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || "Self_Study_Payment_Note.docx";
  const url = window.URL.createObjectURL(res.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
