import type { KairoTaskProposal } from "../lib/kairoTaskProposals";

const ACCENT = "oklch(0.78 0.14 260)";

interface KairoTaskProposalListProps {
  proposals: KairoTaskProposal[];
  onDecision: (proposalIndex: number, decision: "apply" | "decline") => void;
}

function statusText(proposal: KairoTaskProposal) {
  switch (proposal.status) {
    case "applying":
      return "Adding...";
    case "applied":
      return "Added";
    case "declined":
      return "Cancelled";
    case "failed":
      return proposal.error ?? "Could not add task";
    default:
      return null;
  }
}

export function KairoTaskProposalList({
  proposals,
  onDecision,
}: KairoTaskProposalListProps) {
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {proposals.map((proposal, index) => {
        const status = statusText(proposal);
        return (
          <div
            key={`${proposal.title}-${proposal.deadline ?? "inbox"}-${index}`}
            style={{
              padding: "8px 10px",
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.07)",
              borderLeft: `2px solid ${ACCENT}`,
              borderRadius: 3,
              color: "#c2c2c8",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
          >
            <div>
              {proposal.title} {proposal.deadline ? `→ ${proposal.deadline}` : "→ inbox"}
            </div>
            {proposal.status === "pending" ? (
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <button
                  type="button"
                  onClick={() => onDecision(index, "apply")}
                  style={actionButtonStyle(true)}
                >
                  Add task
                </button>
                <button
                  type="button"
                  onClick={() => onDecision(index, "decline")}
                  style={actionButtonStyle(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                style={{
                  color: proposal.status === "failed" ? "#f0a0a0" : "#777780",
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                  marginTop: 5,
                }}
              >
                {status}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function actionButtonStyle(primary: boolean): React.CSSProperties {
  return {
    background: primary ? ACCENT : "transparent",
    border: primary ? "none" : "1px solid rgba(255,255,255,.14)",
    borderRadius: 3,
    color: primary ? "#0a0a0b" : "#a8a8ae",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 8px",
  };
}
