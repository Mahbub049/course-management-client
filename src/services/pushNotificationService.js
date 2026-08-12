import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { notificationService } from "./notificationService";
import {
  ensureNativeNotificationSetup,
  showForegroundPushNotification,
} from "./mobileNotificationService";

let listenersReady = false;
let registrationPromise = null;
let registrationResolver = null;
let registrationTimer = null;
let lastToken = "";
let lastRegistrationResult = null;

function dispatchNavigation(route) {
  if (!route || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("marksPortalNotificationNavigate", { detail: { route } })
  );
}

function dispatchNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("marksPortalNotificationsChanged"));
}

function readableError(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return String(error?.error || error?.message || error?.code || "").trim();
}

function settleRegistration(result) {
  lastRegistrationResult = result;
  if (registrationTimer) {
    clearTimeout(registrationTimer);
    registrationTimer = null;
  }
  if (registrationResolver) {
    registrationResolver(result);
    registrationResolver = null;
  }
  registrationPromise = null;
}

async function saveTokenToServer(token) {
  if (!token) {
    return {
      enabled: true,
      registered: false,
      permission: "granted",
      tokenSaved: false,
      reason: "missing-token",
    };
  }

  try {
    await notificationService.registerDeviceToken(token, Capacitor.getPlatform());
    const result = {
      enabled: true,
      registered: true,
      permission: "granted",
      tokenSaved: true,
    };
    lastRegistrationResult = result;
    dispatchNotificationsChanged();
    return result;
  } catch (error) {
    console.error("Could not save push notification token", error);
    const result = {
      enabled: true,
      registered: true,
      permission: "granted",
      tokenSaved: false,
      reason: "server-save-failed",
      error,
    };
    lastRegistrationResult = result;
    return result;
  }
}

async function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;

  await PushNotifications.addListener("registration", async (token) => {
    lastToken = String(token?.value || "").trim();
    const result = await saveTokenToServer(lastToken);
    settleRegistration(result);
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.error("Push notification registration failed", error);
    settleRegistration({
      enabled: true,
      registered: false,
      permission: "granted",
      tokenSaved: false,
      reason: "native-registration-error",
      error,
      errorMessage: readableError(error),
    });
  });

  await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
    try {
      // Android displays background notification payloads itself. When the app
      // is foregrounded, mirror the push as a local notification so it is still
      // visible to the user.
      await showForegroundPushNotification(notification);
    } catch (error) {
      console.error("Could not display foreground push notification", error);
    }
    dispatchNotificationsChanged();
  });

  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      dispatchNotificationsChanged();
      const route = action?.notification?.data?.route || "/academic-calendar";
      dispatchNavigation(route);
    }
  );
}

/**
 * Register this native app installation with FCM and persist the resulting
 * registration identifier on the Marks Portal server.
 *
 * force=true is intentionally supported because a first registration can fail
 * while Firebase/Play Services are still initializing. Older builds could get
 * stuck after that first failure and never retry until the app process died.
 */
export async function initializePushNotifications({ force = false } = {}) {
  if (!Capacitor.isNativePlatform()) {
    return { enabled: false, registered: false, reason: "web" };
  }

  await ensureListeners();

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    const result = {
      enabled: true,
      registered: false,
      tokenSaved: false,
      permission: permission.receive,
      reason: "permission-not-granted",
    };
    lastRegistrationResult = result;
    return result;
  }

  await ensureNativeNotificationSetup({ requestPermission: false });

  // If Android already supplied us a token, retry saving it first. This also
  // recovers from a temporary API/network failure without waiting for FCM to
  // rotate or re-emit the token.
  if (lastToken && (force || lastRegistrationResult?.tokenSaved !== true)) {
    const saved = await saveTokenToServer(lastToken);
    if (saved.tokenSaved) return saved;
  }

  if (!force && lastRegistrationResult?.tokenSaved === true) {
    return lastRegistrationResult;
  }

  if (registrationPromise) return registrationPromise;

  registrationPromise = new Promise((resolve) => {
    registrationResolver = resolve;
    registrationTimer = setTimeout(() => {
      settleRegistration({
        enabled: true,
        registered: false,
        tokenSaved: false,
        permission: "granted",
        reason: "registration-timeout",
      });
    }, 15000);
  });

  try {
    await PushNotifications.register();
  } catch (error) {
    settleRegistration({
      enabled: true,
      registered: false,
      tokenSaved: false,
      permission: "granted",
      reason: "register-call-failed",
      error,
      errorMessage: readableError(error),
    });
  }

  return registrationPromise;
}

export function getLastPushRegistrationResult() {
  return lastRegistrationResult;
}
