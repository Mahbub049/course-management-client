import api from './api';

export const loginRequest = async (username, password) => {
  const res = await api.post('/auth/login', { username, password });
  return res.data; // { token, role, name }
};

export const changePasswordRequest = async (currentPassword, newPassword) => {
  const res = await api.post('/auth/change-password', {
    oldPassword: currentPassword,   // 👈 key changed
    newPassword,                    // 👈 same as before
  });
  return res.data;
};

export const updateProfileRequest = async ({ username, name }) => {
  const res = await api.put('/auth/profile', { username, name });
  return res.data;
};

export const teacherRegisterRequest = async (payload) => {
  const res = await api.post("/auth/teacher/register", payload);
  return res.data;
};
