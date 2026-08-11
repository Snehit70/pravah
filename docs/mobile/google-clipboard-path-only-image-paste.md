# Google Clipboard path-only image paste

Status: diagnosed and guarded in the mobile Task-image flow.

Date: 2026-08-10

## Symptom

On the Android development build, choosing `Paste` from the Task-image source
chooser did not produce an image. The draft briefly created a preparing image
entry and then showed a failed image placeholder with copy equivalent to:

- `THE SELECTED IMAGE IS NO LONGER AVAILABLE.`
- `Image could not be prepared`

The failure occurred in Capture and edit Task-image flows. It was initially
unclear whether the cause was Cloudinary configuration, Convex deployment, or
image normalization.

## Reproduction

1. Connect the Android phone to the development environment.
2. Open Pravah and open Capture.
3. Tap `Add a visual reference`.
4. Choose `Paste`.
5. Observe that no image is acquired and the previous implementation leaves a
   failed placeholder.

The reproduction was performed with the phone connected over ADB. The active
development package was `com.pravah.mobile.dev`.

## Device evidence

After clearing logcat and reproducing the failure, the mobile runtime reported
the equivalent of:

```text
[DEBUG-CLIPBOARD] requesting image payload
[DEBUG-CLIPBOARD] result empty
[DEBUG-CLIPBOARD] fallback text {
  length: 127,
  prefix: 'file:///home/snehit/.codex/generated_images/019fea46-aaeb-7840-b296-b3f4ae829049/...'
}
```

The diagnostic logging was temporary and was removed after the cause was
confirmed. The important facts are:

1. `expo-clipboard` returned no image payload from
   `getImageAsync({ format: "png" })`.
2. The fallback clipboard string was a `file:///home/snehit/...` URI pointing
   to the laptop filesystem.
3. The phone cannot read the laptop's `/home/snehit` filesystem.
4. No Cloudinary upload or callback verification was involved in this failure.

## Root cause

This is a cross-device clipboard representation problem, not a Cloudinary or
Convex problem.

There are two materially different clipboard cases:

### Android-readable image clipboard content

An Android app can paste an image when the clipboard contains image bytes or an
Android-readable image URI, normally with an `image/*` MIME description or a
readable `content://` URI. The app can then read, normalize, stage, and upload
the image.

### Google cross-device clipboard path text

In this reproduction, Google Clipboard synchronized only the text reference
created by the source application:

```text
file:///home/snehit/.codex/generated_images/...
```

That string identifies a file on the laptop. It is not the image bytes and it
is not a URI that Android can resolve. A normal Android paste API cannot turn
that inaccessible laptop path into image data.

Some applications may appear to support this workflow because they provide
their own desktop-to-phone bridge, cloud-backed source integration, or special
handling for the source application. Standard Android clipboard access alone
does not provide that bridge.

## Correct boundary

Pravah should support:

- image bytes supplied by the Android clipboard;
- an Android-readable image URI supplied by the clipboard;
- Photos and Camera sources through the existing native pickers.

Pravah must not pretend that a laptop-local `file://` path is readable on the
phone, nor should it send that path to Cloudinary or expose it in the persisted
manifest.

## Implemented guard

The mobile source acquisition path now:

1. Attempts to read image data from the clipboard.
2. If no image is available, checks whether the text clipboard is a local file
   reference.
3. Classifies a local file reference as `clipboard_reference_only`.
4. Removes the temporary preparing record instead of leaving a broken image
   tile.
5. Shows a bounded user-facing message:

   > Clipboard contains a file reference, not image data. Copy the image itself
   > and paste again.

Real failures after an image has been acquired still retain the existing
retryable placeholder and upload-recovery behavior.

## What would be required to make laptop paths work

Making a laptop-local path pasteable on the phone would be a separate
cross-device transfer feature. It would require an explicit, authenticated
bridge that can read the laptop file and transfer it to the phone, for example
through a local-network service or a cloud-backed handoff. That is outside the
current Task-image storage contract and should not be silently introduced into
the paste action.

## Validation

The guard was validated with:

- focused Task-image coordinator and filmstrip tests: 57 tests passed;
- mobile TypeScript typecheck: passed;
- `git diff --check`: passed.

The physical-device logcat reproduction is the evidence for the clipboard
representation. The focused automated tests cover the safe failure code and
the removal of the pre-acquisition placeholder.
