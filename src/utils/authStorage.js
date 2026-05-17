const AUTH_KEYS = [
  "marksPortalToken",
  "marksPortalRole",
  "marksPortalName",
  "marksPortalUsername",
  "marksPortalProfileImage",
];

export function getAuthItem(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

export function setAuthItem(key, value) {
  const rememberMe = localStorage.getItem("marksPortalRememberMe") === "true";
  const storage = rememberMe ? localStorage : sessionStorage;

  if (value) {
    storage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

export function saveAuthData(data, rememberMe) {
  clearAuthData();

  localStorage.setItem("marksPortalRememberMe", rememberMe ? "true" : "false");

  const storage = rememberMe ? localStorage : sessionStorage;

  storage.setItem("marksPortalToken", data.token);
  storage.setItem("marksPortalRole", data.role);

  if (data.name) storage.setItem("marksPortalName", data.name);
  if (data.username) storage.setItem("marksPortalUsername", data.username);
  if (data.profileImage) {
    storage.setItem("marksPortalProfileImage", data.profileImage);
  }
}

export function clearAuthData() {
  AUTH_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}