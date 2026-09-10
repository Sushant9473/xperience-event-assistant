import { describe, it, expect } from "vitest";
import { emptyPlan, type EventView } from "@event/shared";
import {
  registerWorkspaceTools,
  type ModelContext,
} from "../../web/app/webmcp.js";

describe("optional workspace tool contract", () => {
  it("reads selected state and stages messages without exposing approval", async () => {
    const tools: Parameters<ModelContext["registerTool"]>[0][] = [];
    const signals: AbortSignal[] = [];
    const context: ModelContext = {
      registerTool(tool, options) {
        tools.push(tool);
        signals.push(options!.signal!);
      },
    };
    let selected: EventView | null = null;
    let received = "";
    const dispose = registerWorkspaceTools(
      context,
      () => selected,
      async (text) => {
        received = text;
        return { proposalId: "proposal-1", reply: "Review this change." };
      },
    );
    expect(tools.map((t) => t.name)).toEqual([
      "read_current_event",
      "propose_event_update",
    ]);
    expect(() => tools[0].execute({})).toThrow("Open an event");
    selected = {
      id: "event-1",
      ownerId: "user-1",
      mode: "demo",
      revision: 0,
      plan: emptyPlan(),
      messages: [],
      proposals: [],
      history: [],
      risks: [],
      createdAt: "",
      updatedAt: "",
    };
    expect(tools[0].execute({})).toMatchObject({ id: "event-1", revision: 0 });
    const result = await tools[1].execute({ text: "  Add a task  " });
    expect(result).toEqual({
      proposalId: "proposal-1",
      reply: "Review this change.",
    });
    expect(received).toBe("Add a task");
    expect(selected.revision).toBe(0);
    await expect(tools[1].execute({ text: "" })).rejects.toThrow("1–6000");
    await expect(
      tools[1].execute({ text: "ok", approve: true }),
    ).rejects.toThrow("Provide");
    dispose();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});
