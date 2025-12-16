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


import AppLayout from './layouts/AppLayout.jsx';

function App() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginPage />} />

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
        <Route
          path="/student/complaints"
          element={<StudentComplaintsPage />}
        />

        <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
        <Route path="/teacher/create-course" element={<TeacherCreateCoursePage />} /> {/* ✅ new */}
        <Route path="/teacher/courses/:courseId" element={<TeacherCoursePage />} />
        <Route path="/teacher/complaints" element={<TeacherComplaintsPage />} />
        <Route path="/teacher/attendance" element={<TeacherAttendancePage />} />
        <Route path="/teacher/register" element={<TeacherRegisterPage />} />
        <Route path="/teacher/courses" element={<TeacherCoursesPage />} />



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
