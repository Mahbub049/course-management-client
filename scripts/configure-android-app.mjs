import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const androidRoot = path.join(projectRoot, "android");
const appMain = path.join(androidRoot, "app", "src", "main");
const manifestPath = path.join(appMain, "AndroidManifest.xml");
const targetRes = path.join(appMain, "res");
const sourceRes = path.join(projectRoot, "mobile-assets", "android");
const firebaseConfigSource = path.join(projectRoot, "mobile-assets", "google-services.json");
const firebaseConfigTarget = path.join(androidRoot, "app", "google-services.json");
const stringsPath = path.join(appMain, "res", "values", "strings.xml");

if (!existsSync(androidRoot) || !existsSync(manifestPath)) {
  console.log("Android project not found yet; skipping native notification/icon configuration.");
  process.exit(0);
}

const EXACT_PERMISSION =
  '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />';
const POST_PERMISSION =
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />';

let manifest = await readFile(manifestPath, "utf8");
const permissionLines = [];
if (!manifest.includes("android.permission.SCHEDULE_EXACT_ALARM")) {
  permissionLines.push(`    ${EXACT_PERMISSION}`);
}
if (!manifest.includes("android.permission.POST_NOTIFICATIONS")) {
  permissionLines.push(`    ${POST_PERMISSION}`);
}

if (permissionLines.length) {
  const manifestOpenStart = manifest.indexOf("<manifest");
  const manifestOpenEnd = manifest.indexOf(">", manifestOpenStart);
  if (manifestOpenStart === -1 || manifestOpenEnd === -1) {
    throw new Error("Could not find the opening <manifest> tag in AndroidManifest.xml");
  }
  manifest =
    manifest.slice(0, manifestOpenEnd + 1) +
    `\n${permissionLines.join("\n")}` +
    manifest.slice(manifestOpenEnd + 1);
  await writeFile(manifestPath, manifest, "utf8");
  console.log("Added Android notification permissions.");
}

async function copyTree(source, destination) {
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyTree(sourcePath, destinationPath);
    } else {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

// Capacitor's generated project may contain WEBP launcher assets with the same
// Android resource names. Remove them before copying the BUBT PNG/XML icons.
for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  const dir = path.join(targetRes, `mipmap-${density}`);
  for (const name of [
    "ic_launcher.webp",
    "ic_launcher_round.webp",
    "ic_launcher_foreground.webp",
  ]) {
    await rm(path.join(dir, name), { force: true });
  }
}

await copyTree(sourceRes, targetRes);
console.log("Applied BUBT launcher icon and notification icons.");

// Keep the installed Android application label in sync even for an already-generated
// Capacitor project. `cap sync` does not always rewrite the existing strings.xml.
if (existsSync(stringsPath)) {
  let stringsXml = await readFile(stringsPath, "utf8");
  const setString = (name, value) => {
    const pattern = new RegExp(`<string\\s+name=["']${name}["'][^>]*>[^<]*<\\/string>`);
    if (pattern.test(stringsXml)) {
      stringsXml = stringsXml.replace(pattern, `<string name="${name}">${value}</string>`);
    }
  };
  setString("app_name", "BUBT Portal");
  setString("title_activity_main", "BUBT Portal");
  await writeFile(stringsPath, stringsXml, "utf8");
  console.log("Set Android app name to BUBT Portal.");
}

if (!existsSync(firebaseConfigSource)) {
  throw new Error(
    "FCM SETUP REQUIRED: client/mobile-assets/google-services.json is missing. " +
      "Download the Android google-services.json for package com.bubt.marksportal from Firebase and place it there before rebuilding."
  );
}

let firebaseConfig;
try {
  firebaseConfig = JSON.parse(await readFile(firebaseConfigSource, "utf8"));
} catch (error) {
  throw new Error(`FCM SETUP ERROR: google-services.json is not valid JSON: ${error.message}`);
}

const packageNames = (firebaseConfig?.client || [])
  .map((client) => client?.client_info?.android_client_info?.package_name)
  .filter(Boolean);
const projectId = String(firebaseConfig?.project_info?.project_id || "").trim();
const matchingClient = (firebaseConfig?.client || []).find(
  (client) => client?.client_info?.android_client_info?.package_name === "com.bubt.marksportal"
);
const mobileSdkAppId = String(matchingClient?.client_info?.mobilesdk_app_id || "").trim();
const apiKeys = (matchingClient?.api_key || []).map((entry) => entry?.current_key).filter(Boolean);

if (!packageNames.includes("com.bubt.marksportal")) {
  throw new Error(
    `FCM SETUP ERROR: google-services.json is for the wrong Android package. ` +
      `Expected com.bubt.marksportal; found ${packageNames.join(", ") || "none"}. ` +
      `Register/download the Firebase Android app using exactly com.bubt.marksportal.`
  );
}
if (!projectId || !mobileSdkAppId || !apiKeys.length) {
  throw new Error(
    "FCM SETUP ERROR: google-services.json is incomplete for com.bubt.marksportal. " +
      "Download a fresh file from Firebase Project settings > Your apps > Android app."
  );
}

await copyFile(firebaseConfigSource, firebaseConfigTarget);
console.log(`Verified Firebase Android config: ${projectId} / com.bubt.marksportal.`);
console.log("Applied Firebase google-services.json for FCM push notifications.");
console.log("Android native configuration is ready.");
