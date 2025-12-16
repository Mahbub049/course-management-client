// client/src/pages/LoginPage.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "../services/authService";

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await loginRequest(username, password);

      localStorage.setItem("marksPortalToken", data.token);
      localStorage.setItem("marksPortalRole", data.role);

      if (data.name) {
        localStorage.setItem("marksPortalName", data.name);
      }

      // ✅ ADD THIS (VERY IMPORTANT)
      if (data.username) {
        localStorage.setItem("marksPortalUsername", data.username);
      } else {
        localStorage.removeItem("marksPortalUsername");
      }

      if (data.role === "teacher") {
        navigate("/teacher/dashboard");
      } else if (data.role === "student") {
        navigate("/student/dashboard");
      } else {
        navigate("/login");
      }
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <img className="w-20 h-20 object-contain" src="/logo.png" alt="BUBT" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Course Management System
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in with your roll (student) or teacher ID.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Login</h2>
            <p className="mt-1 text-xs text-slate-500">
              First-time students: use the username & temporary password provided by your teacher.
            </p>
          </div>

          {error && (
            <div className="px-6 py-3 border-b border-rose-100 bg-rose-50 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="px-6 py-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-xs font-semibold text-slate-700">
                  Username (Roll / Teacher ID)
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                           shadow-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Logging in..." : "Login"}
              </button>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                After first login, you can change your password from the{" "}
                <span className="font-semibold">Change Password</span> page.
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-center text-slate-400">
          Developed by Mahbub Sarwar (MMSS, Lecturer, CSE, BUBT)
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
