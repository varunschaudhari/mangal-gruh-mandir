# Mobile Apps â€” Android & iOS

The Android and iOS apps wrap the existing React client (`client/`) with [Capacitor](https://capacitorjs.com).
There is one codebase: every screen, permission and API call is the same as the website, with a
phone-first layout and native features layered on top.

| | |
|---|---|
| App name | **MGM Mandir** |
| App / bundle ID | `io.aumora.mandir` |
| Server | `https://mandir.aumora.io` (set in `client/.env.mobile`) |
| Native projects | `client/android/` (Android Studio), `client/ios/` (Xcode) |

## What's native in the app

- **UI ships inside the app.** It starts instantly and opens even with no internet. Data still comes from the server, and the Mahaprasad offline-redeem cache still works.
- **Phone navigation:**
  - A bottom tab bar chosen by role (for example Home Â· Stock Â· ï¼‹ Â· Payments Â· More).
  - The ï¼‹ button opens quick actions.
  - The app bar shows the screen title and a back arrow.
  - Pull down to refresh.
  - Popups slide up from the bottom.
- **Stays signed in on each phone** as long as it's used at least every 90 days. Signing in on a phone
  doesn't sign the same person out of the website (one session per device). An optional
  **app lock** (fingerprint/face, or the phone's own PIN as a fallback) is offered after the first sign-in
  and can be switched in **My Profile**. Changing the password signs out all other devices.
- **English / मराठी** switch on the login screen, in **More** and in **My Profile** (per phone/browser).
  The app shell, Mahaprasad counter, stock and purchase screens, dashboard and approvals are translated;
  other screens fall back to English. Translations live in `client/src/i18n/mr/*.js` (English text is the
  key). **Have a Marathi speaker at the temple review them.**
- **Android back button** closes the open popup first, then goes back, and leaves the app from Home.
- **QR scanning** uses Google ML Kit's native full-screen scanner, which is fast and works in low light. It reopens automatically after each redemption.
- **Scan anything** from the scan button in the top bar: product labels or a packet's shop barcode, asset QR labels, unit stickers and coupons. Each opens the right screen. In stock forms, the scan button in the product field picks the product. Print product QR labels from **Products → Labels**, and add a packet's barcode on the product form.
- **Files:** receipts, vouchers, 80G certificates, reports and Excel exports open the phone's **share sheet** (WhatsApp, email, Drive, Print). Print layouts such as receipts, borrow slips and labels are turned into a PDF first.
- **Phone polish:** haptic feedback, a splash screen, the temple-logo app icon, and correct spacing around notches and gesture bars.
- **Not supported on phones:** thermal coupon printing (QZ Tray / Electron) stays desktop-only. On phones, coupons are shared or printed as PDF.

## One-time server change (required before the app can log in)

The app talks to the API from its own origin (`https://localhost` on Android, `capacitor://localhost` on iOS).
`server/src/index.js` now allows those origins in CORS and lets uploaded files load cross-origin.
**Deploy the server** (see [DEPLOY.md](DEPLOY.md)) before testing the app against production.

## Prerequisites

| For | You need |
|---|---|
| Everything | **Node 22+** (`nvm use 24.19.0`; Capacitor's CLI won't run on Node 20 or older) |
| Android | [Android Studio](https://developer.android.com/studio). It bundles JDK 21 and the Android SDK. |
| iOS | A **Mac** with Xcode 16+ and CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`). iOS apps cannot be built on Windows. |

## Everyday workflow

```bash
cd client
npm install
npm run android     # builds the web bundle in mobile mode, syncs it into android/, opens Android Studio
npm run ios         # same for iOS (on a Mac); then run `pod install` in ios/App the first time
```

In Android Studio, pick a phone or emulator and press â–¶ Run. After changing React code, run `npm run cap:sync`
and press Run again. `cap:sync` builds with `vite build --mode mobile`, which reads `.env.mobile` and skips the PWA service worker.

To point a test build at another server, change `VITE_API_ORIGIN` in `client/.env.mobile`, for example to a staging URL.
That server's CORS must allow the mobile origins (already in `server/src/index.js`).

### Icons and splash screen

Generated from `client/public/logo.png`:

```bash
npm run icons:mobile    # writes client/assets/* and every Android/iOS size
```

## Android release (direct APK install)

**1. Create the signing key, once.** Keep this file and its passwords safe and backed up.
If the key is lost, installed apps can't be updated; staff would have to uninstall and reinstall.

```bash
cd client/android
keytool -genkeypair -v -keystore mgm-release.jks -alias mgm -keyalg RSA -keysize 2048 -validity 10000
```

**2. Create `client/android/keystore.properties`** (git-ignored, never commit it):

```properties
storeFile=mgm-release.jks
storePassword=********
keyAlias=mgm
keyPassword=********
```

**3. Build and publish a release** (JDK 21 and the Android SDK must be installed):

```bash
cd client
npm run release:android -- --version 1.1 --notes "What's new in this version"
```

This bumps `versionCode` (by 1) and `versionName` in `client/android/app/build.gradle`, builds the
signed APK, and writes two files to `mobile-releases/` at the repo root:
`mgm-mandir-1.1.apk` and `latest.json`. Copy them to the server's `mobile-releases/` folder,
**APK first**, then commit the version bump:

```bash
scp mobile-releases/mgm-mandir-1.1.apk root@<server>:/root/mangal-gruh-mandir/mobile-releases/
scp mobile-releases/latest.json        root@<server>:/root/mangal-gruh-mandir/mobile-releases/
```

**First install:** send staff the link `https://mandir.aumora.io/api/app/mgm-mandir-1.1.apk`
(or the file itself on WhatsApp). Android asks once to allow installs from Chrome/WhatsApp.

**Updates are automatic after that.** The app checks `/api/app/latest.json` when it opens (and
when it comes back to the foreground) and offers "Update available â†’ Download". The update installs
over the old version and keeps the data and login, as long as it's signed with the same key.

- Add `--min <versionCode>` to force every older build to update (a blocking "Update required"
  screen). Use it when the server changes in a way old apps can't handle.
- The **debug** test APK is signed with a different key, so it can't update to a release build â€”
  uninstall it once before installing the first release.

## Push notifications

The app can notify people on their phones:

- **Approvers:** a new supplier payment or expense is waiting for them.
- **The person who submitted it:** their payment or expense was approved or rejected.
- **Every morning at 8:30:** stock that's out, low or due for reorder (people with report access), and approvals still waiting.

Tapping a notification opens the right screen. It's built in but **off until Firebase is set up** (free):

1. In [Firebase console](https://console.firebase.google.com), create a project. Add an **Android app** with package
   `io.aumora.mandir`, download `google-services.json` and put it in `client/android/app/`.
2. **Project settings â†’ Service accounts â†’ Generate new private key.** On the server, add the JSON to
   `server/.env` as `FIREBASE_SERVICE_ACCOUNT=` (one line, or `base64 -w0 key.json`), then
   `docker compose restart server`. The log says "Push notifications on".
3. In `client/.env.mobile`, set `VITE_PUSH_ENABLED=true`, then release a new build (`npm run release:android â€¦`).
   Phones ask for notification permission after sign-in.
4. **iOS (on the Mac):** add an iOS app in the same Firebase project and put `GoogleService-Info.plist` in
   `client/ios/App/App/` (add it to the App target in Xcode). Upload an **APNs auth key** (Apple Developer â†’
   Keys) under Firebase â†’ Project settings â†’ Cloud Messaging. In Xcode, add the **Push Notifications** and
   **Background Modes â†’ Remote notifications** capabilities.

Both Firebase files are git-ignored. Keep copies with the signing key.

## Google Play (later)

1. Build an App Bundle instead of an APK: `./gradlew bundleRelease` â†’ `app/build/outputs/bundle/release/app-release.aab`.
2. Create a [Play Console](https://play.google.com/console) developer account (one-time US$25). Create the app and enrol in **Play App Signing**, uploading with the key above.
3. Play needs:
   - A **privacy policy URL**.
   - The **Data safety** form. The app sends login and temple records to your server and uses the camera to scan QR codes; nothing is shared with third parties.
   - Screenshots and an icon (`client/assets/icon-only.png`).
4. To keep it staff-only, publish to an **internal or closed testing** track and invite staff emails, or use a private (managed) app if the temple has a Google Workspace.
   Play then installs updates automatically.

## iOS (on a Mac)

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) (US$99/year). It's required to install on real iPhones beyond your own test device.
2. Set up the project:

   ```bash
   cd client && npm install && npm run cap:sync
   cd ios/App && pod install
   open App.xcworkspace
   ```

3. In Xcode, select the **App** target. Under **Signing & Capabilities**, choose your Team. The bundle ID is `io.aumora.mandir`.
4. Set **Version** / **Build** under General. Build must go up with every upload.
5. To release, choose **Product â†’ Archive â†’ Distribute App**:
   - **TestFlight (recommended for staff):** up to 100 internal testers with no review, or 10,000 external testers after a light review. Staff install the TestFlight app and get updates automatically.
   - **App Store:** public listing (it can be unlisted) after full App Review.

iOS has no equivalent of sending an APK. Installs go through TestFlight, the App Store, or Ad Hoc builds for at most 100 registered devices.

The iOS project uses **CocoaPods** (not Swift Package Manager) because Google ML Kit, which powers the scanner, is only published as CocoaPods.
The minimum iOS version is 15.5.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cannot reach the server" on login | The phone has no internet, or the server with the new CORS settings isn't deployed yet. |
| Expense receipt images don't load in the app | Same: deploy the server; `helmet` must send `Cross-Origin-Resource-Policy: cross-origin`. |
| Scanner says "Setting up the scanner" the first time (Android) | Google Play services is downloading the scanner module once. It needs internet; afterwards it works offline. |
| Scanner unavailable on an Android device without Google Play services | Use **Manual Entry** on the Redeem screen. |
| `npx cap â€¦` fails with an engine/syntax error | You're on an old Node. Run `nvm use 24.19.0`. |
| iOS build: "No such module" / pods missing | Run `pod install` in `client/ios/App` and open `App.xcworkspace` (not `.xcodeproj`). |
