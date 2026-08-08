MARKS PORTAL - CLIENT MOBILE NOTIFICATION PATCH
Based on: client(20260808-171249).zip

This ZIP contains ONLY files added or modified for the mobile/notification update.
It intentionally does NOT contain .env.development or .env.production, so your existing environment/API settings are not overwritten.

INSTALL:
1. Back up your current client folder (recommended).
2. Extract this ZIP into the ROOT of your existing client folder.
3. Choose Replace/Overwrite for matching files.
4. Run: npm install
5. Run: npm run build

First Android setup (after Capacitor packages install successfully):
  npm run mobile:add:android
  npm run mobile:open

Later Android sync/open:
  npm run mobile:android

Optional future FCM push notifications:
Add this to the relevant .env file only when Firebase push is configured:
  VITE_ENABLE_PUSH_NOTIFICATIONS=true
If the variable is absent, push notifications remain disabled safely.

Files in this patch:
- package.json
- capacitor.config.json
- MOBILE_APP_SETUP.md
- src/App.jsx
- src/layouts/AppLayout.jsx
- src/pages/TeacherDashboard.jsx
- src/components/MobileNotificationBridge.jsx
- src/pages/NotificationSettingsPage.jsx
- src/services/mobileNotificationService.js
- src/services/notificationService.js
- src/services/pushNotificationService.js
- src/utils/notificationItems.js
- src/utils/upcomingSchedule.js
