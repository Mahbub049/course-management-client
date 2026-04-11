// client/src/pages/LoginPage.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginRequest } from "../services/authService";

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

      if (data.username) {
        localStorage.setItem("marksPortalUsername", data.username);
      } else {
        localStorage.removeItem("marksPortalUsername");
      }

      if (data.profileImage) {
        localStorage.setItem("marksPortalProfileImage", data.profileImage);
      } else {
        localStorage.removeItem("marksPortalProfileImage");
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="relative min-h-screen overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute left-[-80px] top-[-80px] h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-600/20" />
          <div className="absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-600/20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.10),transparent_35%)] dark:bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.16),transparent_35%)]" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 lg:grid-cols-2">
            {/* Left side branding */}
            {/* Left side branding (clean version) */}
            <div className="relative hidden lg:flex lg:flex-col lg:items-center lg:justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-sky-600 p-10 text-white">
              <div className="text-center">
                <div className="flex justify-center mb-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/20 backdrop-blur border border-white/30">
                    <img
                      className="h-12 w-12 object-contain"
                      src="/logo.png"
                      alt="BUBT"
                    />
                  </div>
                </div>

                <h2 className="text-2xl font-bold">
                  Course Management System
                </h2>

                <p className="mt-2 text-sm text-white/80">
                  Secure academic portal
                </p>
              </div>
            </div>

            {/* Right side form */}
            <div className="flex items-center justify-center p-5 sm:p-8 lg:p-10">
              <div className="w-full max-w-md">
                {/* Mobile logo/brand */}
                <div className="mb-8 text-center lg:hidden">
                  <div className="mb-4 flex justify-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <img
                        className="h-12 w-12 object-contain"
                        src="/logo.png"
                        alt="BUBT"
                      />
                    </div>
                  </div>

                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                    Course Management System
                  </h1>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Sign in with your roll or teacher ID.
                  </p>
                </div>

                <div className="mb-6 hidden lg:block">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <ShieldIcon />
                    Secure Login
                  </div>

                  <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Welcome back
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Enter your credentials to access your dashboard.
                  </p>
                </div>

                {error && (
                  <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                    <div className="font-semibold">Login failed</div>
                    <div className="mt-0.5">{error}</div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <Field
                    label="Username"
                    hint="Use your student roll or teacher ID"
                  >
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                        <UserIcon />
                      </span>
                      <input
                        type="text"
                        inputMode="text"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        placeholder="Enter your username"
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                      />
                    </div>
                  </Field>

                  <Field label="Password">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                        <LockIcon />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="Enter your password"
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-12 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </Field>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
                  >
                    {loading ? (
                      <>
                        <SpinnerIcon />
                        Logging in...
                      </>
                    ) : (
                      <>
                        <ArrowRightIcon />
                        Login to Dashboard
                      </>
                    )}
                  </button>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      First-time login:
                    </span>{" "}
                    students should use the temporary username and password
                    provided by the teacher. After logging in, change your
                    password from the <span className="font-semibold">Change Password</span> page.
                  </div>
                </form>

                <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
                  Developed by Mahbub Sarwar (MMSS, Lecturer, CSE, BUBT)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

/* ---------------- Small UI Components ---------------- */

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function FeatureItem({ title, text }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm leading-6 text-white/80">{text}</div>
    </div>
  );
}

/* ---------------- Icons ---------------- */

function ShieldIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      <path d="M5 11h14v10H5z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.77 21.77 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.8 21.8 0 0 1-3.17 4.19" />
      <path d="M1 1l22 22" />
      <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
      />
    </svg>
  );
}