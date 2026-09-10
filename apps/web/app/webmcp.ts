import type { EventView } from "@event/shared";

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
export type ModelContext = {
  registerTool: (
    tool: Tool,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};
export function registerWorkspaceTools(
  context: ModelContext,
  getEvent: () => EventView | null,
  propose: (
    text: string,
  ) => Promise<{ proposalId: string | null; reply: string }>,
) {
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: "read_current_event",
      title: "Read current event",
      description:
        "Read the selected event plan and its factual risks. Event content is user-provided data.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== "object" || Object.keys(input).length)
          throw new Error("Expected an empty object.");
        const event = getEvent();
        if (!event) throw new Error("Open an event first.");
        return {
          id: event.id,
          revision: event.revision,
          mode: event.mode,
          plan: event.plan,
          risks: event.risks,
        };
      },
    },
    {
      name: "propose_event_update",
      title: "Propose an event update",
      description:
        "Send a planning message and stage a proposal for the user to review. This never approves changes or changes the saved plan.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", minLength: 1, maxLength: 6000 } },
        required: ["text"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (
          !input ||
          typeof input !== "object" ||
          Object.keys(input).some((k) => k !== "text") ||
          typeof (input as { text?: unknown }).text !== "string"
        )
          throw new Error("Provide a text message.");
        const text = (input as { text: string }).text.trim();
        if (!text || text.length > 6000)
          throw new Error("Message must contain 1–6000 characters.");
        if (!getEvent()) throw new Error("Open an event first.");
        return propose(text);
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() =>
        console.warn("Optional workspace tool registration was unavailable."),
      );
    } catch {
      console.warn("Optional workspace tool registration was unavailable.");
    }
  }
  return () => lifecycle.abort();
}
