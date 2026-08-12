Marks Portal - FCM shared/web calendar notification fix (CLIENT)

This patch assumes you already applied:
- mobile notification base update
- notification fix v2
- academic calendar auto-sync v3
- hide Notifications sidebar on web

Apply:
1. Extract this ZIP directly into the existing client folder.
2. Choose Replace files in destination.
3. DO NOT delete client/android.
4. Complete FIREBASE_PUSH_SETUP.md.
5. Put google-services.json at:
      client/mobile-assets/google-services.json
6. Run:
      npm run mobile:android
7. In Android Studio, run the app on the phone.

Important:
- The BUBT launcher icon from the earlier update is preserved.
- Notifications sidebar remains hidden on the web version.
- Every teacher phone must open the updated Android app at least once and allow
  notifications so its FCM registration token can be stored on the server.
