# Android exam duty system notifications — update instructions

This patch adds **real Android notification-shade alerts**, not website/in-app cards. The native expanded layout has date, large **TIME**, large **ROOM**, and an **Acknowledge** action. The compact shade row is also customized.

## Apply

1. Back up your current client and server source folders.
2. Copy `server/src/controllers/examDutyController.js` and `server/src/routes/examDutyRoutes.js` from this patch into the **same paths** in the latest server project and deploy/restart it **first**.
3. Copy every file under `client/` from the patch over the **matching path** in your current React/Capacitor project. Preserve your existing `.env.*`, `android/`, passwords, signing keys, and `google-services.json` files.
4. In a Windows PowerShell terminal inside the client folder:

   ```powershell
   npm install
   # If android/ does NOT exist:
   npm run mobile:add:android
   # If android/ already exists, use this INSTEAD of the above:
   npm run mobile:sync
   npm run mobile:open
   ```

   `mobile:sync` rebuilds Vite, synchronizes Capacitor, and installs the new native Java files, XML RemoteViews, receiver declarations, and manifest permissions in the existing Android project. Do NOT run `cap add android` again for an existing project.

5. In Android Studio, wait for Gradle Sync to finish. Select your physical Android phone (USB debugging enabled), then **Run**. To export: **Build > Build Bundle(s) / APK(s) > Build APK(s)**. Find debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`.
6. If upgrading an already installed app, keep **the same app ID and signing certificate**. Debug and signed release keys aren't interchangeable. Otherwise you may have to uninstall and log in again; uninstalling clears scheduled notifications.
7. On the phone allow **BUBT Portal > Notifications**. For more reliable punctual alarms on supported Android versions, also allow **Alarms & reminders** if available. Review Xiaomi/MIUI/HyperOS battery restrictions and enable unrestricted background operation for this app if reminders are delayed.

## Confirm the feature

1. Log in as a **teacher** using a profile with a faculty shortcode that matches the imported invigilation roster (including proxy/transferred duties).
2. Open **Notifications** in the Android application. Tap **Preview exam duty system notification** (this creates a demo, not an actual duty). Pull down the actual Android notification shade and expand the notification to see the two-column layout. Press **Acknowledge** to clear the demo.
3. Import/assign a real upcoming exam duty in the portal (or use one already in the database). Open the Android app once while online to synchronize. For each unacknowledged duty the device schedules an alert roughly **one hour before** its start time; if already within this window, it shows when the app synchronizes. Dates and times follow **Asia/Dhaka**. The server sends only duties belonging to the logged-in teacher.
4. Tap **Acknowledge** on the real notification. The app opens, sends `PUT /api/notifications/state` with `completed: true`, and clears the alert **only if the API succeeds**. If offline or session expired, it stays pending and retries when the app can authenticate.
5. Normal notification preferences still control the **Exams** category and global enable/disable. Acknowledged duties stay in the original exam-duty timetable; only their personal reminder state changes.

## Firebase (separate from local scheduling)

The uploaded project already contains a Capacitor push-registration integration. For Firebase push, obtain **your own** Android Firebase `google-services.json` for `com.bubt.marksportal`, then put it in `client/mobile-assets/google-services.json` before `mobile:sync`. Configure backend environment variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) if you want the **existing** server-side calendar FCM notifications. These secrets are not in this patch.

**Exam-duty alerts in this patch use local Android AlarmManager scheduling**, based on the teacher's timetable last fetched by the app. They work after leaving the app and after a normal reboot, but a **new or changed duty cannot be scheduled on an offline/closed app until the app synchronizes again**. Existing Firebase calendar pushes are separate; this patch does not add a new exam-duty FCM trigger.

## Device and build limitations

- Android decides the final notification chrome, collapsed/expanded behavior, font metrics and action placement. This custom native layout approximates the supplied visual; it is not a pixel-exact guarantee across Android skins.
- Android 14+ and some vendor firmware can allow dismissal of ongoing alerts. Android does not guarantee an absolutely non-dismissible notification. On returning to the app, unacknowledged due-duty alerts are restored and preserved even if they fall outside the fetch window. There is no bypass of the system's dismissal/user controls.
- Force-stopping the app can prevent alarms until the app is manually opened. Notifications also require OS permission and may be delayed by power saving. Device reboots restore scheduled alarms when the system sends boot broadcasts.
- This package is source code, **not a compiled/tested APK**. JavaScript source and XML/configuration were statically checked; an Android SDK/Gradle build and real-device validation are still required.
- The Android implementation is only for the native Capacitor app. The regular website cannot display the custom RemoteViews layout in the OS notification shade.

## Modified/new paths

Server: `src/controllers/examDutyController.js`, `src/routes/examDutyRoutes.js`

Client existing files: `src/utils/notificationItems.js`, `src/services/mobileNotificationService.js`, `src/components/MobileNotificationBridge.jsx`, `src/pages/NotificationSettingsPage.jsx`, `scripts/configure-android-app.mjs`

Client new files: `src/services/examDutyNotificationService.js`, `src/services/nativeExamDutyService.js`, `mobile-assets/exam-duty/java/*.java`, `mobile-assets/exam-duty/res/layout/*.xml`, `mobile-assets/exam-duty/res/drawable/*.xml`.
