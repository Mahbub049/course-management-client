const AUTH_KEYS = [
  "marksPortalToken",
  "marksPortalRole",
  "marksPortalName",
  "marksPortalUsername",
  "marksPortalProfileImage",
];

export function getAuthItem(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
}

export function getActiveAuthStorage() {
  const rememberMe = localStorage.getItem("marksPortalRememberMe") === "true";

  if (rememberMe) return localStorage;

  if (sessionStorage.getItem("marksPortalToken")) return sessionStorage;

  if (localStorage.getItem("marksPortalToken")) return localStorage;

  return sessionStorage;
}

export function setAuthItem(key, value) {
  if (value === undefined || value === null || value === "") {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    return;
  }

  const storage = getActiveAuthStorage();
  storage.setItem(key, value);
}

export function saveAuthData(data, rememberMe) {
  clearAuthData();

  localStorage.setItem("marksPortalRememberMe", rememberMe ? "true" : "false");

  const storage = rememberMe ? localStorage : sessionStorage;

  storage.setItem("marksPortalToken", data.token);
  storage.setItem("marksPortalRole", data.role);

  if (data.name) {
    storage.setItem("marksPortalName", data.name);
  }

  if (data.username) {
    storage.setItem("marksPortalUsername", data.username);
  }

  if (data.profileImage) {
    storage.setItem("marksPortalProfileImage", data.profileImage);
  }
}

export function clearAuthData() {
  AUTH_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });

  localStorage.removeItem("marksPortalRememberMe");
}