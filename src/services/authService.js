import api from "./api";

export const loginRequest = async (username, password) => {
  const res = await api.post("/auth/login", { username, password });
  return res.data;
};

export const changePasswordRequest = async (currentPassword, newPassword) => {
  const res = await api.post("/auth/change-password", {
    oldPassword: currentPassword,
    newPassword,
  });
  return res.data;
};

export const updateProfileRequest = async ({ username, name, profileImageBase64 }) => {
  const res = await api.put("/auth/profile", {
    username,
    name,
    profileImageBase64,
  });
  return res.data;
};

export const teacherRegisterRequest = async (payload) => {
  const res = await api.post("/auth/teacher/register", payload);
  return res.data;
};