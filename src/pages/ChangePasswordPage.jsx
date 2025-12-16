// client/src/pages/ChangePasswordPage.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePasswordRequest, updateProfileRequest } from "../services/authService";

function ChangePasswordPage() {
  const navigate = useNavigate();
  const role = localStorage.getItem("marksPortalRole");

  // profile state
  const [username, setUsername] = useState(
    localStorage.getItem("marksPortalUsername") || ""
  );
  const [displayName, setDisplayName] = useState(
    localStorage.getItem("marksPortalName") || ""
  );
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (newPassword.length < 6) {
      setError("New password should be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      setLoading(true);
      await changePasswordRequest(currentPassword, newPassword);
      setSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        "Failed to change password. Please check your current password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!username && !displayName) {
      setProfileError("Please enter at least a username or name to update.");
      return;
    }

    try {
      setProfileLoading(true);

      const data = await updateProfileRequest({
        username: username || undefined,
        name: displayName || undefined,
      });

      setProfileSuccess("Profile updated successfully.");

      if (data.username) localStorage.setItem("marksPortalUsername", data.username);
      if (data.name) localStorage.setItem("marksPortalName", data.name);
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || "Failed to update profile.";
      setProfileError(msg);
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Account Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Update your password securely. Teachers can also update username and display name.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeftIcon />
            Back
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Change Password Card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
              <LockIcon />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
              <p className="text-xs text-slate-500">
                Keep your account secure by updating your password regularly.
              </p>
            </div>
          </div>

          <div className="p-6">
            {error && (
              <AlertBox tone="danger" title="Action required" message={error} />
            )}
            {success && (
              <AlertBox tone="success" title="Success" message={success} />
            )}

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <Field label="Current Password">
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>

              <Field label="New Password" hint="Minimum 6 characters. Use a strong password if possible.">
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>

              <Field label="Confirm New Password">
                <input
                  type="password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <SpinnerIcon />
                      Saving…
                    </>
                  ) : (
                    <>
                      <CheckIcon />
                      Update Password
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Teacher Account Details */}
        {role === "teacher" && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100">
                <UserBadgeIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Account Details</h2>
                <p className="text-xs text-slate-500">
                  Update your teacher username and display name.
                </p>
              </div>
            </div>

            <div className="p-6">
              {profileError && (
                <AlertBox tone="danger" title="Could not save" message={profileError} />
              )}
              {profileSuccess && (
                <AlertBox tone="success" title="Saved" message={profileSuccess} />
              )}

              <form onSubmit={handleProfileSave} className="space-y-4 mt-4">
                <Field label="Teacher Username" hint="This is the ID you use to login as teacher.">
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. main_teacher"
                  />
                </Field>

                <Field label="Display Name (optional)">
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Mahbub Sarwar"
                  />
                </Field>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={profileLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileLoading ? (
                      <>
                        <SpinnerIcon />
                        Saving…
                      </>
                    ) : (
                      <>
                        <CheckIcon />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-700">Tip</div>
                <p className="mt-1 text-xs text-slate-600">
                  If you change your display name, it will reflect in the sidebar and dashboard after refresh.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChangePasswordPage;

/* ---------------- Small UI Helpers ---------------- */

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function AlertBox({ tone = "danger", title, message }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-sm opacity-90">{message}</div>
    </div>
  );
}

/* ---------------- Icons (inline SVG) ---------------- */

function LockIcon() {
  return (
    <svg className="h-5 w-5 text-indigo-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 11V8a5 5 0 0 1 10 0v3" />
      <path d="M5 11h14v10H5z" />
    </svg>
  );
}

function UserBadgeIcon() {
  return (
    <svg className="h-5 w-5 text-purple-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M18 8h4" />
      <path d="M20 6v4" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
      />
    </svg>
  );
}
