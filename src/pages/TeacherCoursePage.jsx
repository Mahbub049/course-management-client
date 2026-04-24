import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import TeacherCourseLayout from "./teacherCourse/TeacherCourseLayout";
import TabStudents from "./teacherCourse/TabStudents";
import TabAssessments from "./teacherCourse/TabAssessments";
import TabMarks from "./teacherCourse/TabMarks";
import TabSettings from "./teacherCourse/TabSettings";
import TabAttendance from "./teacherCourse/TabAttendence";
import TabMaterials from "./teacherCourse/TabMaterials";
import TabProjects from "./teacherCourse/TabProjects";
import TeacherLabSubmissions from "./teacherCourse/TeacherLabSubmissions";
import TabObe from "./teacherCourse/TabObe";

import { fetchCourseById } from "../services/courseService";

export default function TeacherCoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("marks");
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

  useEffect(() => {
    const isProjectMode = course?.projectFeature?.mode === "project";
    if (!isProjectMode && activeTab === "projects") {
      setActiveTab("settings");
    }
  }, [course, activeTab]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  }

  if (!course) {
    return <div className="p-6 text-sm text-rose-500">Course not found.</div>;
  }

  return (
    <TeacherCourseLayout
      course={course}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      {activeTab === "students" && <TabStudents courseId={courseId} />}

      {activeTab === "assessments" && (
        <TabAssessments
          courseId={courseId}
          course={course}
          onCourseUpdated={setCourse}
        />
      )}

      {activeTab === "marks" && <TabMarks courseId={courseId} course={course} />}
      {activeTab === "attendance" && <TabAttendance courseId={courseId} />}
      {activeTab === "materials" && <TabMaterials courseId={courseId} />}
      {activeTab === "obe" && <TabObe courseId={courseId} course={course} />}
      {activeTab === "submissions" && <TeacherLabSubmissions courseId={courseId} />}
      {activeTab === "projects" && <TabProjects course={course} />}

      {activeTab === "settings" && (
        <TabSettings
          courseId={courseId}
          course={course}
          onCourseUpdated={setCourse}
          onOpenProjects={() => setActiveTab("projects")}
        />
      )}
    </TeacherCourseLayout>
  );
}