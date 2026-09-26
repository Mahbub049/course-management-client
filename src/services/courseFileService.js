import api from "./api";

export async function fetchCourseFileState(courseId) {
  const { data } = await api.get(`/courses/${courseId}/course-file`);
  return data;
}

export async function saveCourseFileSetup(courseId, sections) {
  const { data } = await api.put(`/courses/${courseId}/course-file/setup`, { sections });
  return data;
}

export async function saveCourseFileMappings(courseId, payload) {
  const { data } = await api.put(`/courses/${courseId}/course-file/mappings`, payload);
  return data;
}

export async function saveCourseFileSelection(courseId, payload) {
  const { data } = await api.put(`/courses/${courseId}/course-file/selection`, payload);
  return data;
}

export async function uploadCourseFileDocuments(courseId, itemKey, files, metadata = []) {
  const form = new FormData();
  form.append("itemKey", itemKey);
  (files || []).forEach((file) => form.append("files", file));
  form.append("metadata", JSON.stringify(metadata || []));
  const { data } = await api.post(`/courses/${courseId}/course-file/documents`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 180000,
  });
  return data;
}

export async function importLabSubmissionToCourseFile(courseId, payload) {
  const { data } = await api.post(`/courses/${courseId}/course-file/import-submission`, payload);
  return data;
}

export async function updateCourseFileDocument(courseId, documentId, payload) {
  const { data } = await api.patch(`/courses/${courseId}/course-file/documents/${documentId}`, payload);
  return data;
}

export async function deleteCourseFileDocument(courseId, documentId) {
  const { data } = await api.delete(`/courses/${courseId}/course-file/documents/${documentId}`);
  return data;
}

export async function downloadCourseFileDocumentBlob(courseId, documentId) {
  const response = await api.get(`/courses/${courseId}/course-file/documents/${documentId}/download`, {
    responseType: "blob",
    timeout: 180000,
  });
  return response.data;
}

async function officePdfErrorMessage(error) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      if (!text) return error?.message || "PDF conversion failed.";
      try {
        const parsed = JSON.parse(text);
        return parsed?.message || text;
      } catch {
        return text;
      }
    } catch {
      // Fall through to the normal Axios message.
    }
  }
  return data?.message || error?.message || "PDF conversion failed.";
}

export async function convertCourseFileOfficeToPdf(courseId, file, sheetName = "") {
  const form = new FormData();
  form.append("file", file);
  if (sheetName) form.append("sheetName", sheetName);
  try {
    const response = await api.post(`/courses/${courseId}/course-file/convert-office-pdf`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      responseType: "blob",
      timeout: 180000,
    });
    return response.data;
  } catch (error) {
    throw new Error(await officePdfErrorMessage(error));
  }
}
