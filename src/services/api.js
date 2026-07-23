import axios from "axios";
import { getAuthItem } from "../utils/authStorage";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
});

const pendingButtonCounts = new WeakMap();
let lastActionButton = null;
let lastActionButtonAt = 0;

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

  const actionButton = findActiveActionButton();
  if (actionButton) {
    markButtonPending(actionButton, config.method);
    config.__marksPortalActionButton = actionButton;
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    releaseButtonPending(response?.config?.__marksPortalActionButton);
    return response;
  },
  (error) => {
    releaseButtonPending(error?.config?.__marksPortalActionButton);
    return Promise.reject(error);
  }
);

export default api;
