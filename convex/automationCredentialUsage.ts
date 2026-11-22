// Each usage write patches the credential and inserts an audit event. At five
// minutes this was the largest source of DB writes (Nov 20-22 2026 telemetry),
// driven by watcher token renewals and CLI calls. "Last used" is therefore
// accurate to within an hour.
export const CREDENTIAL_USAGE_WRITE_INTERVAL_MS = 60 * 60 * 1000;

export function credentialNeedsUsageWrite(lastUsedAt: number | undefined, now: number) {
  return lastUsedAt === undefined || now - lastUsedAt >= CREDENTIAL_USAGE_WRITE_INTERVAL_MS;
}
