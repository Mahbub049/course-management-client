import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getAuthItem } from "../utils/authStorage";
import { notificationService } from "./notificationService";

const ExamDutyNotifier = registerPlugin("ExamDutyNotifier");
let acknowledging = null;

function isAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

// Server JWT contains the account ID. Do not persist the bearer token in Android
// notification data. SHA-like account isolation isn't authentication: the API
// still authorizes all acknowledgment requests using its normal JWT.
function accountKey() {
  const token = getAuthItem("marksPortalToken");
  try {
    const base64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    return String(payload?.id || "");
  } catch {
    return "";
  }
}

/** Button taps wake/open the app; remove the native alert ONLY after the
 * per-account API confirmation succeeds. Retry unconfirmed taps on resume. */
export async function flushExamDutyAcknowledgements() {
  if (!isAndroid() || !getAuthItem("marksPortalToken")) return;
  if (acknowledging) return acknowledging;
  acknowledging = (async () => {
    const { sourceKeys = [], accountKey: pendingAccount } = await ExamDutyNotifier.getPendingAcknowledgements();
    // Never acknowledge a former teacher's duty with the new teacher's JWT.
    if (pendingAccount && pendingAccount !== accountKey()) {
      await ExamDutyNotifier.clear();
      return;
    }
    let completedAny = false;
    for (const sourceKey of sourceKeys) {
      if (typeof sourceKey !== "string" || !sourceKey.startsWith("exam-duty:")) continue;
      try {
        if (sourceKey.startsWith("exam-duty:preview:")) {
          await ExamDutyNotifier.confirmAcknowledgement({ sourceKey });
          continue;
        }
        const response = await notificationService.setReminderState(sourceKey, true);
        if (response?.success === false) throw new Error("Server rejected acknowledgement");
        await ExamDutyNotifier.confirmAcknowledgement({ sourceKey });
        completedAny = true;
      } catch (error) {
        console.error("Exam duty remains pending until acknowledgement is saved", error);
      }
    }
    if (completedAny) window.dispatchEvent(new Event("marksPortalNotificationsChanged"));
  })();
  try { await acknowledging; } finally { acknowledging = null; }
}

export async function syncExamDutyNative(items, states, { enabled = true } = {}) {
  if (!isAndroid()) return;
  const account = accountKey();
  if (!account) return;
  const completed = new Set((states || []).filter((state) => state.completed).map((state) => state.sourceKey));
  const duties = enabled
    ? items.filter((item) => item.source === "exam-duty").map((item) => ({
        ...item.metadata,
        acknowledged: completed.has(item.sourceKey),
      }))
    : [];
  await ExamDutyNotifier.sync({ accountKey: account, duties });
}

export async function clearExamDutyNative() {
  if (!isAndroid()) return;
  await ExamDutyNotifier.clear();
}

export async function getNativeExamDutyNotificationStatus() {
  if (!isAndroid()) return { enabled: false, reason: "Android app required" };
  return ExamDutyNotifier.notificationStatus();
}

export async function openNativeExamDutyNotificationSettings() {
  if (!isAndroid()) throw new Error("Android app required");
  return ExamDutyNotifier.openNotificationSettings();
}

export async function previewNativeExamDuty() {
  if (!isAndroid()) throw new Error("Preview is available only in the Android app.");

  // User tapped Preview: this is an appropriate place to show Android's
  // runtime notification-permission dialog. The old code always showed
  // 'sent' even if permission was missing and no notification was posted.
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== "granted") {
    throw new Error("Notification permission was not granted. Enable BUBT Portal notifications in your Android app settings.");
  }

  const system = await LocalNotifications.areEnabled();
  if (system.value === false) {
    throw new Error("Android notifications are disabled for BUBT Portal. Turn them on in the phone's app settings.");
  }

  const nativeStatus = await ExamDutyNotifier.notificationStatus();
  if (!nativeStatus.enabled) {
    throw new Error(nativeStatus.reason || "Exam-duty notification channel is disabled in Android settings.");
  }

  const result = await ExamDutyNotifier.preview();
  if (result?.posted !== true || result?.visibleInSystem !== true) {
    throw new Error("Android has not confirmed that the exam-duty notification is visible.");
  }
  return result;
}
