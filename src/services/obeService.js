import api from "./api";

export const getObeSetup = async (courseId) => {
  const { data } = await api.get(`/courses/${courseId}/obe/setup`);
  return data;
};

export const saveObeSetup = async (courseId, payload) => {
  const { data } = await api.put(`/courses/${courseId}/obe/setup`, payload);
  return data;
};

export const getObeBlueprints = async (courseId) => {
  const { data } = await api.get(`/courses/${courseId}/obe/blueprints`);
  return data;
};

export const createObeBlueprint = async (courseId, payload) => {
  const { data } = await api.post(`/courses/${courseId}/obe/blueprints`, payload);
  return data;
};

export const updateObeBlueprint = async (courseId, blueprintId, payload) => {
  const { data } = await api.put(`/courses/${courseId}/obe/blueprints/${blueprintId}`, payload);
  return data;
};

export const deleteObeBlueprint = async (courseId, blueprintId) => {
  const { data } = await api.delete(`/courses/${courseId}/obe/blueprints/${blueprintId}`);
  return data;
};

export const getObeMarks = async (courseId) => {
  const { data } = await api.get(`/courses/${courseId}/obe/marks`);
  return data;
};

export const saveObeMarks = async (courseId, payload) => {
  const { data } = await api.post(`/courses/${courseId}/obe/marks`, payload);
  return data;
};

export const getObeOutput = async (courseId) => {
  const { data } = await api.get(`/courses/${courseId}/obe/output`);
  return data;
};

export const getObeExportPayload = async (courseId) => {
  const { data } = await api.get(`/courses/${courseId}/obe/export-payload`);
  return data;
};

export const downloadObeCrr = async (courseId) => {
  const response = await api.get(`/courses/${courseId}/obe/crr/download`, {
    responseType: "blob",
  });
  return response.data;
};