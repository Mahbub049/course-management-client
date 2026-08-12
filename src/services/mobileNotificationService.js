import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { notificationService } from "./notificationService";
import { loadPortalNotificationItems } from "../utils/notificationItems";
import { getAuthItem } from "../utils/authStorage";

const CHANNEL_ID = "bubt-portal-reminders-v3";
const ACTION_PENDING = "MARKS_PORTAL_PENDING";
const ACTION_INFO = "MARKS_PORTAL_INFO";
const ACTION_DONE = "MARKS_PORTAL_DONE";
const SMALL_ICON = "ic_stat_bubt";
const LARGE_ICON = "ic_bubt_logo";
const ICON_COLOR = "#4F46E5";
const MISSED_REMINDER_GRACE_MS = 2 * 60_000;
const MIN_SCHEDULE_LEAD_MS = 2_000;

let nativeSetupPromise = null;
let actionListenerHandle = null;

function isNative() {
  return Capacitor.isNativePlatform();
}

function isAndroid() {
  return Capacitor.getPlatform() === "android";
}

function hashToNotificationId(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash || 1) % 2147483000;
}

function stateMap(states = []) {
  return new Map((states || []).map((item) => [item.sourceKey, Boolean(item.completed)]));
}

function reminderLabel(offsetMinutes) {
  if (offsetMinutes >= 1440 && offsetMinutes % 1440 === 0) {
    const days = offsetMinutes / 1440;
    return days === 1 ? "tomorrow" : `in ${days} days`;
  }
  if (offsetMinutes >= 60 && offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return hours === 1 ? "in 1 hour" : `in ${hours} hours`;
  }
  return `in ${offsetMinutes} minutes`;
}

function dispatchNavigation(route) {
  if (!route || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("marksPortalNotificationNavigate", { detail: { route } })
  );
}

function requestResync() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("marksPortalNotificationsChanged"));
}

function commonNotificationFields() {
  return {
    channelId: CHANNEL_ID,
    smallIcon: SMALL_ICON,
    largeIcon: LARGE_ICON,
    iconColor: ICON_COLOR,
    autoCancel: true,
  };
}

function notificationBelongsToPortal(item) {
  return item?.extra?.marksPortal === true;
}

function notificationTime(item) {
  const value = item?.schedule?.at;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getExactAlarmStatus() {
  if (!isNative() || !isAndroid()) return "not-required";
  try {
    const result = await LocalNotifications.checkExactNotificationSetting();
    return result?.exact_alarm || "unknown";
  } catch (error) {
    console.warn("Could not check exact alarm setting", error);
    return "unknown";
  }
}

async function cancelForSourceKey(sourceKey) {
  const pending = await LocalNotifications.getPending();
  const matches = (pending.notifications || []).filter(
    (item) => notificationBelongsToPortal(item) && item.extra?.sourceKey === sourceKey
  );
  if (matches.length) {
    await LocalNotifications.cancel({
      notifications: matches.map((item) => ({ id: item.id })),
    });
  }
}

async function showUndoNotification(extra = {}) {
  const id = hashToNotificationId(`done:${extra.sourceKey}:${Date.now()}`);
  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: "Marked as done",
        body: extra.title || "Reminder completed",
        ...commonNotificationFields(),
        actionTypeId: ACTION_DONE,
        extra: {
          ...extra,
          marksPortal: true,
          completedConfirmation: true,
        },
      },
    ],
  });
}

async function handleNotificationAction(action) {
  const actionId = action?.actionId;
  const extra = action?.notification?.extra || {};
  const sourceKey = extra.sourceKey;

  try {
    if (actionId === "MARK_DONE" && sourceKey) {
      await notificationService.setReminderState(sourceKey, true);
      await cancelForSourceKey(sourceKey);
      await showUndoNotification(extra);
      requestResync();
      return;
    }

    if (actionId === "UNDO_DONE" && sourceKey) {
      await notificationService.setReminderState(sourceKey, false);
      requestResync();
      dispatchNavigation(extra.route || "/notifications");
      return;
    }

    dispatchNavigation(extra.route || "/notifications");
  } catch (error) {
    console.error("Notification action failed", error);
    dispatchNavigation(extra.route || "/notifications");
  }
}

export async function ensureNativeNotificationSetup({ requestPermission = false } = {}) {
  if (!isNative()) {
    return {
      native: false,
      permission: "unsupported",
      systemEnabled: false,
      exactAlarm: "not-required",
    };
  }

  if (!nativeSetupPromise) {
    nativeSetupPromise = (async () => {
      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: ACTION_PENDING,
            actions: [
              { id: "MARK_DONE", title: "✓ Done" },
              { id: "OPEN_ITEM", title: "Open" },
            ],
          },
          {
            id: ACTION_INFO,
            actions: [{ id: "OPEN_ITEM", title: "Open" }],
          },
          {
            id: ACTION_DONE,
            actions: [
              { id: "UNDO_DONE", title: "Undo" },
              { id: "OPEN_ITEM", title: "Open" },
            ],
          },
        ],
      });

      try {
        await LocalNotifications.createChannel({
          id: CHANNEL_ID,
          name: "BUBT Portal reminders",
          description: "Deadlines, tasks, exams and important BUBT portal dates",
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: "#4F46E5",
        });
      } catch (error) {
        console.debug("Notification channel already exists or is unavailable", error);
      }

      if (!actionListenerHandle) {
        actionListenerHandle = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          handleNotificationAction
        );
      }

      return true;
    })();
  }

  await nativeSetupPromise;

  let permissions = await LocalNotifications.checkPermissions();
  if (requestPermission && permissions.display !== "granted") {
    permissions = await LocalNotifications.requestPermissions();
  }

  let systemEnabled = false;
  try {
    const enabled = await LocalNotifications.areEnabled();
    systemEnabled = enabled?.value === true;
  } catch (error) {
    console.debug("Could not query notification system state", error);
    systemEnabled = permissions.display === "granted";
  }

  return {
    native: true,
    permission: permissions.display,
    systemEnabled,
    exactAlarm: await getExactAlarmStatus(),
  };
}

export async function requestExactAlarmAccess() {
  if (!isNative() || !isAndroid()) {
    return { native: isNative(), exactAlarm: "not-required" };
  }

  await ensureNativeNotificationSetup();
  const before = await getExactAlarmStatus();
  if (before === "granted") return { native: true, exactAlarm: before };

  const result = await LocalNotifications.changeExactNotificationSetting();
  return {
    native: true,
    exactAlarm: result?.exact_alarm || (await getExactAlarmStatus()),
  };
}

export async function getNativeNotificationDiagnostics() {
  if (!isNative()) {
    return {
      native: false,
      permission: "unsupported",
      systemEnabled: false,
      exactAlarm: "not-required",
      pendingCount: 0,
      nextScheduledAt: null,
    };
  }

  const setup = await ensureNativeNotificationSetup();
  const pending = await LocalNotifications.getPending();
  const ours = (pending.notifications || []).filter(notificationBelongsToPortal);
  const scheduled = ours
    .map((item) => notificationTime(item))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    native: true,
    permission: setup.permission,
    systemEnabled: setup.systemEnabled,
    exactAlarm: setup.exactAlarm,
    pendingCount: ours.length,
    nextScheduledAt: scheduled[0]?.toISOString() || null,
  };
}

export async function sendImmediateTestNotification() {
  if (!isNative()) return { native: false };

  const setup = await ensureNativeNotificationSetup({ requestPermission: true });
  if (setup.permission !== "granted" || setup.systemEnabled === false) {
    return {
      native: true,
      sent: false,
      permission: setup.permission,
      systemEnabled: setup.systemEnabled,
      exactAlarm: setup.exactAlarm,
    };
  }

  const id = hashToNotificationId(`test-now:${Date.now()}`);
  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: "BUBT Portal",
        body: "Test notification successful. Phone notifications are working.",
        ...commonNotificationFields(),
        actionTypeId: ACTION_INFO,
        extra: {
          marksPortal: true,
          testNotification: true,
          route: "/notifications",
          title: "Test notification",
          category: "test",
        },
      },
    ],
  });

  return {
    native: true,
    sent: true,
    permission: setup.permission,
    systemEnabled: setup.systemEnabled,
    exactAlarm: setup.exactAlarm,
  };
}

export async function scheduleOneMinuteTestNotification() {
  if (!isNative()) return { native: false };

  const setup = await ensureNativeNotificationSetup({ requestPermission: true });
  if (setup.permission !== "granted" || setup.systemEnabled === false) {
    return {
      native: true,
      scheduled: false,
      permission: setup.permission,
      systemEnabled: setup.systemEnabled,
      exactAlarm: setup.exactAlarm,
    };
  }

  const at = new Date(Date.now() + 60_000);
  const id = hashToNotificationId(`test-one-minute:${Date.now()}`);
  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: "Scheduled test",
        body: "This notification was scheduled one minute ago by BUBT Portal.",
        ...commonNotificationFields(),
        actionTypeId: ACTION_INFO,
        schedule: { at, allowWhileIdle: true },
        extra: {
          marksPortal: true,
          testNotification: true,
          route: "/notifications",
          title: "Scheduled test",
          category: "test",
        },
      },
    ],
  });

  return {
    native: true,
    scheduled: true,
    at: at.toISOString(),
    permission: setup.permission,
    systemEnabled: setup.systemEnabled,
    exactAlarm: setup.exactAlarm,
  };
}

export async function showForegroundPushNotification(pushNotification = {}) {
  if (!isNative()) return { native: false };

  const title = String(pushNotification?.title || "BUBT Portal");
  const body = String(
    pushNotification?.body || pushNotification?.data?.body || "You have a new portal notification."
  );
  const data = pushNotification?.data || {};
  const id = hashToNotificationId(
    `push:${data.eventId || data.sourceKey || title}:${Date.now()}`
  );

  await ensureNativeNotificationSetup();
  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title,
        body,
        ...commonNotificationFields(),
        actionTypeId: ACTION_INFO,
        extra: {
          marksPortal: true,
          remotePush: true,
          route: data.route || "/academic-calendar",
          sourceKey: data.sourceKey || "",
          title,
          category: data.eventType || data.category || "event",
        },
      },
    ],
  });

  return { native: true, displayed: true };
}

export async function syncMobileNotifications({ requestPermission = false } = {}) {
  if (!isNative()) return { native: false, scheduled: 0 };
  if (!getAuthItem("marksPortalToken")) return { native: true, scheduled: 0 };

  const setup = await ensureNativeNotificationSetup({ requestPermission });
  if (setup.permission !== "granted" || setup.systemEnabled === false) {
    return {
      native: true,
      scheduled: 0,
      permission: setup.permission,
      systemEnabled: setup.systemEnabled,
      exactAlarm: setup.exactAlarm,
    };
  }

  const role = getAuthItem("marksPortalRole");
  const profileData = await notificationService.getProfile();
  const preferences = profileData?.preferences || {};

  if (preferences.enabled === false) {
    const pending = await LocalNotifications.getPending();
    const ours = (pending.notifications || []).filter(notificationBelongsToPortal);
    if (ours.length) {
      await LocalNotifications.cancel({
        notifications: ours.map((item) => ({ id: item.id })),
      });
    }
    return {
      native: true,
      scheduled: 0,
      permission: setup.permission,
      systemEnabled: setup.systemEnabled,
      exactAlarm: setup.exactAlarm,
    };
  }

  const items = await loadPortalNotificationItems({
    role,
    scheduleWindowDays: preferences.scheduleWindowDays || 7,
  });
  const completed = stateMap(profileData?.states || []);
  const categories = preferences.categories || {};
  const hasNativePushDevice = Array.isArray(preferences.deviceTokens)
    ? preferences.deviceTokens.some((device) =>
        ["android", "ios"].includes(String(device?.platform || ""))
      )
    : false;
  const useServerFacultyPush =
    profileData?.serverPushEnabled === true && hasNativePushDevice;
  const offsets = Array.isArray(preferences.reminderOffsetsMinutes)
    ? preferences.reminderOffsetsMinutes
    : [1440, 180, 60];

  const pending = await LocalNotifications.getPending();
  const ours = (pending.notifications || []).filter(notificationBelongsToPortal);
  if (ours.length) {
    await LocalNotifications.cancel({
      notifications: ours.map((item) => ({ id: item.id })),
    });
  }

  const now = Date.now();
  const notifications = [];

  for (const item of items) {
    // Faculty calendar reminders are sent by the server through FCM when push
    // is configured. Skipping them locally prevents duplicate reminders while
    // still leaving local scheduling as a fallback before FCM is configured.
    if (useServerFacultyPush && item.source === "faculty") continue;
    if (categories[item.category] === false) continue;
    if (completed.get(item.sourceKey) === true) continue;

    const dueTime = new Date(item.dueAt).getTime();
    if (!Number.isFinite(dueTime) || dueTime <= now) continue;

    for (const offsetMinutes of offsets) {
      const desiredAt = dueTime - Number(offsetMinutes) * 60_000;
      if (!Number.isFinite(desiredAt)) continue;

      // A newly-created/updated calendar item can finish saving a few seconds
      // after its exact reminder boundary. In that small window, deliver the
      // reminder immediately instead of silently dropping it. Older missed
      // reminders remain skipped so opening the app does not create a flood.
      let scheduleAt = desiredAt;
      if (desiredAt <= now + MIN_SCHEDULE_LEAD_MS) {
        const missedBy = now - desiredAt;
        if (missedBy < 0 || missedBy > MISSED_REMINDER_GRACE_MS) continue;
        scheduleAt = now + MIN_SCHEDULE_LEAD_MS;
      }

      notifications.push({
        id: hashToNotificationId(`${item.sourceKey}:${offsetMinutes}`),
        title: `${item.title} ${reminderLabel(Number(offsetMinutes))}`,
        body: item.body,
        ...commonNotificationFields(),
        actionTypeId: item.canMarkDone ? ACTION_PENDING : ACTION_INFO,
        schedule: { at: new Date(scheduleAt), allowWhileIdle: true },
        extra: {
          marksPortal: true,
          sourceKey: item.sourceKey,
          route: item.route,
          title: item.title,
          category: item.category,
          canMarkDone: item.canMarkDone,
          reminderOffsetMinutes: Number(offsetMinutes),
        },
      });
    }
  }

  const batch = notifications.slice(0, 200);
  if (batch.length) {
    await LocalNotifications.schedule({ notifications: batch });
  }

  const diagnostics = await getNativeNotificationDiagnostics();
  return {
    native: true,
    scheduled: batch.length,
    permission: setup.permission,
    systemEnabled: setup.systemEnabled,
    exactAlarm: setup.exactAlarm,
    items: items.length,
    pendingCount: diagnostics.pendingCount,
    nextScheduledAt: diagnostics.nextScheduledAt,
  };
}

export async function cancelAllPortalNotifications() {
  if (!isNative()) return;
  const pending = await LocalNotifications.getPending();
  const ours = (pending.notifications || []).filter(notificationBelongsToPortal);
  if (ours.length) {
    await LocalNotifications.cancel({
      notifications: ours.map((item) => ({ id: item.id })),
    });
  }
}

export function isNativeMobileApp() {
  return isNative();
}
