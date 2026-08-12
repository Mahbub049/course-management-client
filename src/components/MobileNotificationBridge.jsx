import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAuthItem } from "../utils/authStorage";
import { syncMobileNotifications } from "../services/mobileNotificationService";
import { initializePushNotifications } from "../services/pushNotificationService";

export default function MobileNotificationBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const syncingRef = useRef(false);
  const queuedSyncRef = useRef(false);
  const activeTokenRef = useRef("");

  useEffect(() => {
    const token = getAuthItem("marksPortalToken");
    if (!token) {
      activeTokenRef.current = "";
      return undefined;
    }

    const sync = async (requestPermission = false) => {
      if (syncingRef.current) {
        queuedSyncRef.current = true;
        return;
      }

      syncingRef.current = true;
      try {
        let permissionRequest = requestPermission;
        do {
          queuedSyncRef.current = false;
          await syncMobileNotifications({ requestPermission: permissionRequest });
          permissionRequest = false;
        } while (queuedSyncRef.current);
      } catch (error) {
        console.error("Mobile notification sync failed", error);
      } finally {
        syncingRef.current = false;
      }
    };

    const onNavigate = (event) => {
      const route = event?.detail?.route;
      if (route) navigate(route);
    };

    const onChanged = () => sync(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync(false);
    };

    if (activeTokenRef.current !== token) {
      activeTokenRef.current = token;
      initializePushNotifications()
        .catch((error) => {
          console.error("Push notification initialization failed", error);
        })
        .finally(() => sync(false));
    }

    window.addEventListener("marksPortalNotificationNavigate", onNavigate);
    window.addEventListener("marksPortalNotificationsChanged", onChanged);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("marksPortalNotificationNavigate", onNavigate);
      window.removeEventListener("marksPortalNotificationsChanged", onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [navigate, location.pathname]);

  return null;
}
