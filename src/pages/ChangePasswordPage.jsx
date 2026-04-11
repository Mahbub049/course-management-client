// client/src/pages/ChangePasswordPage.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  changePasswordRequest,
  updateProfileRequest,
} from "../services/authService";

function ChangePasswordPage() {
  const navigate = useNavigate();
  const role = localStorage.getItem("marksPortalRole");

  const [username, setUsername] = useState(
    localStorage.getItem("marksPortalUsername") || ""
  );
  const [displayName, setDisplayName] = useState(
    localStorage.getItem("marksPortalName") || ""
  );
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [profileImage, setProfileImage] = useState(
    localStorage.getItem("marksPortalProfileImage") || ""
  );
  const [profileImageBase64, setProfileImageBase64] = useState("");


  const handleProfileImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileError("Please select a valid image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileError("Please select an image smaller than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileImage(reader.result); // preview
      setProfileImageBase64(reader.result); // send to server
    };
    reader.readAsDataURL(file);
  };

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

    try {
      setProfileLoading(true);

      const data = await updateProfileRequest({
        username: username || undefined,
        name: displayName || undefined,
        profileImageBase64: profileImageBase64 || undefined,
      });

      setProfileSuccess("Profile updated successfully.");

      // ✅ update localStorage
      if (data.username) {
        localStorage.setItem("marksPortalUsername", data.username);
      }

      if (data.name) {
        localStorage.setItem("marksPortalName", data.name);
      }

      if (data.profileImage) {
        localStorage.setItem("marksPortalProfileImage", data.profileImage);
      }

      // 🔥 THIS LINE (very important)
      window.dispatchEvent(new Event("marksPortalProfileUpdated"));

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
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 sm:p-6 lg:p-7">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-600/20" />
        <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-600/20" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
              <SettingsIcon />
              Account Settings
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Manage Your Account
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Update your password securely. Teachers can also change username
              and display name from this page.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeftIcon />
            Back
          </button>
        </div>
      </section>

      {/* Cards */}
      <div
        className={`grid grid-cols-1 gap-5 ${role === "teacher" ? "xl:grid-cols-2" : ""
          }`}
      >
        {/* Change Password */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <LockIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Change Password
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Keep your account secure by updating your password regularly.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {error && (
              <AlertBox tone="danger" title="Action required" message={error} />
            )}
            {success && (
              <AlertBox tone="success" title="Success" message={success} />
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <Field label="Current Password">
                <input
                  type="password"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>

              <Field
                label="New Password"
                hint="Minimum 6 characters. Use a stronger password if possible."
              >
                <input
                  type="password"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>

              <Field label="Confirm New Password">
                <input
                  type="password"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <SpinnerIcon />
                      Saving...
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
        </section>

        {/* Teacher Account Details */}
        {role === "teacher" && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10">
                  <UserBadgeIcon />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Account Details
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Update your teacher username and display name.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Profile Picture
              </label>

              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="h-24 w-24 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="Profile preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                      No image
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProfileImageChange}
                    className="block w-full cursor-pointer text-sm text-slate-600 file:mr-4 file:cursor-pointer file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700 dark:text-slate-300"
                  />
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    JPG, PNG, WEBP supported. Keep image under 5MB.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {profileError && (
                <AlertBox
                  tone="danger"
                  title="Could not save"
                  message={profileError}
                />
              )}
              {profileSuccess && (
                <AlertBox
                  tone="success"
                  title="Saved"
                  message={profileSuccess}
                />
              )}

              <form onSubmit={handleProfileSave} className="mt-4 space-y-4">
                <Field
                  label="Teacher Username"
                  hint="This is the ID you use to log in as teacher."
                >
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. main_teacher"
                  />
                </Field>

                <Field label="Display Name (optional)">
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Mahbub Sarwar"
                  />
                </Field>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={profileLoading}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    {profileLoading ? (
                      <>
                        <SpinnerIcon />
                        Saving...
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

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Tip
                </div>
                <p className="mt-1 text-xs leading-6 text-slate-600 dark:text-slate-400">
                  If you change your display name, it will appear in the sidebar
                  and dashboard after refresh.
                </p>
              </div>
            </div>
          </section>
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
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function AlertBox({ tone = "danger", title, message }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300";

  return (
    <div className={`mb-3 rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 opacity-90">{message}</div>
    </div>
  );
}

/* ---------------- Icons ---------------- */

function SettingsIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 3l2.2 2.2 3-.4.8 2.9 2.7 1.4-1 2.8 1 2.8-2.7 1.4-.8 2.9-3-.4L12 21l-2.2-2.2-3 .4-.8-2.9-2.7-1.4 1-2.8-1-2.8 2.7-1.4.8-2.9 3 .4L12 3z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="h-5 w-5 text-indigo-700 dark:text-indigo-300"
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

function UserBadgeIcon() {
  return (
    <svg
      className="h-5 w-5 text-violet-700 dark:text-violet-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M18 8h4" />
      <path d="M20 6v4" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 6L9 17l-5-5" />
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