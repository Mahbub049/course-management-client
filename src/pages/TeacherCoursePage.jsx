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
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-center gap-4">
            {/* Spinner */}
            <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin" />

            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                Loading course...
              </p>
              <p className="text-xs text-slate-500">
                Please wait while we fetch course details.
              </p>
            </div>
          </div>

          {/* Skeleton lines */}
          <div className="mt-5 space-y-3">
            <div className="h-3 w-3/4 rounded bg-slate-100 animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-slate-100 animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm p-6 text-center">
          {/* Icon */}
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86l-7.4 12.8A2 2 0 0 0 4.6 19h14.8a2 2 0 0 0 1.71-2.34l-7.4-12.8a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>

          <h3 className="mt-3 text-base font-semibold text-slate-900">
            Course not found
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            The course may have been deleted or you don’t have access.
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => navigate("/teacher/courses")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to Courses
            </button>
            <button
              onClick={() => navigate("/teacher/dashboard")}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }


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
      {activeTab === "settings" && (
        <TabSettings
          courseId={courseId}
          course={course}
          onCourseUpdated={setCourse}   // ✅ THIS LINE
        />
      )}

    </TeacherCourseLayout>
  );
}
