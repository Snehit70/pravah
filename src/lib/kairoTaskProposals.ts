export type KairoTaskProposalStatus =
  | "pending"
  | "applying"
  | "applied"
  | "declined"
  | "failed";

export interface KairoTaskProposal {
  title: string;
  deadline: string | null;
  status: KairoTaskProposalStatus;
  error?: string;
}

export interface ParsedKairoTaskProposals {
  text: string;
  proposals: KairoTaskProposal[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TASK_TITLE_LENGTH = 500;

function readTaskTitle(value: unknown) {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title && title.length <= MAX_TASK_TITLE_LENGTH ? title : null;
}

function readDeadline(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const date = value.trim();
  return DATE_PATTERN.test(date) ? date : undefined;
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
          deadline?: unknown;
        };
        const title = readTaskTitle(parsed.title);
        const deadline = readDeadline(parsed.deadline);
        if (!title || deadline === undefined) return "";

        proposals.push({
          title,
          deadline,
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
