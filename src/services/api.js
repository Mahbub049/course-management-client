import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api", // no template string needed
  // baseURL: import.meta.env.VITE_API_BASE_URL, // no template string needed
  // withCredentials: true, // only enable if you use cookies (you use JWT, so keep it OFF)
});

// Add token automatically if stored
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("marksPortalToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
