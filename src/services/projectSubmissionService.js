import api from "./api";

// teacher
export const fetchTeacherProjectSubmissions = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/project-submissions`);
  return res.data;
};

export const downloadTeacherProjectPhaseZip = async (courseId, phaseId) => {
  const res = await api.get(
    `/courses/${courseId}/project-submissions/${phaseId}/download-zip`,
    {
      responseType: "blob",
    }
  );
  return res.data;
};

// student
export const fetchStudentProjectSubmissions = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/project-submissions`);
  return res.data;
};

export const submitStudentProjectPhase = async (courseId, phaseId, payload) => {
  const formData = new FormData();
  formData.append("link", payload.link || "");
  formData.append("note", payload.note || "");

  if (payload.file) {
    formData.append("file", payload.file);
  }

  const res = await api.post(
    `/student/courses/${courseId}/project-submissions/${phaseId}`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return res.data;
};