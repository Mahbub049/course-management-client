import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api', // change to your backend URL in prod
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
