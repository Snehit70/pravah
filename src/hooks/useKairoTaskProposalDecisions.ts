import { useRef, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  type KairoTaskProposal,
  updateKairoTaskProposal,
  type KairoCapabilityMessage,
} from "../lib/kairoCapability";

export type WebKairoMessage = KairoCapabilityMessage;

function updateMessageProposal(
  messages: WebKairoMessage[],
  messageIndex: number,
  proposalIndex: number,
  patch: Partial<KairoTaskProposal>
) {
  return messages.map((message, index) =>
    index === messageIndex && message.tasks
      ? { ...message, tasks: updateKairoTaskProposal(message.tasks, proposalIndex, patch) }
      : message
  );
}

export function useKairoTaskProposalDecisions(
  messages: WebKairoMessage[],
  setMessages: Dispatch<SetStateAction<WebKairoMessage[]>>
) {
  const applyingProposals = useRef(new Set<string>());
  const addTask = useMutation(api.tasks.addTask);

  return async (
    messageIndex: number,
    proposalIndex: number,
    decision: "apply" | "decline"
  ) => {
    const proposal = messages[messageIndex]?.tasks?.[proposalIndex];
    if (!proposal || proposal.status !== "pending") return;

    const proposalKey = `${messageIndex}:${proposalIndex}`;
    if (decision === "decline") {
      setMessages((current) =>
        updateMessageProposal(current, messageIndex, proposalIndex, {
          status: "declined",
        })
      );
      return;
    }
    if (applyingProposals.current.has(proposalKey)) return;

    applyingProposals.current.add(proposalKey);
    setMessages((current) =>
      updateMessageProposal(current, messageIndex, proposalIndex, {
        status: "applying",
      })
    );

    try {
      await addTask({
        title: proposal.title,
        deadline: proposal.deadline ?? undefined,
        source: "ai-agent",
      });
      setMessages((current) =>
        updateMessageProposal(current, messageIndex, proposalIndex, {
          status: "applied",
        })
      );
    } catch (error) {
      setMessages((current) =>
        updateMessageProposal(current, messageIndex, proposalIndex, {
          status: "failed",
          error: error instanceof Error ? error.message : "Could not add task",
        })
      );
    } finally {
      applyingProposals.current.delete(proposalKey);
    }
  };
}
