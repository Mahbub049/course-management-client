import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { teacherRegisterRequest } from "../services/authService";
import Swal from "sweetalert2";

export default function TeacherRegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    name: "",
    email: "",
    department: "",
    designation: "",
    joiningDate: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await teacherRegisterRequest({
        username: form.username.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        department: form.department.trim(),
        designation: form.designation.trim(),
        joiningDate: form.joiningDate,
        password: form.password,
      });

      Swal.fire({
        title: "Registered!",
        text: "Teacher registered successfully. Please login.!",
        icon: "success",
      });

      navigate("/login");
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to register teacher");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Teacher Registration
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Create a teacher account for the BUBT Marks Portal.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">
              Account Details
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Use a unique username (Teacher ID) and a strong password.
            </p>
          </div>

          {error && (
            <div className="px-6 py-3 border-b border-red-100 bg-red-50 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="px-6 py-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Username (Teacher ID)
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={form.username}
                    onChange={handleChange}
                    required
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    placeholder="e.g. mmss.cse"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Use letters, numbers, dot (.) or underscore (_)
                  </p>
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Department
                  </label>
                  <input
                    type="text"
                    name="department"
                    value={form.department}
                    onChange={handleChange}
                    required
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    placeholder="CSE"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Designation
                  </label>
                  <input
                    type="text"
                    name="designation"
                    value={form.designation}
                    onChange={handleChange}
                    required
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    placeholder="Lecturer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Joining Date
                </label>
                <input
                  type="date"
                  name="joiningDate"
                  value={form.joiningDate}
                  onChange={handleChange}
                  required
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    required
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                           shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? "Registering..." : "Register as Teacher"}
              </button>

              <div className="text-center text-xs text-slate-500">
                Already registered?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Login here
                </button>
              </div>
            </form>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="mx-auto block text-xs px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-white"
        >
          ← Back to Login
        </button>
      </div>
    </div>
  );
}
