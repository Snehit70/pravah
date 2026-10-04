# Android keyboard image paste

Date: 2026-10-04

## Intended interaction

Tap an image in Gboard's clipboard while a Task title or Notes field is focused.
The image appears in that Task's visual references. Capture prepares the image
and uploads after the Task is saved. An existing Task attaches and starts its
upload immediately. Text paste keeps its usual behavior. Copying an image alone
does not attach it.

## Findings

- The physical phone runs Android 13, API 33. The focused Pravah capture input
  reported `contentMimeTypes=null` through `adb shell dumpsys input_method`.
  A repeatable check of that field failed before implementation.
- Keyboard image insertion uses a content URI and the input's advertised MIME
  types. Reading the system clipboard is a different operation, and need not
  return the keyboard's image. [Android image keyboard API](https://developer.android.com/develop/ui/views/touch-and-input/image-keyboard)
- React Native 0.85.3's installed `ReactEditText.kt` extends `AppCompatEditText`
  and delegates `onCreateInputConnection` and text-context-menu actions to its
  parent. The installed AppCompat 1.7.1 bytecode confirms receive-content support.
  This allows a listener on the existing field, preserving React Native editing,
  selection, accessibility, styling, and layout. Rebuilding React Native or
  replacing the text field is unnecessary.
- `ViewCompat.setOnReceiveContentListener` handles keyboard insertion, clipboard
  menu paste, and drag/drop. Returning the unhandled part of the payload preserves
  ordinary text input. [Android receive-content guide](https://developer.android.com/develop/ui/views/receive-rich-content),
  [AppCompat implementation](https://github.com/androidx/androidx/blob/androidx-main/appcompat/appcompat/src/main/java/androidx/appcompat/widget/AppCompatEditText.java)
- URI permissions belong to the received payload. Background copying must keep
  a reference to that payload until copying completes. Persistent storage grants
  are not assumed. [Android URI permission guidance](https://developer.android.com/develop/ui/views/receive-rich-content#uri_permissions)
- Local Expo modules are automatically linked from the app's `modules` directory.
  Functions that configure views must run on the main UI queue. A native rebuild
  is required. [Expo local modules](https://docs.expo.dev/workflow/customizing/),
  [Expo module functions](https://docs.expo.dev/modules/module-api/)

## Implementation boundaries

`PravahImageInput` registers an image receiver only on eligible Task inputs.
It copies the received URI into app cache on an IO thread, limits each source
to 20 MiB, and sends a session-scoped event. The existing normalization and
upload coordinator receives that exact file rather than rereading the clipboard.
Temporary keyboard files are removed after normalization or cancellation.

Registrations are revoked when a field closes, changes Task, switches to Goal
capture, or becomes unavailable. Late image results cannot update a different
Task's inspector. Completed Tasks and bulk capture do not accept keyboard images.
The existing image-count, format, pixel, staging, and upload checks remain active.

The earlier clipboard patch broadens the explicit source chooser's Paste action
to scan multiple clipboard items. It does not implement keyboard insertion by
itself. Its Android publication metadata is removed to compile the patch from
source rather than using Expo's prebuilt artifact.

The August path-only clipboard diagnosis remains valid for its recorded case.
It does not establish what Gboard sends when a thumbnail is tapped. An unreadable
laptop-local `file://` string still needs a real transfer of image bytes.

## Validation commands

From `apps/mobile`:

```sh
bun run typecheck:fast
bunx --no-install vitest run src/test/taskImageCoordinator.test.ts src/test/taskImagePasteInput.test.tsx src/test/addTaskSheet.test.tsx src/test/editTaskSheet.test.tsx --maxWorkers=1
```

Native validation from `apps/mobile/android`:

```sh
./gradlew :pravah-image-input:compileDebugKotlin :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --console=plain
```

On the phone, validate Capture and an existing Task through title and Notes:
image preview, upload completion, text paste, image-limit feedback, and closing
or switching while an image is being prepared.
