import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import TeacherCourseLayout from "./teacherCourse/TeacherCourseLayout";
import TabStudents from "./teacherCourse/TabStudents";
import TabAssessments from "./teacherCourse/TabAssessments";
import TabMarks from "./teacherCourse/TabMarks";
import TabSettings from "./teacherCourse/TabSettings";
import TabAttendance from "./teacherCourse/TabAttendence"; // ✅ NEW (match your filename)

import { fetchCourseById } from "../services/courseService";

export default function TeacherCoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("students");
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  const role = localStorage.getItem("marksPortalRole");

  useEffect(() => {
    if (role !== "teacher") navigate("/login");
  }, [role, navigate]);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCourseById(courseId);
        setCourse(data);
      } catch (err) {
        console.error(err);
        alert("Failed to load course details.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [courseId]);

  if (loading) return <div className="p-6">Loading course...</div>;
  if (!course) return <div className="p-6 text-red-600">Course not found.</div>;

  return (
    <TeacherCourseLayout
      course={course}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      {activeTab === "students" && <TabStudents courseId={courseId} />}
      {activeTab === "assessments" && (
        <TabAssessments courseId={courseId} course={course} />
      )}

      {activeTab === "marks" && <TabMarks courseId={courseId} course={course} />}
      {activeTab === "attendance" && <TabAttendance courseId={courseId} />}
      {activeTab === "settings" && <TabSettings courseId={courseId} course={course} />}
    </TeacherCourseLayout>
  );
}
