import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL}`
});

// Add token automatically if stored
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('marksPortalToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
