import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { notificationService } from "../services/notificationService";
import { initializePushNotifications } from "../services/pushNotificationService";
import {
  getNativeNotificationDiagnostics,
  isNativeMobileApp,
  requestExactAlarmAccess,
  scheduleOneMinuteTestNotification,
  sendImmediateTestNotification,
  syncMobileNotifications,
} from "../services/mobileNotificationService";
import { loadPortalNotificationItems } from "../utils/notificationItems";
import { getAuthItem } from "../utils/authStorage";

const CATEGORY_OPTIONS = [
  { key: "tasks", label: "Tasks", description: "Your personal teacher-created tasks." },
  { key: "submissions", label: "Submissions", description: "Assessment and project deadlines." },
  { key: "exams", label: "Exams", description: "Upcoming exam reminders." },
  { key: "events", label: "Events", description: "Teacher calendar events and meetings." },
  {
    key: "academicCalendar",
    label: "Academic Calendar",
    description: "Important official BUBT dates shown on the dashboard/calendar.",
  },
];

const REMINDER_OPTIONS = [
  { value: 1440, label: "1 day before" },
  { value: 360, label: "6 hours before" },
  { value: 180, label: "3 hours before" },
  { value: 60, label: "1 hour before" },
  { value: 30, label: "30 minutes before" },
];

function formatDue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationSettingsPage() {
  const role = getAuthItem("marksPortalRole");
  const native = isNativeMobileApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState({
    permission: native ? "unknown" : "web",
    systemEnabled: !native,
    exactAlarm: native ? "unknown" : "not-required",
    pendingCount: 0,
    nextScheduledAt: null,
  });
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [pushRegistration, setPushRegistration] = useState(null);

  const states = useMemo(
    () => new Map((profile?.states || []).map((state) => [state.sourceKey, Boolean(state.completed)])),
    [profile?.states]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profileData = await notificationService.getProfile();
      const prefs = profileData?.preferences || {};
      const notificationItems = await loadPortalNotificationItems({
        role,
        scheduleWindowDays: prefs.scheduleWindowDays || 7,
      });
      setProfile(profileData);
      setItems(notificationItems);
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Could not load notifications",
        text: error?.response?.data?.message || "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [role]);

  const refreshDeviceStatus = useCallback(async () => {
    if (!native) return;
    try {
      const diagnostics = await getNativeNotificationDiagnostics();
      setDeviceStatus(diagnostics);
    } catch (error) {
      console.error("Could not read notification diagnostics", error);
    }
  }, [native]);

  useEffect(() => {
    load();
    refreshDeviceStatus();
  }, [load, refreshDeviceStatus]);

  useEffect(() => {
    if (!native) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshDeviceStatus();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [native, refreshDeviceStatus]);

  const savePreferences = async (nextPreferences) => {
    setSaving(true);
    try {
      const response = await notificationService.updatePreferences(nextPreferences);
      setProfile((current) => ({
        ...(current || {}),
        preferences: response.preferences,
      }));
      if (native) {
        await syncMobileNotifications();
        await refreshDeviceStatus();
      }
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Could not save settings",
        text: error?.response?.data?.message || "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const patchPreferences = (patch) => {
    const current = profile?.preferences || {};
    savePreferences({
      enabled: current.enabled !== false,
      categories: current.categories || {},
      reminderOffsetsMinutes: current.reminderOffsetsMinutes || [1440, 180, 60],
      scheduleWindowDays: current.scheduleWindowDays || 7,
      ...patch,
    });
  };

  const toggleCategory = (key) => {
    const current = profile?.preferences || {};
    patchPreferences({
      categories: {
        ...(current.categories || {}),
        [key]: current.categories?.[key] === false,
      },
    });
  };

  const toggleReminderOffset = (value) => {
    const current = profile?.preferences?.reminderOffsetsMinutes || [1440, 180, 60];
    const has = current.includes(value);
    let next = has ? current.filter((item) => item !== value) : [...current, value];
    if (!next.length) next = [60];
    next.sort((a, b) => b - a);
    patchPreferences({ reminderOffsetsMinutes: next });
  };

  const toggleDone = async (item) => {
    const completed = states.get(item.sourceKey) === true;
    try {
      const response = await notificationService.setReminderState(item.sourceKey, !completed);
      setProfile((current) => {
        const currentStates = current?.states || [];
        const filtered = currentStates.filter((state) => state.sourceKey !== item.sourceKey);
        return {
          ...(current || {}),
          states: [response.state, ...filtered],
        };
      });
      if (native) await syncMobileNotifications();
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Could not update reminder",
        text: error?.response?.data?.message || "Please try again.",
      });
    }
  };

  const registerPhoneForServerPush = async ({ quiet = false } = {}) => {
    if (!native) return null;
    try {
      const result = await initializePushNotifications({ force: true });
      setPushRegistration(result);
      if (result?.tokenSaved) {
        await load();
        if (!quiet) {
          await Swal.fire({
            icon: "success",
            title: "Phone registered",
            text: "This phone is now connected to server push notifications.",
          });
        }
        return result;
      }

      if (!quiet) {
        const reasonText =
          result?.reason === "registration-timeout"
            ? "FCM did not return a registration identifier. Check that google-services.json belongs to com.bubt.marksportal, rebuild the Android app, and make sure Google Play services and internet access are available."
            : result?.reason === "server-save-failed"
              ? "The phone received an FCM registration identifier, but the Marks Portal server could not save it. Check the server/API connection and try again."
              : result?.reason === "native-registration-error" || result?.reason === "register-call-failed"
                ? `Android/Firebase registration failed${result?.errorMessage ? `: ${result.errorMessage}` : "."} Verify the Firebase Android configuration and rebuild the app.`
                : result?.permission !== "granted"
                  ? "Android notification permission is not granted."
                  : "FCM could not register this installation. Rebuild the app after verifying google-services.json and try again.";
        await Swal.fire({
          icon: "warning",
          title: "Phone is not registered for server push",
          text: reasonText,
        });
      }
      return result;
    } catch (error) {
      console.error("Could not register phone for server push", error);
      if (!quiet) {
        await Swal.fire({
          icon: "error",
          title: "Server push registration failed",
          text: error?.message || "The phone could not register with Firebase Cloud Messaging.",
        });
      }
      return { registered: false, tokenSaved: false, reason: "exception", error };
    }
  };

  const enablePhoneNotifications = async () => {
    setDeviceBusy(true);
    try {
      const result = await syncMobileNotifications({ requestPermission: true });
      await refreshDeviceStatus();
      const pushResult = await registerPhoneForServerPush({ quiet: true });

      if (result?.permission !== "granted" || result?.systemEnabled === false) {
        await Swal.fire({
          icon: "warning",
          title: "Notification permission is off",
          text: "Allow notifications for BUBT Portal in Android settings, then return here.",
        });
        return;
      }

      await Swal.fire({
        icon: result?.exactAlarm === "granted" ? "success" : "info",
        title: "Phone notifications enabled",
        text: `${result.scheduled || 0} reminders are scheduled on this phone.${
          result?.exactAlarm === "granted"
            ? " Exact timing is enabled."
            : " Exact alarm access is still needed for precise reminder times."
        }${pushResult?.tokenSaved ? " Server push is connected." : " Server push still needs registration."}`,
      });
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Notification setup failed",
        text: error?.message || "The phone could not schedule notifications.",
      });
    } finally {
      setDeviceBusy(false);
    }
  };

  const allowExactAlarms = async () => {
    setDeviceBusy(true);
    try {
      const result = await requestExactAlarmAccess();
      setDeviceStatus((current) => ({
        ...current,
        exactAlarm: result?.exactAlarm || current.exactAlarm,
      }));
      // Android may restart the activity after the user changes this setting.
      setTimeout(() => refreshDeviceStatus(), 800);
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Could not open exact alarm settings",
        text: error?.message || "Please try again.",
      });
    } finally {
      setDeviceBusy(false);
    }
  };

  const resyncPhone = async () => {
    setDeviceBusy(true);
    try {
      const result = await syncMobileNotifications({ requestPermission: true });
      await refreshDeviceStatus();
      Swal.fire({
        icon: "success",
        title: "Reminders synchronized",
        text: `${result?.scheduled || 0} upcoming reminders are scheduled on this phone.`,
      });
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Could not synchronize reminders",
        text: error?.message || "Please try again.",
      });
    } finally {
      setDeviceBusy(false);
    }
  };

  const sendTestNow = async () => {
    setDeviceBusy(true);
    try {
      const result = await sendImmediateTestNotification();
      await refreshDeviceStatus();
      if (!result?.sent) {
        Swal.fire({
          icon: "warning",
          title: "Test notification could not be sent",
          text: "Please enable Android notification permission first.",
        });
      }
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Test failed",
        text: error?.message || "The phone could not display a test notification.",
      });
    } finally {
      setDeviceBusy(false);
    }
  };

  const sendServerPushTest = async () => {
    setDeviceBusy(true);
    try {
      // Always refresh FCM registration first. This makes the test self-healing
      // after app reinstall, token rotation, a previous timeout, or a temporary
      // failure while saving the token to the server.
      const registration = await registerPhoneForServerPush({ quiet: true });
      if (!registration?.tokenSaved) {
        const reasonText =
          registration?.reason === "registration-timeout"
            ? "Firebase did not return a registration identifier within 15 seconds. Verify google-services.json for com.bubt.marksportal and rebuild the app."
            : registration?.reason === "server-save-failed"
              ? "Firebase registered the phone, but the portal server could not save this phone. Check the API/server deployment."
              : registration?.permission !== "granted"
                ? "Android notification permission is not granted."
                : "This installation could not register with Firebase Cloud Messaging.";
        await Swal.fire({
          icon: "error",
          title: "Phone registration failed",
          text: reasonText,
        });
        return;
      }

      const response = await notificationService.sendServerPushTest();
      await load();
      if (response?.success) {
        Swal.fire({
          icon: "success",
          title: "Server push sent",
          text: "You should receive an FCM notification even if the app is not kept in the background.",
        });
      } else {
        Swal.fire({
          icon: "warning",
          title: "Server push was not delivered",
          text: response?.message || "Please check the Firebase push setup.",
        });
      }
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Server push test failed",
        text:
          error?.response?.data?.message ||
          "The server could not send an FCM notification to this phone.",
      });
    } finally {
      setDeviceBusy(false);
    }
  };

  const scheduleOneMinuteTest = async () => {
    setDeviceBusy(true);
    try {
      const result = await scheduleOneMinuteTestNotification();
      await refreshDeviceStatus();
      if (result?.scheduled) {
        Swal.fire({
          icon: "success",
          title: "1-minute test scheduled",
          text: `Lock the phone or leave the app. The test should arrive at ${new Date(
            result.at
          ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}.`,
        });
      } else {
        Swal.fire({
          icon: "warning",
          title: "Could not schedule the test",
          text: "Please enable notification permission first.",
        });
      }
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Scheduled test failed",
        text: error?.message || "The phone could not schedule the test notification.",
      });
    } finally {
      setDeviceBusy(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Loading notification settings…
      </div>
    );
  }

  const preferences = profile.preferences || {};
  const offsets = preferences.reminderOffsetsMinutes || [1440, 180, 60];

  return (
    <div className="space-y-5 pb-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200/80 bg-gradient-to-r from-violet-50 via-white to-sky-50 px-5 py-5 dark:border-slate-800 dark:from-violet-500/10 dark:via-slate-900 dark:to-sky-500/10 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300">
                <BellIcon />
                Phone reminders
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                Notifications
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Upcoming portal items are synchronized with the mobile app. “Done” is a personal reminder state only; it never submits work or changes an official academic event.
              </p>
            </div>

            {native ? (
              deviceStatus.permission === "granted" && deviceStatus.systemEnabled ? (
                <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  ✓ Phone enabled
                </span>
              ) : (
                <button
                  type="button"
                  onClick={enablePhoneNotifications}
                  disabled={deviceBusy}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-violet-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
                >
                  Enable on this phone
                </button>
              )
            ) : (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Web portal
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3">
            <SettingToggle
              label="Notifications enabled"
              description="Master switch for scheduled phone reminders."
              checked={preferences.enabled !== false}
              disabled={saving}
              onChange={() => patchPreferences({ enabled: preferences.enabled === false })}
            />

            {CATEGORY_OPTIONS.map((option) => (
              <SettingToggle
                key={option.key}
                label={option.label}
                description={option.description}
                checked={preferences.categories?.[option.key] !== false}
                disabled={saving || preferences.enabled === false}
                onChange={() => toggleCategory(option.key)}
              />
            ))}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/45 sm:p-5">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Reminder timing</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Choose when the phone should notify you before an item starts or becomes due.
            </p>

            <div className="mt-4 space-y-2">
              {REMINDER_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={offsets.includes(option.value)}
                    disabled={saving || preferences.enabled === false}
                    onChange={() => toggleReminderOffset(option.value)}
                    className="h-4 w-4 accent-violet-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>

            {native ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <DeviceStatusRow
                      label="Android notification permission"
                      value={deviceStatus.permission === "granted" && deviceStatus.systemEnabled ? "Granted" : "Needs permission"}
                      good={deviceStatus.permission === "granted" && deviceStatus.systemEnabled}
                    />
                    <DeviceStatusRow
                      label="Exact alarm timing"
                      value={deviceStatus.exactAlarm === "granted" ? "Granted" : "Needs permission"}
                      good={deviceStatus.exactAlarm === "granted" || deviceStatus.exactAlarm === "not-required"}
                    />
                    <DeviceStatusRow
                      label="Server push (FCM)"
                      value={
                        profile?.serverPushEnabled !== true
                          ? "Server not configured"
                          : Array.isArray(preferences.deviceTokens) &&
                              preferences.deviceTokens.some((device) =>
                                ["android", "ios"].includes(String(device?.platform || ""))
                              )
                            ? "Connected"
                            : pushRegistration?.reason === "registration-timeout"
                              ? "Registration timed out"
                              : pushRegistration?.reason === "server-save-failed"
                                ? "Could not save phone"
                                : "Not registered"
                      }
                      good={
                        profile?.serverPushEnabled === true &&
                        Array.isArray(preferences.deviceTokens) &&
                        preferences.deviceTokens.some((device) =>
                          ["android", "ios"].includes(String(device?.platform || ""))
                        )
                      }
                    />
                    <DeviceStatusRow
                      label="Scheduled on this phone"
                      value={String(deviceStatus.pendingCount || 0)}
                      good={(deviceStatus.pendingCount || 0) > 0}
                    />
                    <DeviceStatusRow
                      label="Next phone reminder"
                      value={
                        deviceStatus.nextScheduledAt
                          ? new Date(deviceStatus.nextScheduledAt).toLocaleString([], {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "None scheduled"
                      }
                      good={Boolean(deviceStatus.nextScheduledAt)}
                    />
                  </div>
                </div>

                {deviceStatus.exactAlarm !== "granted" && deviceStatus.exactAlarm !== "not-required" ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    Android exact-alarm access is required for reminders to arrive close to the selected minute, including while the phone is idle.
                    <button
                      type="button"
                      onClick={allowExactAlarms}
                      disabled={deviceBusy}
                      className="mt-2 block font-black underline underline-offset-2 disabled:opacity-60"
                    >
                      Allow exact alarms
                    </button>
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={sendTestNow}
                    disabled={deviceBusy}
                    className="min-h-10 rounded-xl bg-violet-600 px-3 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    Send test notification now
                  </button>
                  <button
                    type="button"
                    onClick={scheduleOneMinuteTest}
                    disabled={deviceBusy}
                    className="min-h-10 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-700 hover:bg-violet-100 disabled:opacity-60 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
                  >
                    Schedule 1-minute test
                  </button>
                  <button
                    type="button"
                    onClick={() => registerPhoneForServerPush()}
                    disabled={deviceBusy || profile?.serverPushEnabled !== true}
                    className="min-h-10 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-700 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                  >
                    Register this phone for server push
                  </button>
                  <button
                    type="button"
                    onClick={sendServerPushTest}
                    disabled={deviceBusy || profile?.serverPushEnabled !== true}
                    className="min-h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    Test server push (FCM)
                  </button>
                  <button
                    type="button"
                    onClick={resyncPhone}
                    disabled={deviceBusy}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    Resync phone reminders
                  </button>
                  <button
                    type="button"
                    onClick={refreshDeviceStatus}
                    disabled={deviceBusy}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    Refresh device status
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Upcoming reminder checklist</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              These are the same upcoming sources used to schedule the mobile notifications.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300">
            {items.length} items
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No upcoming notification items were found.
            </div>
          ) : (
            items.map((item) => {
              const completed = states.get(item.sourceKey) === true;
              return (
                <div
                  key={item.sourceKey}
                  className={`flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center ${
                    completed
                      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => item.canMarkDone && toggleDone(item)}
                    disabled={!item.canMarkDone}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-sm font-black transition ${
                      completed
                        ? "border-emerald-300 bg-emerald-600 text-white"
                        : item.canMarkDone
                          ? "border-slate-300 bg-white text-transparent hover:border-violet-400 dark:border-slate-600 dark:bg-slate-800"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-600"
                    }`}
                    aria-label={completed ? "Mark as not done" : "Mark as done"}
                    title={item.canMarkDone ? (completed ? "Mark as not done" : "Mark as done") : "Informational reminder"}
                  >
                    ✓
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`text-sm font-bold ${completed ? "text-slate-500 line-through dark:text-slate-400" : "text-slate-900 dark:text-white"}`}>
                        {item.title}
                      </div>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        {item.category}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.body}</div>
                  </div>

                  <div className="shrink-0 text-xs font-bold text-slate-600 dark:text-slate-300">
                    {formatDue(item.dueAt)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}


function DeviceStatusRow({ label, value, good }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-bold ${good ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}>
        {value}
      </div>
    </div>
  );
}

function SettingToggle({ label, description, checked, disabled, onChange }) {
  return (
    <label className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900 ${disabled ? "opacity-55" : "cursor-pointer"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-900 dark:text-white">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
      </div>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-violet-600 dark:bg-slate-700">
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? "left-6" : "left-1"}`} />
      </span>
    </label>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path strokeLinecap="round" d="M10 21h4" />
    </svg>
  );
}
