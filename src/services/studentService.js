// client/src/services/studentService.js

import api from './api';

// List of courses for the logged-in student
export const fetchStudentCourses = async () => {
  const res = await api.get('/student/courses');
  return res.data; // array of courses
};

// Detailed marks for ONE course for this student
export const fetchStudentCourseDetails = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}`);
  return res.data; // { course, assessments, totalObtained, grade, aPlusInfo, ... }
};

// Alias used by StudentCoursePage.jsx
export const fetchStudentCourseMarks = async (courseId) => {
  // just reuse the same endpoint
  return fetchStudentCourseDetails(courseId);
};
