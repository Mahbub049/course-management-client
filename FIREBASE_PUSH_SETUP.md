# Firebase Cloud Messaging setup for BUBT Marks Portal

The code now supports server-driven Android notifications. This makes shared
teacher calendar items and items created from the web reach registered phones
without needing the React app to stay open.

## Android Firebase file

The Capacitor package name is:

`com.bubt.marksportal`

In Firebase project `bubt-courses`, add an Android app with exactly that package
name and download `google-services.json`.

Do NOT commit that file to a public repository. Put it locally at:

`client/mobile-assets/google-services.json`

Then run:

`npm run mobile:android`

The mobile configuration script will copy it into `android/app/` automatically.

## Server Firebase Admin credentials

Create/download a Firebase service-account key for the same Firebase project.
Do NOT commit the JSON key file. Add these values to the Render server's
environment variables:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

For `FIREBASE_PRIVATE_KEY`, paste the private_key value. Render can store the
multi-line value. If it is stored with literal `\\n`, the server code converts
those back to new lines automatically.

After adding the variables, redeploy the server. The server log should include:

`FCM push initialized for Firebase project ...`

and:

`Faculty calendar FCM reminder scheduler started.`

## What the new flow does

- Personal teacher item: push goes to that teacher's registered devices.
- "All teachers" item: push goes to every registered teacher device.
- Creation from web or Android uses the same server endpoint, so both trigger
  push notifications.
- Updates/removals also send a push.
- Future teacher-calendar reminders are sent by the server at each teacher's
  selected reminder offsets, so the phone app does not have to be open.
- Local Android notifications remain as a fallback until FCM is fully configured.
