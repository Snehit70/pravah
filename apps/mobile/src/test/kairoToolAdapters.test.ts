import { describe, expect, it } from "vitest";
import {
  buildToolRequestBody,
  extractToolCalls,
  type AgentTurn,
} from "../lib/kairoApi";
import type { KairoConfig } from "../lib/kairoConfig";

function makeConfig(providerFormat: KairoConfig["providerFormat"]): KairoConfig {
  return {
    providerFormat,
    apiKey: "key",
    baseUrl: "https://example.test",
    model: "test-model",
  };
}

describe("extractToolCalls", () => {
  it("reads text + tool_use blocks from an Anthropic response", () => {
    const data = {
      content: [
        { type: "text", text: "Looking at Thursday." },
        { type: "tool_use", id: "tu_1", name: "get_tasks_in_range", input: { startDate: "2026-06-04", endDate: "2026-06-04" } },
      ],
    };
    const { text, toolCalls } = extractToolCalls(data, "anthropic");
    expect(text).toBe("Looking at Thursday.");
    expect(toolCalls).toEqual([
      { id: "tu_1", name: "get_tasks_in_range", args: { startDate: "2026-06-04", endDate: "2026-06-04" } },
    ]);
  });

  it("reads tool_calls and parses the JSON arguments string from OpenAI", () => {
    const data = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "call_9", type: "function", function: { name: "complete_task", arguments: '{"handle":"T2"}' } },
            ],
          },
        },
      ],
    };
    const { text, toolCalls } = extractToolCalls(data, "openai");
    expect(text).toBe("");
    expect(toolCalls).toEqual([{ id: "call_9", name: "complete_task", args: { handle: "T2" } }]);
  });

  it("reads functionCall parts from Gemini and synthesizes an id", () => {
    const data = {
      candidates: [
        {
          content: {
            parts: [
              { text: "On it." },
              { functionCall: { name: "reschedule_task", args: { handle: "T1", scheduledDate: "2026-06-05" } } },
            ],
          },
        },
      ],
    };
    const { text, toolCalls } = extractToolCalls(data, "gemini");
    expect(text).toBe("On it.");
    expect(toolCalls).toEqual([
      { id: "reschedule_task-0", name: "reschedule_task", args: { handle: "T1", scheduledDate: "2026-06-05" } },
    ]);
  });

  it("returns empty results for a non-object response", () => {
    expect(extractToolCalls(null, "anthropic")).toEqual({ text: "", toolCalls: [] });
    expect(extractToolCalls("oops", "openai")).toEqual({ text: "", toolCalls: [] });
  });

  it("drops a malformed OpenAI arguments string to empty args without throwing", () => {
    const data = {
      choices: [
        { message: { tool_calls: [{ id: "c1", function: { name: "get_inbox", arguments: "{not json" } }] } },
      ],
    };
    const { toolCalls } = extractToolCalls(data, "openai");
    expect(toolCalls).toEqual([{ id: "c1", name: "get_inbox", args: {} }]);
  });
});

describe("buildToolRequestBody", () => {
  const turns: AgentTurn[] = [
    { role: "user", text: "What's Thursday?" },
    {
      role: "assistant",
      text: "",
      toolCalls: [{ id: "tu_1", name: "get_tasks_in_range", args: { startDate: "2026-06-04", endDate: "2026-06-04" } }],
    },
    { role: "tool", results: [{ id: "tu_1", name: "get_tasks_in_range", content: '{"tasks":[]}' }] },
  ];

  it("serializes the Anthropic envelope with system, tools, and tool_use/tool_result pairing", () => {
    const tools = [{ name: "get_inbox" }];
    const body = buildToolRequestBody(makeConfig("anthropic"), "SYS", tools, turns);
    expect(body.system).toBe("SYS");
    expect(body.tools).toBe(tools);
    expect(body.max_tokens).toBe(1024);
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({ role: "user", content: "What's Thursday?" });
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "tool_use", id: "tu_1", name: "get_tasks_in_range", input: { startDate: "2026-06-04", endDate: "2026-06-04" } },
      ],
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu_1", content: '{"tasks":[]}' }],
    });
  });

  it("serializes the OpenAI envelope with a leading system message and role:tool results", () => {
    const body = buildToolRequestBody(makeConfig("openai"), "SYS", [], turns);
    expect(body.max_completion_tokens).toBe(1024);
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "tu_1", type: "function", function: { name: "get_tasks_in_range", arguments: '{"startDate":"2026-06-04","endDate":"2026-06-04"}' } },
      ],
    });
    expect(messages[3]).toEqual({ role: "tool", tool_call_id: "tu_1", content: '{"tasks":[]}' });
  });

  it("serializes the Gemini envelope with systemInstruction and functionCall/functionResponse parts", () => {
    const body = buildToolRequestBody(makeConfig("gemini"), "SYS", [], turns);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "SYS" }] });
    const contents = body.contents as Array<Record<string, unknown>>;
    expect(contents[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "get_tasks_in_range", args: { startDate: "2026-06-04", endDate: "2026-06-04" } } }],
    });
    expect(contents[2]).toEqual({
      role: "user",
      parts: [{ functionResponse: { name: "get_tasks_in_range", response: { result: '{"tasks":[]}' } } }],
    });
  });
});
