import { academicCalendarService } from "../services/academicCalendarService";
import { fetchStudentSubmissionAssessments } from "../services/labSubmissionService";
import { fetchStudentPendingProjectSubmissions } from "../services/projectSubmissionService";
import { addDays, isoFromDate } from "./calendarUtils";
import { buildUpcomingSchedule } from "./upcomingSchedule";

function localDateTime(dateIso, time = "") {
  const safeTime = /^\d{2}:\d{2}$/.test(String(time || "")) ? time : "08:00";
  const date = new Date(`${dateIso}T${safeTime}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function categoryForScheduleItem(item = {}) {
  if (item.source === "academic") return "academicCalendar";
  if (item.type === "Task") return "tasks";
  if (item.type === "Exam") return "exams";
  return "events";
}

function scheduleItemBody(item = {}) {
  const parts = [];
  if (item.type) parts.push(item.type);
  if (item.startTime) parts.push(item.startTime);
  if (item.details) parts.push(item.details);
  return parts.filter(Boolean).join(" · ") || "Upcoming portal item";
}

function mapScheduleItem(item) {
  const dueAt = localDateTime(item.displayDate || item.startDate, item.startTime);
  if (!dueAt) return null;

  return {
    sourceKey: item.sourceKey || `${item.source}:${item.id}`,
    source: item.source,
    category: categoryForScheduleItem(item),
    title: item.title || "Upcoming item",
    body: scheduleItemBody(item),
    dueAt: dueAt.toISOString(),
    route: item.route || "/academic-calendar",
    canMarkDone: Boolean(item.canMarkDone),
    metadata: {
      type: item.type || "Event",
      date: item.displayDate || item.startDate || "",
      startTime: item.startTime || "",
    },
  };
}

function getDueTime(dueDate) {
  if (!dueDate) return null;
  const time = new Date(dueDate).getTime();
  return Number.isNaN(time) ? null : time;
}

function isStudentSubmissionActive(item, now = Date.now()) {
  if (!item) return false;
  if (item.isVisibleToStudents !== true) return false;
  if (item.taskType === "project_phase" && item.submission) return false;
  if (item.submissionsOpen === false) return false;
  if (item.dueDatePassed === true) return false;

  const dueTime = getDueTime(item.dueDate);
  return !dueTime || dueTime > now;
}

function mapStudentSubmission(item = {}) {
  const dueTime = getDueTime(item.dueDate);
  if (!dueTime) return null;

  const courseCode = item.course?.code || "Course";
  const section = item.course?.section ? `Section ${item.course.section}` : "";
  const itemName = item.name || item.taskLabel || item.submissionLabel || "Submission";

  return {
    sourceKey: `${item.taskType || "submission"}:${item.id || item.phaseId}`,
    source: "student-submission",
    category: "submissions",
    title: itemName,
    body: [courseCode, section, "Submission deadline"].filter(Boolean).join(" · "),
    dueAt: new Date(dueTime).toISOString(),
    route: item.navigateTo || "/student/courses",
    // This is only a personal reminder state. It never changes the real submission.
    canMarkDone: true,
    metadata: {
      courseCode,
      taskType: item.taskType || "submission",
    },
  };
}

export async function loadPortalNotificationItems({ role, scheduleWindowDays = 7 } = {}) {
  const today = new Date();
  const startDate = isoFromDate(today);
  const endDate = isoFromDate(addDays(today, Math.max(1, Number(scheduleWindowDays) || 7)));

  const academicPromise = academicCalendarService.getLatest().catch((error) => {
    console.error("Could not load academic calendar for notifications", error);
    return { calendar: null };
  });

  if (role === "teacher") {
    const [facultyData, academicData] = await Promise.all([
      academicCalendarService
        .getFacultyEvents({ startDate, endDate })
        .catch((error) => {
          console.error("Could not load faculty calendar for notifications", error);
          return { events: [] };
        }),
      academicPromise,
    ]);

    return buildUpcomingSchedule(
      academicData?.calendar,
      facultyData?.events || [],
      startDate,
      endDate,
      { limit: 100 }
    )
      .map(mapScheduleItem)
      .filter(Boolean);
  }

  if (role === "student") {
    const [assessmentData, projectData, academicData] = await Promise.all([
      fetchStudentSubmissionAssessments().catch((error) => {
        console.error("Could not load assessment reminders", error);
        return [];
      }),
      fetchStudentPendingProjectSubmissions().catch((error) => {
        console.error("Could not load project reminders", error);
        return [];
      }),
      academicPromise,
    ]);

    const assessmentItems = Array.isArray(assessmentData)
      ? assessmentData.map((item) => ({
          ...item,
          taskType: "lab_submission",
          taskLabel: "Assessment Submission",
          navigateTo: `/student/courses/${item.course?.id}?tab=submissions`,
        }))
      : [];

    const projectItems = Array.isArray(projectData)
      ? projectData.map((item) => ({
          ...item,
          taskType: "project_phase",
          taskLabel: item.submissionLabel || "Project Phase",
          navigateTo: item.missingGroup
            ? `/student/courses/${item.course?.id}?tab=project&projectTab=my-group`
            : `/student/courses/${item.course?.id}?tab=project&projectTab=workflow&phaseId=${item.phaseId || item.id}`,
        }))
      : [];

    const submissionItems = [...assessmentItems, ...projectItems]
      .filter((item) => isStudentSubmissionActive(item))
      .map(mapStudentSubmission)
      .filter(Boolean);

    const academicItems = buildUpcomingSchedule(
      academicData?.calendar,
      [],
      startDate,
      endDate,
      { limit: 100 }
    )
      .map(mapScheduleItem)
      .filter(Boolean);

    return [...submissionItems, ...academicItems].sort(
      (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    );
  }

  return [];
}
