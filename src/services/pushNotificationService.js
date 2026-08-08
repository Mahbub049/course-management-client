import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { notificationService } from "./notificationService";

let listenersReady = false;
let registrationStarted = false;

function dispatchNavigation(route) {
  if (!route || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("marksPortalNotificationNavigate", { detail: { route } })
  );
}

export async function initializePushNotifications() {
  if (!Capacitor.isNativePlatform()) return { enabled: false, reason: "web" };
  if (import.meta.env.VITE_ENABLE_PUSH_NOTIFICATIONS !== "true") {
    return { enabled: false, reason: "disabled" };
  }

  if (!listenersReady) {
    listenersReady = true;

    await PushNotifications.addListener("registration", async (token) => {
      try {
        await notificationService.registerDeviceToken(
          token.value,
          Capacitor.getPlatform()
        );
      } catch (error) {
        console.error("Could not save push notification token", error);
      }
    });

    await PushNotifications.addListener("registrationError", (error) => {
      console.error("Push notification registration failed", error);
    });

    await PushNotifications.addListener("pushNotificationReceived", () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("marksPortalNotificationsChanged"));
      }
    });

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const route = action?.notification?.data?.route || "/notifications";
        dispatchNavigation(route);
      }
    );
  }

  if (registrationStarted) return { enabled: true, registered: true };

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    return { enabled: true, registered: false, permission: permission.receive };
  }

  registrationStarted = true;
  await PushNotifications.register();
  return { enabled: true, registered: true, permission: permission.receive };
}
