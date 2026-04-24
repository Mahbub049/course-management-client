import api from './api';

export const fetchObeSetup = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/obe/setup`);
  return res.data;
};

export const saveObeSetupRequest = async (courseId, payload) => {
  const res = await api.put(`/courses/${courseId}/obe/setup`, payload);
  return res.data;
};

export const fetchObeBlueprints = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/obe/blueprints`);
  return res.data;
};

export const createObeBlueprintRequest = async (courseId, payload) => {
  const res = await api.post(`/courses/${courseId}/obe/blueprints`, payload);
  return res.data;
};

export const updateObeBlueprintRequest = async (courseId, blueprintId, payload) => {
  const res = await api.put(`/courses/${courseId}/obe/blueprints/${blueprintId}`, payload);
  return res.data;
};

export const deleteObeBlueprintRequest = async (courseId, blueprintId) => {
  const res = await api.delete(`/courses/${courseId}/obe/blueprints/${blueprintId}`);
  return res.data;
};

export const fetchObeMarkEntry = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/obe/marks`);
  return res.data;
};

export const saveObeMarksRequest = async (courseId, payload) => {
  const res = await api.post(`/courses/${courseId}/obe/marks`, payload);
  return res.data;
};

export const fetchObeOutput = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/obe/output`);
  return res.data;
};
