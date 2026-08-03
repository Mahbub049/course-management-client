import axios from "axios";
import {
  clearAuthData,
  getAuthItem,
} from "../utils/authStorage";

const DEPLOYED_API_BASE_URL =
  "https://course-management-server-1l1s.onrender.com/api";

// Vite does not load .env.production while running `npm run dev`. Previously,
// localhost development therefore silently fell back to localhost:5000 even
// when only the frontend was running. Use the hosted API as the safe default;
// a developer can still override it with VITE_API_URL or VITE_API_BASE_URL.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  DEPLOYED_API_BASE_URL;

const API_TIMEOUT_MS = 180_000;
const DEFAULT_SAFE_RETRIES = 1;
const RETRYABLE_METHODS = new Set(["get", "head", "options"]);
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
});

const pendingButtonCounts = new WeakMap();
let lastActionButton = null;
let lastActionButtonAt = 0;
let authRedirectStarted = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPendingLabel(method, button) {
  const explicitLabel = button?.dataset?.pendingLabel;
  if (explicitLabel) return explicitLabel;

  const normalizedMethod = String(method || "get").toLowerCase();

  if (normalizedMethod === "get") return "Loading…";
  if (normalizedMethod === "delete") return "Deleting…";
  if (normalizedMethod === "put" || normalizedMethod === "patch") return "Updating…";
  if (normalizedMethod === "post") return "Submitting…";

  return "Processing…";
}

function rememberActionButton(button) {
  if (!button) return;
  lastActionButton = button;
  lastActionButtonAt = Date.now();
}

function isUsableActionButton(button) {
  return Boolean(
    button &&
      button.isConnected &&
      !button.disabled &&
      button.getAttribute("aria-disabled") !== "true"
  );
}

function findActiveActionButton() {
  if (typeof document === "undefined") return null;

  const activeElement = document.activeElement;
  const activeButton = activeElement?.closest?.(
    'button, input[type="submit"], input[type="button"]'
  );

  if (isUsableActionButton(activeButton)) {
    return activeButton;
  }

  if (
    isUsableActionButton(lastActionButton) &&
    Date.now() - lastActionButtonAt <= 2000
  ) {
    return lastActionButton;
  }

  return null;
}

function markButtonPending(button, method) {
  if (!button) return;

  const currentCount = pendingButtonCounts.get(button) || 0;
  pendingButtonCounts.set(button, currentCount + 1);

  if (currentCount > 0) return;

  const computedColor =
    typeof window !== "undefined" ? window.getComputedStyle(button).color : "";

  if (computedColor) {
    button.style.setProperty("--api-pending-color", computedColor);
  }

  button.dataset.apiPending = "true";
  button.dataset.apiPendingLabel = getPendingLabel(method, button);
  button.setAttribute("aria-busy", "true");
}

function releaseButtonPending(button) {
  if (!button) return;

  const currentCount = pendingButtonCounts.get(button) || 0;

  if (currentCount > 1) {
    pendingButtonCounts.set(button, currentCount - 1);
    return;
  }

  pendingButtonCounts.delete(button);
  delete button.dataset.apiPending;
  delete button.dataset.apiPendingLabel;
  button.removeAttribute("aria-busy");
  button.style.removeProperty("--api-pending-color");
}

function isRetryableNetworkError(error) {
  if (error?.response || error?.code === "ERR_CANCELED") return false;

  return (
    [
      "ECONNABORTED",
      "ERR_NETWORK",
      "ETIMEDOUT",
      "ECONNRESET",
    ].includes(error?.code) || Boolean(error?.request)
  );
}

function shouldRetryRequest(error) {
  const config = error?.config;
  if (!config || config.__skipAutomaticRetry === true) return false;

  const method = String(config.method || "get").toLowerCase();
  if (!RETRYABLE_METHODS.has(method)) return false;

  const retryCount = Number(config.__retryCount || 0);
  const maxRetries = Number.isFinite(Number(config.__maxAutomaticRetries))
    ? Math.max(0, Number(config.__maxAutomaticRetries))
    : DEFAULT_SAFE_RETRIES;

  if (retryCount >= maxRetries) return false;

  const status = Number(error?.response?.status || 0);
  return isRetryableNetworkError(error) || RETRYABLE_STATUS.has(status);
}

function redirectExpiredSession(config) {
  if (typeof window === "undefined") return;
  if (config?.skipAuthRedirect === true) return;
  if (authRedirectStarted) return;
  if (!getAuthItem("marksPortalToken")) return;

  const isLoginPage = window.location.pathname === "/login";

  clearAuthData();
  sessionStorage.setItem(
    "marksPortalLoginNotice",
    "Your session expired. Please log in again."
  );

  if (!isLoginPage) {
    authRedirectStarted = true;
    window.location.replace("/login?reason=session-expired");
  }
}

if (typeof document !== "undefined" && !window.__marksPortalPendingClickGuard) {
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target?.closest?.(
        'button, input[type="submit"], input[type="button"]'
      );

      if (button?.dataset?.apiPending === "true") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }

      rememberActionButton(button);
    },
    true
  );

  document.addEventListener(
    "submit",
    (event) => {
      rememberActionButton(event.submitter);
    },
    true
  );

  window.__marksPortalPendingClickGuard = true;
}

api.interceptors.request.use((config) => {
  const token = getAuthItem("marksPortalToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // A retried request already owns the original action button. Do not increase
  // the pending counter again for each automatic retry.
  if (!config.__marksPortalActionButton) {
    const actionButton = findActiveActionButton();
    if (actionButton) {
      markButtonPending(actionButton, config.method);
      config.__marksPortalActionButton = actionButton;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    releaseButtonPending(response?.config?.__marksPortalActionButton);
    return response;
  },
  async (error) => {
    const config = error?.config || {};

    if (shouldRetryRequest(error)) {
      config.__retryCount = Number(config.__retryCount || 0) + 1;

      // Give a temporarily unavailable hosted API a moment to recover. One
      // retry is enough; repeated parallel retries can overload a waking server.
      await wait(2000);
      return api.request(config);
    }

    releaseButtonPending(config.__marksPortalActionButton);

    if (Number(error?.response?.status || 0) === 401) {
      redirectExpiredSession(config);
    }

    return Promise.reject(error);
  }
);

export default api;
