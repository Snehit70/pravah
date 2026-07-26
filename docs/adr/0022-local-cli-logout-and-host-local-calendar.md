---
status: accepted
---

# Local CLI logout and host-local calendar

`pravah auth logout` removes only the credential stored on the current machine; remote credential revocation is a separate future operation. Today, date filters, the 14-day planning horizon, and human date rendering use the CLI host's local timezone, matching Pravah's existing local-date behavior.

## Considered options

- **Make logout revoke remotely.** Rejected because a routine local cleanup must not silently disable another intended automation environment.
- **Use UTC or require per-command timezones.** Rejected because terminal planning should follow the operator's local calendar without repeated configuration.
