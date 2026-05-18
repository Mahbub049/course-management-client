import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

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

const DEFAULT_TAB = "marks";

const BASE_TABS = [
  "marks",
  "assessments",
  "materials",
  "obe",
  "submissions",
  "students",
  "attendance",
  "settings",
];

function getSafeTab(tab, course) {
  const isProjectMode = course?.projectFeature?.mode === "project";

  const allowedTabs = isProjectMode
    ? [...BASE_TABS, "projects"]
    : BASE_TABS;

  if (!tab || !allowedTabs.includes(tab)) {
    return DEFAULT_TAB;
  }

  return tab;
}

export default function TeacherCoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  const role = localStorage.getItem("marksPortalRole");

  useEffect(() => {
    if (role !== "teacher") {
      navigate("/login", { replace: true });
    }
  }, [role, navigate]);

  useEffect(() => {
    async function load() {
      setLoading(true);

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

    if (courseId) {
      load();
    }
  }, [courseId]);

  const rawTab = searchParams.get("tab");

  const activeTab = useMemo(() => {
    return getSafeTab(rawTab, course);
  }, [rawTab, course]);

  useEffect(() => {
    if (loading || !course) return;

    const safeTab = getSafeTab(rawTab, course);

    if (rawTab !== safeTab) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("tab", safeTab);
      setSearchParams(nextParams, { replace: true });
    }
  }, [rawTab, course, loading, searchParams, setSearchParams]);

  const handleTabChange = (tabId) => {
    const safeTab = getSafeTab(tabId, course);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", safeTab);

    setSearchParams(nextParams);
  };

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
      setActiveTab={handleTabChange}
    >
      {activeTab === "students" && <TabStudents courseId={courseId} />}

      {activeTab === "assessments" && (
        <TabAssessments
          courseId={courseId}
          course={course}
          onCourseUpdated={setCourse}
        />
      )}

      {activeTab === "marks" && (
        <TabMarks courseId={courseId} course={course} />
      )}

      {activeTab === "attendance" && <TabAttendance courseId={courseId} />}

      {activeTab === "materials" && <TabMaterials courseId={courseId} />}

      {activeTab === "obe" && (
        <TabObe courseId={courseId} course={course} />
      )}

      {activeTab === "submissions" && (
        <TeacherLabSubmissions courseId={courseId} />
      )}

      {activeTab === "projects" && <TabProjects course={course} />}

      {activeTab === "settings" && (
        <TabSettings
          courseId={courseId}
          course={course}
          onCourseUpdated={setCourse}
          onOpenProjects={() => handleTabChange("projects")}
        />
      )}
    </TeacherCourseLayout>
  );
}