// client/src/pages/TeacherCreateCoursePage.jsx

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCourseRequest } from "../services/courseService";
import Swal from "sweetalert2";

function TeacherCreateCoursePage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    code: "",
    title: "",
    section: "",
    semester: "Spring", // default value
    year: new Date().getFullYear(),
    courseType: "theory",
  });

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Year picker options (current year +/- 10)
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const start = current - 10;
    const end = current + 10;
    const arr = [];
    for (let y = end; y >= start; y--) arr.push(y);
    return arr;
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "year" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setCreating(true);

      const payload = {
        code: form.code.trim(),
        title: form.title.trim(),
        section: form.section.trim(),
        semester: form.semester,
        year: form.year,
        courseType: form.courseType,
      };

      await createCourseRequest(payload);

      const result = await Swal.fire({
        icon: "success",
        title: "Course Created!",
        text: "The course has been successfully created.",
        showConfirmButton: true,
        showCancelButton: true,
        showCloseButton: true,          // ❌ cross button
        confirmButtonText: "Go to Dashboard",
        cancelButtonText: "Add Another Course",
        confirmButtonColor: "#4f46e5",
        cancelButtonColor: "#64748b",
      });

      if (result.isConfirmed) {
        navigate("/teacher/dashboard");
      }

      if (result.dismiss === Swal.DismissReason.cancel) {
        // stay on page & reset form
        setForm({
          code: "",
          title: "",
          section: "",
          semester: form.semester, // keep same semester
          year: form.year,         // keep same year
          courseType: form.courseType,
        });
      }

    } catch (err) {
      console.error(err);

      Swal.fire({
        icon: "error",
        title: "Creation Failed",
        text:
          err?.response?.data?.message ||
          "Failed to create course. Please try again.",
      });

      setError(
        err?.response?.data?.message || "Failed to create course."
      );
    } finally {
      setCreating(false);
    }
  };


  return (
    <div className="mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Create New Course
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">
            Create a course once. Then manage students, assessments, marks,
            attendance, and complaints from a single dashboard.
          </p>
        </div>
      </div>

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm"
      >
        {/* Card Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <svg
              className="h-5 w-5 text-purple-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M12 6v12m6-6H6" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Course Information
            </h2>
            <p className="text-xs text-slate-500">
              Basic academic details for this course
            </p>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6 space-y-6">
          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Course Code
              </label>
              <input
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                placeholder="CSE-207"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Course Title
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Database Systems"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                required
              />
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Course Type
              </label>
              <select
                name="courseType"
                value={form.courseType}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              >
                <option value="theory">Theory Course</option>
                <option value="lab">Lab Course</option>
                <option value="hybrid">Hybrid Course</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Section
              </label>
              <input
                type="text"
                name="section"
                value={form.section}
                onChange={handleChange}
                placeholder="54/5"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                required
              />
            </div>

            {/* ✅ Semester dropdown */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Semester
              </label>
              <select
                name="semester"
                value={form.semester}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                required
              >
                <option value="Summer">Summer</option>
                <option value="Spring">Spring</option>
                <option value="Fall">Fall</option>
              </select>
            </div>

            {/* ✅ Year picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Year
              </label>
              <select
                name="year"
                value={form.year}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                required
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>


          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
          <p className="text-xs text-slate-400">
            You can edit assessments and students after creation
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/teacher/dashboard")}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 rounded-lg bg-purple-600 text-sm font-semibold text-white shadow hover:bg-purple-700 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create Course"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default TeacherCreateCoursePage;
