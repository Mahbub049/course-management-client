import api from './api';
export const listExamDutySessions = async () => (await api.get('/exam-duties/sessions')).data;
export const importExamDutyRows = async (payload) => (await api.post('/exam-duties/import',payload)).data;
export const getMyExamDutySchedule = async (id) => (await api.get(`/exam-duties/sessions/${id}/mine`)).data;
export const findFacultyExamDuties = async (id,code) => (await api.get(`/exam-duties/sessions/${id}/search`,{params:{code}})).data;
export const acceptExamDutyProxy = async (id,payload) => (await api.post(`/exam-duties/sessions/${id}/proxies`,payload)).data;
export const removeExamDutyProxy = async (id,recordId) => (await api.delete(`/exam-duties/sessions/${id}/proxies/${recordId}`)).data;

export const deleteExamDutySession = async (id, confirm) => (await api.delete(`/exam-duties/sessions/${id}`, { data: { confirm } })).data;

export const applyExamDutyChange = async (id, payload) => (await api.post(`/exam-duties/sessions/${id}/changes`, payload)).data;
export const revertExamDutyChange = async (id, changeId) => (await api.delete(`/exam-duties/sessions/${id}/changes/${changeId}`)).data;
