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
console.log("Android native configuration is ready.");
