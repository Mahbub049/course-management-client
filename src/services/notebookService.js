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
