import api from "./api";

export const loginRequest = async (username, password, rememberMe = false) => {
  const res = await api.post("/auth/login", {
    username,
    password,
    rememberMe,
  });

  return res.data;
};

export const changePasswordRequest = async (currentPassword, newPassword) => {
  const res = await api.post("/auth/change-password", {
    oldPassword: currentPassword,
    newPassword,
  });

  return res.data;
};

export const updateProfileRequest = async ({
  username,
  name,
  profileImageBase64,
}) => {
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

export const requestPasswordResetOtp = async ({ roll, fullName, email }) => {
  const res = await api.post("/auth/forgot-password/request-otp", {
    roll,
    fullName,
    email,
  });

  return res.data;
};

export const verifyPasswordResetOtp = async ({ roll, otp }) => {
  const res = await api.post("/auth/forgot-password/verify-otp", {
    roll,
    otp,
  });

  return res.data;
};

export const resetPasswordWithOtp = async ({ roll, otp, newPassword }) => {
  const res = await api.post("/auth/forgot-password/reset", {
    roll,
    otp,
    newPassword,
  });

  return res.data;
};