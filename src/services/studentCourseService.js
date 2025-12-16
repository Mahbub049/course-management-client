// client/src/services/studentCourseService.js

import api from './api';

// Student: list of enrolled courses
export const fetchStudentCourses = async () => {
  const res = await api.get('/student/courses');
  return res.data;
};

// Student: marks for one course
export const fetchStudentCourseMarks = async (courseId) => {
  const res = await api.get(`/student/courses/${courseId}/marks`);
  return res.data;
};
