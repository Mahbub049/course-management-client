import api from "./api";

export const notificationService = {
  getProfile: async () => {
    const response = await api.get("/notifications/profile");
    return response.data;
  },

  updatePreferences: async (payload) => {
    const response = await api.put("/notifications/preferences", payload);
    return response.data;
  },

  setReminderState: async (sourceKey, completed) => {
    const response = await api.put("/notifications/state", {
      sourceKey,
      completed,
    });
    return response.data;
  },

  registerDeviceToken: async (token, platform = "unknown") => {
    const response = await api.post("/notifications/device-token", {
      token,
      platform,
    });
    return response.data;
  },

  unregisterDeviceToken: async (token) => {
    const response = await api.delete("/notifications/device-token", {
      data: { token },
    });
    return response.data;
  },
};
