import { z } from "zod";
import { DateTime } from "luxon";

export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, "Invalid calendar date");
const text = z.string().trim().min(1).max(200);
export const eventInfoSchema = z
  .object({
    title: text,
    type: z.enum(["wedding", "corporate", "other"]),
    location: z.string().trim().max(200),
    guestCount: z.number().int().min(0).max(100000),
    outOfTownGuests: z.number().int().min(0).max(100000),
    startDate: dateSchema.nullable(),
    endDate: dateSchema.nullable(),
    timezone: z
      .string()
      .refine((v) => DateTime.now().setZone(v).isValid, "Invalid timezone"),
  })
  .strict();
export const sessionSchema = z
  .object({
    id: idSchema,
    title: text,
    date: dateSchema.nullable(),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    location: z.string().max(200),
    notes: z.string().max(2000),
  })
  .strict();
export const deadlineRuleSchema = z
  .object({
    anchor: z.enum(["event_start", "event_end", "session"]),
    sessionId: idSchema.nullable(),
    offsetDays: z.number().int().min(-365).max(365),
  })
  .strict();
export const taskSchema = z
  .object({
    id: idSchema,
    title: text,
    description: z.string().max(2000),
    status: z.enum(["todo", "in_progress", "done"]),
    priority: z.enum(["low", "medium", "high"]),
    assignee: z.string().max(100),
    dueDate: dateSchema.nullable(),
    deadlineRule: deadlineRuleSchema.nullable(),
    dependencies: z.array(idSchema).max(50),
    sessionId: idSchema.nullable(),
    vendorId: idSchema.nullable(),
  })
  .strict();
export const vendorSchema = z
  .object({
    id: idSchema,
    name: text,
    service: z.enum([
      "venue",
      "catering",
      "decor",
      "photography",
      "entertainment",
      "accommodation",
      "transport",
      "invitations",
      "activities",
      "branding",
      "other",
    ]),
    status: z.enum(["needed", "contacted", "confirmed", "unavailable"]),
    capacity: z.number().int().min(0).max(100000).nullable(),
    requiredCapacity: z.number().int().min(0).max(100000).nullable(),
    sessionId: idSchema.nullable(),
    notes: z.string().max(2000),
  })
  .strict();
export const planSchema = z
  .object({
    info: eventInfoSchema,
    tasks: z.array(taskSchema).max(500),
    vendors: z.array(vendorSchema).max(200),
    sessions: z.array(sessionSchema).max(100),
  })
  .strict();
export const operationSchema = z.discriminatedUnion("entity", [
  z
    .object({
      entity: z.literal("event"),
      data: eventInfoSchema.partial(),
      reason: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      entity: z.literal("task"),
      action: z.literal("upsert"),
      data: taskSchema,
      reason: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      entity: z.literal("vendor"),
      action: z.literal("upsert"),
      data: vendorSchema,
      reason: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      entity: z.literal("session"),
      action: z.literal("upsert"),
      data: sessionSchema,
      reason: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      entity: z.literal("remove"),
      kind: z.enum(["task", "vendor", "session"]),
      id: idSchema,
      reason: z.string().min(1).max(1000),
    })
    .strict(),
]);
export const aiResponseSchema = z
  .object({
    reply: z.string().min(1).max(6000),
    questions: z.array(z.string().max(500)).max(8),
    operations: z.array(operationSchema).max(100),
  })
  .strict();
export type EventInfo = z.infer<typeof eventInfoSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Vendor = z.infer<typeof vendorSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  proposalId?: string;
  questions?: string[];
};
export type Change = {
  entity: string;
  label: string;
  before: unknown;
  after: unknown;
  reason: string;
};
export type Proposal = {
  id: string;
  baseRevision: number;
  status: "pending" | "approved" | "rejected";
  operations: Operation[];
  changes: Change[];
  createdAt: string;
};
export type Activity = {
  id: string;
  revision: number;
  title: string;
  changes: Change[];
  createdAt: string;
  proposalId?: string;
};
export type Risk = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  action: string;
};
export type EventRecord = {
  id: string;
  ownerId: string;
  mode: "demo" | "live";
  revision: number;
  plan: Plan;
  messages: Message[];
  proposals: Proposal[];
  history: Activity[];
  createdAt: string;
  updatedAt: string;
};
export type EventView = EventRecord & { risks: Risk[] };
export type EventSummary = {
  id: string;
  title: string;
  type: EventInfo["type"];
  guestCount: number;
  startDate: string | null;
  mode: "demo" | "live";
  updatedAt: string;
};

export function resolveDeadlines(plan: Plan): Plan {
  const result = structuredClone(plan);
  for (const task of result.tasks) {
    if (!task.deadlineRule) continue;
    const rule = task.deadlineRule;
    const anchor =
      rule.anchor === "event_start"
        ? result.info.startDate
        : rule.anchor === "event_end"
          ? result.info.endDate
          : result.sessions.find((s) => s.id === rule.sessionId)?.date;
    task.dueDate = anchor
      ? DateTime.fromISO(anchor, { zone: result.info.timezone })
          .plus({ days: rule.offsetDays })
          .toISODate()
      : null;
  }
  return result;
}

export function validatePlan(input: Plan): Plan {
  const plan = planSchema.parse(input);
  const { info, tasks, vendors, sessions } = plan;
  if (info.startDate && info.endDate && info.endDate < info.startDate)
    throw new Error("Event end date must follow its start date.");
  if (info.outOfTownGuests > info.guestCount)
    throw new Error("Travelling guests cannot exceed total guests.");
  for (const group of [tasks, vendors, sessions])
    if (new Set(group.map((r) => r.id)).size !== group.length)
      throw new Error("Duplicate record IDs.");
  const hasSession = (id: string | null) =>
    !id || sessions.some((s) => s.id === id);
  for (const session of sessions) {
    if (
      session.date &&
      ((info.startDate && session.date < info.startDate) ||
        (info.endDate && session.date > info.endDate))
    )
      throw new Error(`${session.title} falls outside the event dates.`);
  }
  for (const vendor of vendors)
    if (!hasSession(vendor.sessionId))
      throw new Error("Vendor references a missing session.");
  const seen = new Set<string>(),
    visiting = new Set<string>();
  function visit(task: Task) {
    if (visiting.has(task.id))
      throw new Error("Task dependencies cannot contain a cycle.");
    if (seen.has(task.id)) return;
    visiting.add(task.id);
    for (const id of task.dependencies) {
      const dependency = tasks.find((t) => t.id === id);
      if (!dependency) throw new Error("Task references a missing dependency.");
      visit(dependency);
    }
    visiting.delete(task.id);
    seen.add(task.id);
  }
  for (const task of tasks) {
    if (!hasSession(task.sessionId))
      throw new Error("Task references a missing session.");
    if (task.vendorId && !vendors.some((v) => v.id === task.vendorId))
      throw new Error("Task references a missing vendor.");
    if (
      task.deadlineRule?.anchor === "session" &&
      (!task.deadlineRule.sessionId || !hasSession(task.deadlineRule.sessionId))
    )
      throw new Error("Deadline references a missing session.");
    if (
      task.deadlineRule &&
      task.deadlineRule.anchor !== "session" &&
      task.deadlineRule.sessionId !== null
    )
      throw new Error("An event deadline cannot also reference a session.");
    visit(task);
  }
  return resolveDeadlines(plan);
}

export function applyOperations(
  current: Plan,
  input: Operation[],
): { plan: Plan; changes: Change[] } {
  const operations = z.array(operationSchema).max(100).parse(input);
  const plan = structuredClone(current);
  const changes: Change[] = [];
  for (const op of operations) {
    if (op.entity === "event") {
      const before = structuredClone(plan.info);
      plan.info = { ...plan.info, ...op.data };
      changes.push({
        entity: "event",
        label: plan.info.title,
        before,
        after: structuredClone(plan.info),
        reason: op.reason,
      });
    } else if (op.entity === "remove") {
      const key = `${op.kind}s` as "tasks" | "vendors" | "sessions";
      const index = plan[key].findIndex((r) => r.id === op.id);
      if (index < 0) throw new Error("Cannot remove a missing record.");
      const [before] = plan[key].splice(index, 1);
      changes.push({
        entity: op.kind,
        label: "title" in before ? before.title : before.name,
        before,
        after: null,
        reason: op.reason,
      });
    } else {
      const key = `${op.entity}s` as "tasks" | "vendors" | "sessions";
      const records = plan[key] as (Task | Vendor | Session)[];
      const index = records.findIndex((r) => r.id === op.data.id);
      const before = index < 0 ? null : structuredClone(records[index]);
      if (index < 0) records.push(structuredClone(op.data));
      else records[index] = structuredClone(op.data);
      changes.push({
        entity: op.entity,
        label: "title" in op.data ? op.data.title : op.data.name,
        before,
        after: structuredClone(op.data),
        reason: op.reason,
      });
    }
  }
  const resolved = validatePlan(plan);
  for (const task of resolved.tasks) {
    const old = current.tasks.find((t) => t.id === task.id);
    const existingChange = changes.find(
      (c) => c.entity === "task" && (c.after as Task | null)?.id === task.id,
    );
    if (existingChange) existingChange.after = structuredClone(task);
    else if (old && old.dueDate !== task.dueDate)
      changes.push({
        entity: "task",
        label: task.title,
        before: old,
        after: task,
        reason: "Recalculated from its relative deadline rule.",
      });
  }
  return { plan: resolved, changes };
}

export function getRisks(plan: Plan, now = new Date()): Risk[] {
  const risks: Risk[] = [];
  const today = DateTime.fromJSDate(now)
    .setZone(plan.info.timezone)
    .toISODate()!;
  if (!plan.info.startDate)
    risks.push({
      id: "missing-dates",
      severity: "medium",
      title: "Event dates are still open",
      detail:
        "Relative deadlines cannot be finalized until the event dates are set.",
      action: "Confirm the event start and end dates.",
    });
  if (!plan.info.guestCount)
    risks.push({
      id: "missing-guests",
      severity: "medium",
      title: "Guest count is unknown",
      detail:
        "Accommodation, catering, and transport requirements need a guest count.",
      action: "Confirm an estimated number of guests.",
    });
  for (const vendor of plan.vendors) {
    const session = plan.sessions.find((s) => s.id === vendor.sessionId);
    const context = session ? ` for ${session.title}` : "";
    if (vendor.status === "unavailable")
      risks.push({
        id: `unavailable-${vendor.id}`,
        severity: "high",
        title: `${vendor.name} is unavailable`,
        detail: `${vendor.service} coverage${context} needs a replacement.`,
        action: `Find and confirm a replacement ${vendor.service} vendor${context}.`,
      });
    else if (vendor.status !== "confirmed")
      risks.push({
        id: `confirm-${vendor.id}`,
        severity: "medium",
        title: `${vendor.name} needs confirmation`,
        detail: `${vendor.service}${context} is ${vendor.status}.`,
        action: "Contact the vendor and confirm availability and scope.",
      });
    if (
      vendor.capacity !== null &&
      vendor.requiredCapacity !== null &&
      vendor.capacity < vendor.requiredCapacity
    )
      risks.push({
        id: `capacity-${vendor.id}`,
        severity: "high",
        title: `${vendor.requiredCapacity - vendor.capacity}-person ${vendor.service} shortfall`,
        detail: `${vendor.name} can cover ${vendor.capacity} of ${vendor.requiredCapacity} people.`,
        action: "Arrange additional capacity or confirm an alternative vendor.",
      });
    if (vendor.requiredCapacity !== null && vendor.capacity === null)
      risks.push({
        id: `unknown-capacity-${vendor.id}`,
        severity: "medium",
        title: `${vendor.name}: capacity unconfirmed`,
        detail: `Coverage is required for ${vendor.requiredCapacity} people.`,
        action: "Confirm the available capacity with the vendor.",
      });
  }
  for (const task of plan.tasks.filter((t) => t.status !== "done")) {
    const blockers = task.dependencies
      .map((id) => plan.tasks.find((t) => t.id === id)!)
      .filter((t) => t.status !== "done");
    if (blockers.length)
      risks.push({
        id: `blocked-${task.id}`,
        severity: "medium",
        title: `${task.title} is blocked`,
        detail: `Waiting on: ${blockers.map((t) => t.title).join(", ")}.`,
        action: "Complete the prerequisite tasks before progressing this work.",
      });
    if (task.dueDate && task.dueDate < today)
      risks.push({
        id: `overdue-${task.id}`,
        severity: "high",
        title: `${task.title} is overdue`,
        detail: `Due ${task.dueDate}${task.assignee ? ` · ${task.assignee}` : ""}.`,
        action: "Confirm progress and agree on a recovery date.",
      });
    if (task.deadlineRule && !task.dueDate)
      risks.push({
        id: `unresolved-${task.id}`,
        severity: "medium",
        title: `${task.title}: deadline unresolved`,
        detail: "The date this deadline depends on has not been confirmed.",
        action: "Set the referenced event or session date.",
      });
  }
  return risks.sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 })[a.severity] -
      { high: 0, medium: 1, low: 2 }[b.severity],
  );
}

export const demoPrompts = {
  wedding: [
    "Plan a three-day wedding for 400 guests with Sangeet, Haldi, Wedding Ceremony, and Reception.",
    "The Sangeet venue has been finalized, but we still need to confirm the décor vendor.",
    "150 guests are travelling from outside the city. Arrange accommodation and airport transfers.",
    "The catering team needs the final guest count one week before the wedding ceremony.",
    "The photographer is unavailable for the Reception. What needs to be addressed?",
  ],
  corporate: [
    "Plan a two-day corporate outing for 200 employees with transport, accommodation, food, activities, entertainment, and branding.",
    "The resort has been confirmed for 200 people.",
    "40 employees are travelling from different cities.",
    "We need to finalize the team-building activities by Friday.",
    "The CEO will join only on the second day. Schedule the leadership session accordingly.",
    "The transportation vendor can only provide vehicles for 150 people.",
  ],
};

export function emptyPlan(info?: Partial<EventInfo>): Plan {
  return {
    info: {
      title: "Untitled event",
      type: "other",
      location: "",
      guestCount: 0,
      outOfTownGuests: 0,
      startDate: null,
      endDate: null,
      timezone: "UTC",
      ...info,
    },
    tasks: [],
    vendors: [],
    sessions: [],
  };
}
export function newTask(
  id: string,
  title: string,
  fields: Partial<Task> = {},
): Task {
  return {
    id,
    title,
    description: "",
    status: "todo",
    priority: "medium",
    assignee: "",
    dueDate: null,
    deadlineRule: null,
    dependencies: [],
    sessionId: null,
    vendorId: null,
    ...fields,
  };
}
export function newVendor(
  id: string,
  name: string,
  service: Vendor["service"],
  fields: Partial<Vendor> = {},
): Vendor {
  return {
    id,
    name,
    service,
    status: "needed",
    capacity: null,
    requiredCapacity: null,
    sessionId: null,
    notes: "",
    ...fields,
  };
}
