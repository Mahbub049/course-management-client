// client/src/services/courseService.js

import api from './api';

// Get all courses for the logged-in teacher
export const fetchTeacherCourses = async ({ archived = false } = {}) => {
  const res = await api.get(`/courses?archived=${archived}`);
  return res.data;
};

export const archiveCourseRequest = async (courseId) => {
  const res = await api.put(`/courses/${courseId}`, { archived: true });
  return res.data;
};

export const unarchiveCourseRequest = async (courseId) => {
  const res = await api.put(`/courses/${courseId}`, { archived: false });
  return res.data;
};

// Create a new course
export const createCourseRequest = async (courseData) => {
  const res = await api.post('/courses', courseData);
  return res.data; // created course
};

// Get single course by ID
export const fetchCourseById = async (courseId) => {
  const res = await api.get(`/courses/${courseId}`);
  return res.data;
};


// Delete a course by ID
export const deleteCourseRequest = async (courseId) => {
  const res = await api.delete(`/courses/${courseId}`);
  return res.data;
};


export const updateCourseRequest = async (courseId, payload) => {
  const res = await api.put(`/courses/${courseId}`, payload);
  return res.data;
};
