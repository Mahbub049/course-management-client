import api from "./api";

export const fetchMarksForCourse = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/marks`);
  return res.data; // array of { student, assessment, obtainedMarks, subMarks }
};

export const saveMarksForCourseRequest = async (courseId, marks) => {
  const res = await api.post(`/courses/${courseId}/marks`, { marks });
  return res.data;
};