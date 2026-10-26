# BareFit 0.4.0 Direct — verification, 26 October 2026

## Direct TV hub

The Android TV release now starts a local HTTP/WebSocket hub inside the TV APK on port 4174. Room identity, host credentials and the controller token are stored in Android preferences per studio. QR pairing, state updates, acknowledgements and controller commands are handled directly between the TV and phone; no computer process or cloud service is required. The phone APK continues to scan the QR and uses the TV address returned in the link.

The TV APK compiled successfully with the local hub module, and its APK signature was verified. Output: `packages/BareFit-AndroidTV-0.4.0-direct.apk` and `C:\Users\tomer\Downloads\BareFit-TV\BareFit-TV-0.4.0-direct.apk` (SHA-256 `5E9AA58B7FDC7356D0AFA43CB22672F3F47D44C54C53DF23164F16FF54AE6311`). No physical Android TV or phone was attached in `adb devices`, so the final Wi-Fi/QR hardware check still needs to be performed at the studio.

## Automatic LAN address recovery

Phone and TV release-variant builds succeeded with the native discovery module (artifacts/android-discovery.log, artifacts/android-tv-discovery.log). Both APK signatures verified. The TV manifest includes multicast/Wi-Fi permissions. Packages, downloads, SHA256 records and the user's Downloads/BareFit-TV/BareFit-TV-0.3.0.apk were updated. These remain internally signed test APKs.

Android app checks the stored endpoint every 30 seconds in foreground. A failed identity/health check triggers a bounded eight-second native Android NSD scan for `_barefit._tcp`. HTTP verifies BareFit's service marker and stable hub ID before adopting an address. It pins the known service ID, does not select arbitrarily between multiple first-run services, and transfers both studios' stored host/coach credentials and coach preferences when the same service moves. It saves the new URL and reconnects transport without touching the timer engine. Native listeners, scan timeout and Wi-Fi multicast lock are cleaned up on completion and activity pause. Manual address entry remains available. Desktop/browser and iOS discovery are not implemented by this Android module.

Server advertises via bonjour-service and refreshes announcements after network-interface changes. `.runtime/hub-id` preserves identity across restart; `.runtime/rooms.json` continues to preserve pairing. The QR network endpoint now computes current addresses on request.

Verification: 39 automated tests passed, including persistent identity across restart/address change, rejecting a different known service, ambiguity, offline behavior and updated network URL metadata. Native TypeScript check passed. `node scripts/check-discovery.mjs` successfully received a real mDNS advertisement and verified its HTTP identity on 192.168.1.5. This exercises desktop multicast and HTTP, not Android's NSD runtime. No Android device was attached in `adb devices`; physical TV/phone NSD, router multicast and IP-renewal acceptance remain unverified. Reference APIs: https://developer.android.com/develop/connectivity/wifi/use-nsd and https://github.com/onlxltd/bonjour-service.

## Remote control fallback

Display commands run locally and do not require a coach connection or hub acknowledgement. Web arrow navigation now includes settings fields, selects and disclosure controls; up/down moves between fields, left/right retains native field editing, OK toggles checkboxes, and Escape/BrowserBack/GoBack closes overlays. Initial OK focuses the main start/pause button; held play/pause keys do not repeatedly toggle the clock. Native TV now prefers the main control and modal close button for focus, and handles media play/pause/stop once on key release, ignoring media actions while an app panel is open.

Verified with keyboard-only browser interaction on isolated static preview port 4176, with no hub service and no phone: start, pause, settings navigation, display checkbox change, volume adjustment, return/restore focus, stop confirmation, and selection of Tabata from the local library. Screenshot: artifacts/remote-offline-settings.jpg. The user's live studio session was not used for these commands. Web production build, native TypeScript check, and all 35 automated tests passed. Physical TV remote compatibility still requires device testing; browser key delivery depends on the TV browser.

## Current background: graffiti gym

Final quiet-logo background and remote-control changes included in successfully rebuilt phone and Android TV APKs. Both signatures verified; packages, dist/downloads and artifacts/apk-0.3-sha256.txt refreshed. Build logs: artifacts/android-remote.log and artifacts/android-tv-remote.log. Native runtime was not tested on hardware.

Current final image: public/assets/barefit-gym-quiet-logo.png. Removed the left hanging lamp and visual clutter in the photograph behind the header logo, creating a naturally shaded corner. Removed the solid black CSS logo badge. Prompt: artifacts/quiet-logo-background-prompt.txt. Web build passed; browser screenshot: artifacts/quiet-logo-display.jpg. Existing paused workout remained 18:56. Header logo artwork and timer logic unchanged.

Final logo-reference graffiti APKs rebuilt successfully for Android phone and Android TV; signatures verified and package/download files updated. Logs: artifacts/android-official-graffiti.log and artifacts/android-tv-official-graffiti.log. This asset update was not tested on physical native hardware.

Latest wall artwork follows the official website logo reference: two-tone green symbol with white Barefit lettering, rendered as sprayed stencil paint. Only the wall-art asset reference changed; header branding and timer behavior remain unchanged. Current file: public/assets/barefit-graffiti-official.png. Edit prompt: artifacts/official-graffiti-prompt.txt. Web build passed; screenshot: artifacts/official-graffiti-display.jpg. Paused workout retained 18:56.

Both Android phone and TV builds succeeded with the new gym background; APK signatures verified and downloadable files/checksums updated. Logs: artifacts/android-graffiti-gym.log and artifacts/android-tv-graffiti-gym.log. Native hardware runtime was not tested in this visual update.

Replaced the photo background in web and native views with `public/assets/barefit-graffiti-gym.png`, a generated 1672 x 940 gym interior with a BareFit graffiti word mural on the right. Proportional cover sizing fills the screen; the official web header icon remains unchanged. The original photographs remain available as source assets. Built-in image_gen prompt: artifacts/graffiti-gym-prompt.txt. Web build and native TypeScript check passed. Browser screenshot: artifacts/graffiti-gym-display.jpg; paused timer still 18:56. This is a background-only change; no timer logic was modified.

## Follow-up: preserve original shirt branding

Latest display adjustment: the original photograph now fills the background using proportional cover scaling in both web and native views, centered horizontally with a 40% vertical focal point. Wide screens crop the top and bottom instead of stretching the photo. The underlying original JPEG is unchanged. Web rendering verified with the paused workout still at 18:56; screenshot: artifacts/fullscreen-photo.jpg. Native TypeScript check passed.

Phone and TV APK builds with this full-screen adjustment succeeded and signatures verified; package/download files and checksums updated. Logs: artifacts/android-fullscreen-photo.log and artifacts/android-tv-fullscreen-photo.log. No physical-device runtime test was performed for this presentation-only update.

Both phone and TV APKs were rebuilt with the original photograph, their signatures verified and downloads updated. The JPEG inside each APK has exactly the same SHA256 as the supplied image. Build logs: artifacts/android-original-logo.log and artifacts/android-tv-original-logo.log.

The user rejected the generated shirt logos. Web and native backgrounds now use `public/assets/barefit-original.jpg`, a byte-identical copy of the supplied photograph (SHA256 `351835C27A6682B07D344477ECDE0B3930F21C2D7F6F20B8D56DA413C1F4798E`). The app scales the whole photograph proportionally on the right, retaining both prints' geometry, position and size relative to each shirt. The generated sunset asset is no longer the displayed background. Two image_gen correction drafts were rejected; prompts and decision: artifacts/original-logo-correction.txt. Browser screenshot: artifacts/original-shirt-logos.jpg. Native TypeScript check and production web build passed. No timer behavior changed.

The coach selects a studio on the phone; the local hub routes commands to that display; the display owns the timer and acknowledges changes. Phone preferences are restored when the display is online. Disconnecting the phone must not stop the display clock.

## Verified

- Both browser views and the native app include the requested “נוצר על ידי Tomer AI Studio” credit. Browser credit checked in display/hall and coach modes. Final native builds include this change.
- Android TV release APK built successfully: com.barefit.timer.tv, version 0.3.0 (3), min API 24, target API 36, all four architectures, LEANBACK_LAUNCHER, optional touchscreen, no camera/audio-recording permission. APK Signature Scheme v2 verification passed. Build initially ran out of disk space, then succeeded after free space became available; no project cleanup was performed.

- **35 automated tests pass.** Evidence: artifacts/stability-0.3-tests.log. Covers timer boundaries, pause/resume, safe paused recovery, invalid input, simulated 24-hour reference-clock comparison, 3/10-second countdown selection, sound cancellation, PCM audio duration, QR encode/decode, pairing/takeover, replay rejection, revocation, settings restoration and two-studio isolation.
- Accelerated endurance simulation: **72 hours per studio, two studios, 4,460,328 timer/cue updates**, 46 completed workouts, 74 pause/resume cycles, 34 snapshot recoveries and 562 missed-callback gaps. All independent remaining-time comparisons passed. Retained Node heap growth after garbage collection was 84,216 bytes. This is a shared-engine simulation lasting 0.385 real seconds, **not TV runtime or TV memory measurement**. Reproduce with `node --expose-gc scripts/endurance.mjs`; evidence: artifacts/endurance-0.3.json.
- Real temporary WebSocket hub and browser-compatible WebSocket clients: eight host/phone reconnections across eight simulated workout hours; acknowledgements and state updates recovered each time. Timer remained running, with one device record and no pending commands at the end. First reconnect deliberately exercises slow-send protection. The network connections are real; the eight-hour timer clock is accelerated.
- Two display engines connected to a real temporary WebSocket hub. Starting studio 1 did not start studio 2; changing studio 2 volume did not change studio 1. The first timer continued after coach disconnect. Duplicate studio hosts were rejected without replacing the working host. Reconnection emitted the correct host-online status.
- Native TypeScript check passed. Android phone release-variant Gradle build succeeded with bundled JavaScript, background, fonts and audio. Package com.barefit.timer, versionName 0.3.0, versionCode 3, min API 24, target API 36, ARM64/ARMv7/x86/x86_64. APK Signature Scheme v2 verification passed.
- Production web build passed, with modern/legacy bundles, offline assets and refreshed Tizen/webOS source directories. APK downloads are excluded from TV source packages and precaching.
- Final stability builds succeeded for both APKs with fresh Metro bundles (logs: artifacts/android-0.3-stability.log and artifacts/android-tv-0.3-stability.log). Both final APK v2 signatures verified; checksums: artifacts/apk-0.3-sha256.txt. Final web build log: artifacts/web-0.3-stability.log.
- Local hub restarted with the updated transport; health endpoint returned OK. The user's paused AMRAP workout remained at 18:56 before and after refreshing the display. Updated display shows the beach image, author credit and connected indicator. Screenshot: artifacts/stability-display-0.3.jpg.
- Browser end-to-end on an isolated temporary hub: selected studio 1 without approval, obtained controller role, resumed timer and observed the display counting, paused from coach, changed hall mode remotely and observed the display update, refreshed coach and verified connection/time/settings persisted. The user's own paused workout was not used for this exercise.
- Phone browser layout checked at 390 x 844. Existing display refreshed and retained its paused time. New beach background rendered; desktop circular timer offset leaves more room for the people.

## Corrections made

- Remaining workout time uses a cached suffix sum, eliminating repeated array creation and traversal on every display update.
- Slow WebSocket connections close before accumulating additional frames above a 256 KiB buffer threshold. Close code 4002 is valid for both browser clients and the server. Reconnect backoff resets only after authentication.
- Native periodic snapshots allow at most one pending periodic write. Native display retries initial hub connection failures every five seconds while its local clock continues.
- Android bundle inputs explicitly include the shared engine and public assets, preventing Gradle from reusing an outdated JavaScript bundle after shared-code changes. The configuration is preserved by an Expo plugin.
- Native display advertises current settings instead of captured initial values. Native coach reflects incoming settings; phone settings and credentials are scoped by studio. Native studio selection added.
- Phone implementations wait for a live display before restoring preferences, restore after host reconnect, and match acknowledgements to the relevant pending command.
- Closed connections ignore late events. Replaced hosts cannot broadcast. Conflicting studio authentication is rejected before modifying the host registry.
- Reusing a coach token restores control without adding duplicate devices.
- Old tests updated for latest-coach-takes-control and studio-aware QR. Very short final rounds prioritize the current spoken number; the last-round label remains visible. Longer final rounds announce last round before the ten-second countdown.

## Limits before customer/store release

- APKs use a development signing key for internal installation tests. Store distribution needs a production signing identity and release process.
- No physical Android phone, Android TV, iPhone, Apple TV, Samsung or LG was tested in this pass. No native installed-app/emulator runtime verification is claimed. Camera, room-speaker clarity, TV remote navigation, suspend/resume and actual full-day endurance need device acceptance testing.
- Browser tests exercise the shared engine/hub; they do not prove native UI behavior. Native switching/scanning still needs on-device checks.
- Remote control needs the local hub running and reachable on the studio LAN. A native display keeps time locally after coach/network disconnect. Android APKs cannot install on Apple, Samsung Tizen or LG webOS.
- iOS/tvOS compilation/signing needs macOS/Xcode. Tizen/webOS source folders were refreshed; older signed/installable artifacts were not rebuilt.
- HTTP LAN deployment is for the trusted studio network. The normal iPhone camera opens the pairing URL; in-page live camera needs a secure context. Native phone scanning uses camera permission.
- Hebrew speech is synthesized Microsoft Asaf. Cue timing/format was verified, not subjective pronunciation through studio speakers.

## Physical-TV acceptance run still required

Install the TV test APK on the actual Android/Google TV, connect the studio hub and coach, and leave the app foreground for 8–24 hours with repeated workouts. Check the display and audio at the start, after several hours and at the end; disconnect/reconnect the coach and Wi-Fi between checks, then confirm control resumes and the clock has continued. Test both studios simultaneously. Verify the television's own sleep/energy settings as well as the app's keep-awake behavior. These steps have not been performed here; the automated results cannot guarantee that every television will never crash.

Phone audio routing and locked-screen phone playback were left aside at the user's request; neither is claimed as implemented.

Background edited with built-in image_gen. Prompt: artifacts/background-design-prompt.txt. New asset: public/assets/barefit-beach.png. Original background preserved.
