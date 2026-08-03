import api from "./api";

let warmUpPromise = null;
let lastWarmUpAt = 0;
const WARM_UP_CACHE_MS = 2 * 60 * 1000;

export const warmUpApi = async () => {
  if (Date.now() - lastWarmUpAt < WARM_UP_CACHE_MS) {
    return true;
  }

  if (!warmUpPromise) {
    warmUpPromise = api
      .get("/health", {
        timeout: 90_000,
        skipAuthRedirect: true,
        __skipAutomaticRetry: true,
      })
      .then(() => {
        lastWarmUpAt = Date.now();
        return true;
      })
      .finally(() => {
        warmUpPromise = null;
      });
  }

  return warmUpPromise;
};

export const loginRequest = async (username, password, rememberMe = false) => {
  // Wake the API before login. This is especially important when the backend
  // is hosted on a service that sleeps after a period of inactivity.
  try {
    await warmUpApi();
  } catch {
    // Continue to the login request so a genuine API response can still be
    // shown when the health request was blocked by a temporary network issue.
  }

  const res = await api.post("/auth/login", {
    username,
    password,
    rememberMe,
  });

  return res.data;
};

export const validateSessionRequest = async () => {
  const res = await api.get("/auth/profile", {
    skipAuthRedirect: true,
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

export const getProfileRequest = async () => {
  const res = await api.get("/auth/profile");
  return res.data;
};

export const updateProfileRequest = async ({
  username,
  name,
  email,
  phone,
  shortCode,
  designation,
  department,
  profileImageBase64,
  signatureImageBase64,
}) => {
  const res = await api.put("/auth/profile", {
    username,
    name,
    email,
    phone,
    shortCode,
    designation,
    department,
    profileImageBase64,
    signatureImageBase64,
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
