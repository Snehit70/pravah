# Release-phone upload failure, 2026-10-05

## Reproduced cause

The connected release phone repeatedly received Cloudinary HTTP 401 (`provider_auth`) on fresh Retry attempts. Transfers failed after roughly two seconds, before result submission. The app was running an OTA update on native-5; the update ID was present in diagnostics, despite About displaying APK 3.0.22 as the running version.

A direct provider probe using production credentials and intentionally invalid image bytes reproduced HTTP 401 Invalid Signature with the existing grant. Removing `signature_algorithm` from both the upload fields and signed payload changed the response to HTTP 400 file validation. No asset was created by these probes. This isolates the failure to signing rather than connectivity, credentials or grant expiry.

`signature_algorithm` is SDK configuration, not an upload field. The request still uses SHA-256; response verification already accepts independently verified SHA-1 or SHA-256 digests. Reference: [Cloudinary SDK signing code](https://github.com/cloudinary/cloudinary_npm/blob/master/lib/utils/index.js), [authentication signatures](https://cloudinary.com/documentation/authentication_signatures).

## Fix and device evidence

Removed the unsupported field from `buildUploadGrant`. The exact grant regression failed before the change and passed afterward. Deployed to canonical `combative-zebra-261` for the authorized phone verification.

The affected saved image then uploaded on attempt 11:

- Provider transfer: HTTP 200, 3,243 ms.
- Backend receipt confirmation: 196 ms, state verifying.
- Backend readiness: both variants verified approximately 4.4 seconds after provider HTTP receipt, about 8.5 seconds from retry start.
- Card: WebP 640 × 360, 33,984 bytes; detail: WebP 1600 × 900, 158,190 bytes.
- Production record: ready, no failure code.
- Reopened after force-stopping and relaunching the release app: ready image persists; upload/error indicators absent. Full-screen viewer opens.

These are one real image measurements, not a general latency guarantee.

## Additional device findings

Ready preview rendering combined absolute positioning with a fixed 120px height. That clipped the image and left much of the Edit hero blank. The image now fills its parent frame. The actual Edit preview regression observes the rendered style and failed at 120px before the fix.

Running release display preferred an inlined environment value that was stale at 3.0.22. Prefer the active update manifest version, then the injected bundle version and finally the native APK version. Diagnostics use the same resolver. Both client fixes need the next OTA to be verified on the release phone; the backend signing fix is already verified there.
