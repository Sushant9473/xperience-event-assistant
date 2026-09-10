import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyPlan,
  newTask,
  type EventRecord,
  type Operation,
} from "@event/shared";

const fake = vi.hoisted(() => ({ text: "", generate: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: fake.generate };
  },
}));
import { buildAssistantContext, makeAssistant } from "../src/ai.js";

const event: EventRecord = {
  id: "test-event",
  ownerId: "test-user",
  mode: "live",
  revision: 0,
  plan: emptyPlan({ title: "Adapter test", guestCount: 20 }),
  messages: [],
  proposals: [],
  history: [],
  createdAt: "",
  updatedAt: "",
};
beforeEach(() => {
  fake.generate.mockReset();
  fake.generate.mockImplementation(async () => ({ text: fake.text }));
});
describe("Gemini adapter validation", () => {
  it("uses rejected proposal status and saved state instead of earlier assistant claims", async () => {
    const retry = structuredClone(event);
    const operation: Operation = {
      entity: "task",
      action: "upsert",
      data: newTask("transport", "Confirm transport", { priority: "high" }),
      reason: "Requested task",
    };
    retry.proposals = [
      {
        id: "rejected-proposal",
        status: "rejected",
        baseRevision: 0,
        operations: [operation],
        changes: [],
        createdAt: "",
      },
    ];
    retry.messages = [
      { id: "u1", role: "user", text: "Add Confirm transport", createdAt: "" },
      {
        id: "a1",
        role: "assistant",
        text: "I've added Confirm transport to your plan.",
        proposalId: "rejected-proposal",
        createdAt: "",
      },
      {
        id: "a2",
        role: "assistant",
        text: "You already have that task.",
        createdAt: "",
      },
      {
        id: "a3",
        role: "assistant",
        text: "Which date?",
        questions: ["Which date?"],
        createdAt: "",
      },
    ];
    fake.text = JSON.stringify({
      reply: "Review a fresh proposal.",
      questions: [],
      operations: [operation],
    });
    await makeAssistant("fake-test-key")(retry, "Add Confirm transport again.");
    const request = fake.generate.mock.calls[0][0];
    const context = JSON.parse(request.contents);
    expect(context.currentPlan.tasks).toEqual([]);
    expect(context.proposalHistory[0].status).toBe("rejected");
    expect(context.proposalHistory[0].operations[0].data.title).toBe(
      "Confirm transport",
    );
    expect(request.contents).not.toContain("I've added");
    expect(request.contents).not.toContain("You already have");
    expect(context.recentConversation).toContainEqual({
      role: "assistant",
      text: "Which date?",
    });
    expect(retry.proposals[0].status).toBe("rejected");
    expect(retry.plan.tasks).toEqual([]);
  });
  it("keeps saved records authoritative and distinguishes pending from stale proposals", () => {
    const saved = structuredClone(event);
    saved.plan.tasks = [newTask("saved-task", "Confirmed task")];
    saved.revision = 2;
    saved.proposals = [
      {
        id: "approved",
        status: "approved",
        baseRevision: 0,
        operations: [],
        changes: [],
        createdAt: "",
      },
      {
        id: "stale",
        status: "pending",
        baseRevision: 1,
        operations: [],
        changes: [],
        createdAt: "",
      },
      {
        id: "current",
        status: "pending",
        baseRevision: 2,
        operations: [],
        changes: [],
        createdAt: "",
      },
    ];
    const context = buildAssistantContext(saved, "What is saved?");
    expect(context.currentPlan.tasks).toEqual(saved.plan.tasks);
    expect(context.proposalHistory.map((p) => [p.status, p.stale])).toEqual([
      ["approved", false],
      ["pending", true],
      ["pending", false],
    ]);
  });
  it("accepts a valid proposal without applying it to the event", async () => {
    fake.text = JSON.stringify({
      reply: "Review this update.",
      questions: [],
      operations: [
        {
          entity: "event",
          data: { guestCount: 25 },
          reason: "Five additional guests.",
        },
      ],
    });
    const result = await makeAssistant("fake-test-key")(
      event,
      "Add five guests.",
    );
    expect(result.operations).toHaveLength(1);
    expect(event.plan.info.guestCount).toBe(20);
    const request = fake.generate.mock.calls[0][0];
    expect(
      request.config.responseJsonSchema.properties.operations,
    ).toBeDefined();
    expect(request.config.responseMimeType).toBe("application/json");
  });
  it("still rejects invalid domain values after simplifying the provider schema", async () => {
    fake.text = JSON.stringify({
      reply: "Update.",
      questions: [],
      operations: [
        {
          entity: "event",
          data: { guestCount: -1 },
          reason: "Invalid generated value.",
        },
      ],
    });
    await expect(
      makeAssistant("fake-test-key")(event, "Update the plan."),
    ).rejects.toThrow();
    expect(event.plan.info.guestCount).toBe(20);
  });
  it("rejects generated references to records that do not exist", async () => {
    fake.text = JSON.stringify({
      reply: "Remove a session.",
      questions: [],
      operations: [
        {
          entity: "remove",
          kind: "session",
          id: "missing",
          reason: "Invalid reference.",
        },
      ],
    });
    await expect(
      makeAssistant("fake-test-key")(event, "Update the plan."),
    ).rejects.toThrow("missing record");
  });
});
