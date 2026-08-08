# Marks Portal Android Notification Fix v2

This patch is designed to be copied **over the client project that already has the first mobile-notification update**.

## What this fixes

- Adds Android `SCHEDULE_EXACT_ALARM` and `POST_NOTIFICATIONS` configuration automatically.
- Uses `allowWhileIdle: true` for scheduled reminders so Android can fire them while the phone is idle/locked.
- Adds exact-alarm status checking and a button that opens Android's exact-alarm setting.
- Adds clear device diagnostics: notification permission, exact-alarm access, pending count and next scheduled reminder.
- Adds **Send test notification now** for an immediate notification test.
- Adds **Schedule 1-minute test** for a real scheduled-notification test.
- Adds **Resync phone reminders** and **Refresh device status** controls.
- Uses a fresh high-importance Android notification channel.
- Applies the existing BUBT logo as the Android launcher icon.
- Adds a BUBT logo large notification icon and a clean monochrome status-bar icon.

## Apply

1. Extract this ZIP into the existing `client` folder.
2. Choose **Replace files in destination**.
3. You do not need to delete the existing `android` folder.
4. In the client terminal run:

   `npm run mobile:android`

   This now also patches the Android manifest and copies the BUBT icon resources automatically.
5. Android Studio opens. Let Gradle sync, select your phone, then press Run.

## Strongly recommended for the first test after this patch

Uninstall the old debug copy of **BUBT Marks Portal** from the phone before pressing Run in Android Studio. This avoids stale launcher-icon/channel/permission state from the previous build.

Inside the newly installed app:

1. Open **Notifications**.
2. Tap **Enable on this phone** if shown and allow Android notification permission.
3. If **Exact alarm timing** says `Needs permission`, tap **Allow exact alarms** and enable the setting Android opens.
4. Return to the app and tap **Refresh device status**.
5. Tap **Send test notification now**. A notification should appear immediately.
6. Tap **Schedule 1-minute test**, leave/lock the app, and wait one minute. The app does not need to stay open.
7. After both tests pass, tap **Resync phone reminders** and test a real portal task.

## Note about tasks created later from the PC

Once a reminder is scheduled on the phone, the app does not need to remain running. However, a brand-new task created on the PC after the phone last synchronized cannot be known by the phone until the app synchronizes again. Fully automatic server-to-phone delivery for newly created/changed tasks requires Firebase Cloud Messaging (push notifications), which is the next stage and needs the Firebase Android/server credentials.
