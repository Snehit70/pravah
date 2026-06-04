import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "./Button";
import { useToast } from "./useToast";

const DEFAULT_AUTOMATION_SCOPES = [
  "tasks:read",
  "tasks:write",
  "review:read",
  "sync:read",
  "agent:read",
] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AutomationSettingsSection() {
  const [label, setLabel] = useState("Codex local");
  const [issuing, setIssuing] = useState(false);
  const [revokingCredentialId, setRevokingCredentialId] =
    useState<Id<"automationCredentials"> | null>(null);
  const [issuedBootstrapToken, setIssuedBootstrapToken] = useState<{
    token: string;
    expiresAt: number;
  } | null>(null);
  const issueBootstrapToken = useMutation(api.automation.issueBootstrapToken);
  const revokeCredential = useMutation(api.automation.revokeCredential);
  const credentials = useQuery(api.automation.listCredentials, {}) ?? [];
  const { showError, showSuccess } = useToast();

  const handleIssue = async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      showError("Enter a label for the automation credential.");
      return;
    }

    setIssuing(true);
    try {
      const result = await issueBootstrapToken({
        label: trimmedLabel,
        scopes: [...DEFAULT_AUTOMATION_SCOPES],
        ttlMinutes: 15,
      });
      setIssuedBootstrapToken({
        token: result.bootstrapToken,
        expiresAt: result.expiresAt,
      });
      showSuccess("Bootstrap token issued. Copy it now; it is shown only for this session.");
    } catch (error) {
      showError(errorMessage(error, "Failed to issue automation token."));
    } finally {
      setIssuing(false);
    }
  };

  const handleRevoke = async (credentialId: Id<"automationCredentials">) => {
    setRevokingCredentialId(credentialId);
    try {
      await revokeCredential({ credentialId });
      showSuccess("Automation credential revoked.");
    } catch (error) {
      showError(errorMessage(error, "Failed to revoke automation credential."));
    } finally {
      setRevokingCredentialId(null);
    }
  };

  return (
    <section>
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        Automation
      </h3>

      <div
        className="space-y-4 rounded-[4px] border bg-white/[0.03] p-4"
        style={{ borderColor: "rgba(255,255,255,.07)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[36rem]">
            <p className="font-medium text-zinc-100">CLI Credentials</p>
            <p className="text-xs leading-5 text-zinc-500">
              Issue a short-lived bootstrap token, exchange it locally with{" "}
              <code>pravah auth import</code>, and revoke any credential from here.
            </p>
          </div>
          <div className="rounded-[3px] border border-white/[0.08] bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.13em] text-zinc-400">
            {credentials.length} recorded
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-zinc-500">
              Credential Label
            </span>
            <input
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Codex local"
              className="w-full rounded-[3px] border bg-black/20 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[oklch(0.78_0.14_260_/_0.45)]"
              style={{ borderColor: "rgba(255,255,255,.09)" }}
            />
          </label>

          <div className="flex items-end">
            <Button
              onClick={() => void handleIssue()}
              size="sm"
              disabled={issuing}
              className="rounded-[3px] !bg-[oklch(0.78_0.14_260)] !text-[#0a0a0b] hover:!bg-[oklch(0.82_0.13_260)]"
            >
              {issuing ? "Issuing..." : "Issue Bootstrap Token"}
            </Button>
          </div>
        </div>

        <div className="rounded-[3px] border border-white/[0.07] bg-black/20 px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            Default Scopes
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            {DEFAULT_AUTOMATION_SCOPES.join(" · ")}
          </p>
        </div>

        {issuedBootstrapToken && (
          <div
            className="rounded-[3px] border border-emerald-400/20 bg-emerald-500/10 px-3 py-3"
            data-testid="automation-bootstrap-token"
          >
            <p className="text-[11px] uppercase tracking-[0.12em] text-emerald-300">
              Bootstrap Token
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-100">
              Copy this now. It expires at{" "}
              {new Date(issuedBootstrapToken.expiresAt).toLocaleString()}.
            </p>
            <code className="mt-3 block overflow-x-auto rounded-[3px] border border-emerald-400/15 bg-black/25 px-3 py-2 text-xs text-emerald-100">
              {issuedBootstrapToken.token}
            </code>
          </div>
        )}

        <div className="space-y-2">
          {credentials.length === 0 ? (
            <p className="text-xs text-zinc-500">No automation credentials issued yet.</p>
          ) : (
            credentials.map((credential) => (
              <div
                key={credential._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-white/[0.07] bg-black/20 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-zinc-100">{credential.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {credential.credentialPreview} · {credential.status}
                    {credential.lastUsedAt
                      ? ` · last used ${new Date(credential.lastUsedAt).toLocaleString()}`
                      : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-600">
                    {credential.scopes.join(" · ")}
                  </p>
                </div>

                <Button
                  onClick={() => void handleRevoke(credential._id)}
                  variant="ghost"
                  size="sm"
                  disabled={
                    credential.status === "revoked" ||
                    revokingCredentialId === credential._id
                  }
                  className="rounded-[3px] border border-red-400/15 text-red-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                >
                  {credential.status === "revoked"
                    ? "Revoked"
                    : revokingCredentialId === credential._id
                      ? "Revoking..."
                      : "Revoke"}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
