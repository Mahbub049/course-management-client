# BUBT Marks Portal Android app

The existing React/Vite portal is configured for Capacitor. The web and Android app use the same React source.

## First Android Studio setup

Use Node.js 22+ and a current Android Studio/JDK supported by Capacitor 8.

```bash
npm install
npm run mobile:add:android
npm run mobile:open
```

After the `android/` folder has been created once, future React updates only need:

```bash
npm run mobile:android
```

## Native local notifications

The mobile app schedules upcoming reminders locally after login and whenever the app returns to the foreground. Android 13+ will ask for notification permission when the user presses **Enable on this phone** under **Notifications**.

The notification action buttons are:

- **Done**: marks only the user's reminder state as complete. It does not modify the source calendar item and does not submit coursework.
- **Open**: opens the relevant portal page.
- **Undo**: appears after a task is marked done.

No exact-alarm permission is required by this implementation. Android may apply normal system scheduling tolerance to reminders.

## Firebase Cloud Messaging (optional live push layer)

Local scheduling works without FCM. FCM is prepared but disabled until Firebase Android credentials are supplied.

1. Register Android app id `com.bubt.marksportal` in the Firebase project.
2. Download `google-services.json` and place it at `android/app/google-services.json` after the Android project is generated.
3. Set this in the production client environment:

```env
VITE_ENABLE_PUSH_NOTIFICATIONS=true
```

The client will then register the FCM token with `/api/notifications/device-token`.

A server sender/service-account is intentionally not hardcoded into the repository. Add server-side Firebase credentials through deployment environment/secrets before enabling remote sends.

## API origin

The Android Capacitor WebView uses the existing hosted HTTPS API configured in `src/services/api.js`. The server CORS setup accepts localhost/Capacitor development origins.
