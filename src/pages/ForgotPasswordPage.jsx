import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  verifyPasswordResetOtp,
} from "../services/authService";

function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState("request");

  const [roll, setRoll] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearStatus = () => {
    setMessage("");
    setError("");
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    clearStatus();

    if (!roll.trim() || !fullName.trim() || !email.trim()) {
      setError("Please fill in roll, full name and email.");
      return;
    }

    try {
      setLoading(true);

      const data = await requestPasswordResetOtp({
        roll: roll.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
      });

      setMessage(data.message || "OTP sent successfully.");
      setStep("verify");
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message || "Failed to send OTP. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    clearStatus();

    if (!otp.trim()) {
      setError("Please enter the OTP.");
      return;
    }

    try {
      setLoading(true);

      const data = await verifyPasswordResetOtp({
        roll: roll.trim(),
        otp: otp.trim(),
      });

      setMessage(data.message || "OTP verified successfully.");
      setStep("reset");
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to verify OTP. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    clearStatus();

    if (!newPassword || !confirmNewPassword) {
      setError("Please fill in both password fields.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      setLoading(true);

      const data = await resetPasswordWithOtp({
        roll: roll.trim(),
        otp: otp.trim(),
        newPassword,
      });

      setMessage(data.message || "Password reset successful.");
      setStep("done");

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1500);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to reset password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
        <div className="absolute left-[-80px] top-[-80px] h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-600/20" />
        <div className="absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-600/20" />

        <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:p-7">
          <div className="mb-6 text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <img
                  className="h-12 w-12 object-contain"
                  src="/logo.png"
                  alt="BUBT"
                />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Forgot Password
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Reset student password using roll number, full name and email OTP.
            </p>
          </div>

          <StepIndicator step={step} />

          {error && (
            <AlertBox tone="danger" title="Action required" message={error} />
          )}

          {message && (
            <AlertBox tone="success" title="Success" message={message} />
          )}

          {step === "request" && (
            <form onSubmit={handleRequestOtp} className="mt-5 space-y-4">
              <Field label="Student Roll Number">
                <input
                  type="text"
                  value={roll}
                  onChange={(e) => setRoll(e.target.value)}
                  placeholder="Enter your roll number"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  required
                />
              </Field>

              <Field label="Full Name as Given in ID">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  required
                />
              </Field>

              <Field
                label="Email Address"
                hint="OTP will be sent to this email. After verification, this email will be saved with your account."
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  required
                />
              </Field>

              <SubmitButton loading={loading} text="Send OTP" loadingText="Sending OTP..." />
            </form>
          )}

          {step === "verify" && (
            <form onSubmit={handleVerifyOtp} className="mt-5 space-y-4">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                OTP has been sent to{" "}
                <span className="font-semibold">{email}</span>.
              </div>

              <Field label="Enter OTP">
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="Enter 6-digit OTP"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center text-lg font-bold tracking-[0.4em] text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  required
                />
              </Field>

              <SubmitButton loading={loading} text="Verify OTP" loadingText="Verifying..." />

              <button
                type="button"
                onClick={() => {
                  setStep("request");
                  clearStatus();
                }}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Change Information
              </button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
              <Field label="New Password">
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  show={showNewPassword}
                  setShow={setShowNewPassword}
                  placeholder="Enter new password"
                />
              </Field>

              <Field label="Confirm New Password">
                <PasswordInput
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  show={showConfirmPassword}
                  setShow={setShowConfirmPassword}
                  placeholder="Confirm new password"
                />
              </Field>

              <SubmitButton loading={loading} text="Reset Password" loadingText="Resetting..." />
            </form>
          )}

          {step === "done" && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              Password reset successful. Redirecting to login...
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;

function StepIndicator({ step }) {
  const steps = [
    { key: "request", label: "Info" },
    { key: "verify", label: "OTP" },
    { key: "reset", label: "Reset" },
  ];

  const activeIndex =
    step === "done" ? 3 : steps.findIndex((item) => item.key === step);

  return (
    <div className="mb-5 grid grid-cols-3 gap-2">
      {steps.map((item, index) => {
        const active = index <= activeIndex;

        return (
          <div
            key={item.key}
            className={`rounded-2xl border px-3 py-2 text-center text-xs font-semibold ${
              active
                ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {index + 1}. {item.label}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </label>

      {children}

      {hint ? (
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function PasswordInput({ value, onChange, show, setShow, placeholder }) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        required
      />

      <button
        type="button"
        onClick={() => setShow((prev) => !prev)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function SubmitButton({ loading, text, loadingText }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]"
    >
      {loading ? (
        <>
          <SpinnerIcon />
          {loadingText}
        </>
      ) : (
        text
      )}
    </button>
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