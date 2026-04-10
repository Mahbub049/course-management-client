import api from "./api";

// get assessments for a course
export const fetchAssessments = async (courseId) => {
  const res = await api.get(`/courses/${courseId}/assessments`);
  return res.data;
};

// alias
export const fetchAssessmentsForCourse = fetchAssessments;

// create assessment
export const createAssessmentRequest = async (courseId, payload) => {
  const res = await api.post(`/courses/${courseId}/assessments`, payload);
  return res.data;
};

// update assessment
export const updateAssessmentRequest = async (assessmentId, payload) => {
  const res = await api.put(`/courses/assessments/${assessmentId}`, payload);
  return res.data;
};

// delete assessment
export const deleteAssessmentRequest = async (assessmentId) => {
  const res = await api.delete(`/courses/assessments/${assessmentId}`);
  return res.data;
};

// publish assessment
export const publishAssessmentRequest = async (courseId, assessmentId) => {
  const res = await api.post(
    `/courses/${courseId}/assessments/${assessmentId}/publish`
  );
  return res.data;
};