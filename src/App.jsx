// client/src/App.jsx

import { Routes, Route, Navigate } from 'react-router-dom';

import LoginPage from './pages/LoginPage.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import TeacherDashboard from './pages/TeacherDashboard';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import TeacherCoursePage from './pages/TeacherCoursePage.jsx';
import StudentCoursePage from './pages/StudentCoursePage.jsx';
import StudentComplaintsPage from './pages/StudentComplaintsPage.jsx';
import TeacherComplaintsPage from "./pages/TeacherComplaintsPage.jsx";
import TeacherCreateCoursePage from './pages/TeacherCreateCoursePage';
import TeacherAttendancePage from "./pages/TeacherAttendancePage";
import TeacherRegisterPage from "./pages/TeacherRegisterPage";
import TeacherCoursesPage from "./pages/TeacherCoursesPage";
import TeacherRoutinePage from "./pages/TeacherRoutinePage.jsx";
import TeacherRoutineBuilderPage from "./pages/TeacherRoutineBuilderPage.jsx";
import AcademicCalendarPage from "./pages/AcademicCalendarPage.jsx";
import AcademicCalendarManagePage from "./pages/AcademicCalendarManagePage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";

import AppLayout from './layouts/AppLayout.jsx';
import TeacherAttendanceSheetPage from './pages/TeacherAttendanceSheetPage.jsx';
import StudentAttendanceSheetPage from './pages/StudentAttendanceSheetPage.jsx';
import { StudentCoursesPage } from './pages/StudentCoursesPage.jsx';

function App() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginPage />} />

      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Layout for all authenticated pages */}
      <Route element={<AppLayout />}>
        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" />} />

        {/* Student routes */}
        <Route
          path="/student/dashboard"
          element={<StudentDashboard />}
        />
        <Route
          path="/student/courses/:courseId"
          element={<StudentCoursePage />}
        />
        <Route path="/student/courses" element={<StudentCoursesPage />} />
        <Route path="/student/courses/:courseId" element={<StudentCoursePage />} />
        <Route
          path="/student/complaints"
          element={<StudentComplaintsPage />}
        />
        <Route path="/student/attendance" element={<StudentAttendanceSheetPage />} />


        <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
        <Route path="/teacher/create-course" element={<TeacherCreateCoursePage />} /> {/* ✅ new */}
        <Route path="/teacher/courses/:courseId" element={<TeacherCoursePage />} />
        <Route path="/teacher/complaints" element={<TeacherComplaintsPage />} />
        <Route path="/teacher/attendance" element={<TeacherAttendancePage />} />
        <Route path="/teacher/register" element={<TeacherRegisterPage />} />
        <Route path="/teacher/courses" element={<TeacherCoursesPage />} />
        <Route path="/teacher/attendance-sheet" element={<TeacherAttendanceSheetPage />} />
        <Route path="/teacher/routine" element={<TeacherRoutinePage />} />
        <Route path="/teacher/routine/manage" element={<TeacherRoutineBuilderPage />} />

        <Route path="/academic-calendar" element={<AcademicCalendarPage />} />
        <Route
          path="/teacher/academic-calendar/manage"
          element={<AcademicCalendarManagePage />}
        />

        {/* Shared */}
        <Route
          path="/change-password"
          element={<ChangePasswordPage />}
        />
      </Route>
    </Routes>
  );
}

export default App;
