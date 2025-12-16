// client/src/services/courseService.js

import api from './api';

// Get all courses for the logged-in teacher
export const fetchTeacherCourses = async () => {
  const res = await api.get('/courses');
  return res.data; // array of courses
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
