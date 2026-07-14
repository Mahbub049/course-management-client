import api from './api';

export const fetchNotebookNotes = async (params = {}) => {
  const res = await api.get('/notebook', { params });
  return res.data;
};

export const fetchNotebookNoteById = async (noteId) => {
  const res = await api.get(`/notebook/${noteId}`);
  return res.data;
};

export const createNotebookNote = async (payload) => {
  const res = await api.post('/notebook', payload);
  return res.data;
};

export const updateNotebookNote = async (noteId, payload) => {
  const res = await api.patch(`/notebook/${noteId}`, payload);
  return res.data;
};

export const deleteNotebookNote = async (noteId) => {
  const res = await api.delete(`/notebook/${noteId}`);
  return res.data;
};

export const refreshNotebookStudents = async (noteId) => {
  const res = await api.post(`/notebook/${noteId}/refresh-students`);
  return res.data;
};

export const fetchNotebookMarkSync = async (noteId) => {
  const res = await api.get(`/notebook/${noteId}/mark-sync`);
  return res.data;
};

export const saveNotebookMarkSync = async (noteId, mappings) => {
  const res = await api.put(`/notebook/${noteId}/mark-sync`, { mappings });
  return res.data;
};

export const syncNotebookMarks = async (noteId) => {
  const res = await api.post(`/notebook/${noteId}/sync-marks`);
  return res.data;
};
