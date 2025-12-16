import api from './api';

export const fetchMarksForCourse = async (courseId) => {
    const res = await api.get(`/courses/${courseId}/marks`);
    return res.data; // array of { student, assessment, obtainedMarks }
};

export const saveMarksForCourseRequest = async (courseId, marks) => {
  return api.post(`/courses/${courseId}/marks`, { marks });
};

