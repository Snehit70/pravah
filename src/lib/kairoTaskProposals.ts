export type KairoTaskProposalStatus =
  | "pending"
  | "applying"
  | "applied"
  | "declined"
  | "failed";

export interface KairoTaskProposal {
  title: string;
  scheduledDate: string | null;
  type: "open" | "deadline";
  status: KairoTaskProposalStatus;
  error?: string;
}

export interface ParsedKairoTaskProposals {
  text: string;
  proposals: KairoTaskProposal[];
}

export function updateKairoTaskProposal(
  proposals: KairoTaskProposal[],
  proposalIndex: number,
  patch: Partial<KairoTaskProposal>
) {
  return proposals.map((proposal, index) =>
    index === proposalIndex ? { ...proposal, ...patch } : proposal
  );
}

export function parseKairoTaskProposals(rawText: string): ParsedKairoTaskProposals {
  const proposals: KairoTaskProposal[] = [];
  const text = rawText
    .replace(/<add-task>([\s\S]*?)<\/add-task>/g, (_, json: string) => {
      try {
        const parsed = JSON.parse(json) as {
          title?: unknown;
          scheduledDate?: unknown;
          type?: unknown;
        };
        const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
        if (!title) return "";

        proposals.push({
          title,
          scheduledDate:
            typeof parsed.scheduledDate === "string" ? parsed.scheduledDate : null,
          type: parsed.type === "deadline" ? "deadline" : "open",
          status: "pending",
        });
      } catch {
        // Malformed model output is ignored rather than exposed as an action.
      }
      return "";
    })
    .trim();

  return { text, proposals };
}
