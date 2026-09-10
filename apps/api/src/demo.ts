import {
  newTask,
  newVendor,
  type Plan,
  type AiResponse,
  type Operation,
  type Session,
  demoPrompts,
} from "@event/shared";

function shift(date: string | null, days: number) {
  if (!date) return null;
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function session(id: string, title: string, date: string | null): Session {
  return { id, title, date, time: null, location: "", notes: "" };
}
export function demoResponse(
  plan: Plan,
  message: string,
  now = new Date(),
): AiResponse {
  const normalized = message.toLowerCase();
  const operations: Operation[] = [];
  const questions: string[] = [];
  const task = (data: ReturnType<typeof newTask>, reason: string) =>
    operations.push({ entity: "task", action: "upsert", data, reason });
  const vendor = (data: ReturnType<typeof newVendor>, reason: string) =>
    operations.push({ entity: "vendor", action: "upsert", data, reason });
  const event = (data: Partial<Plan["info"]>, reason: string) =>
    operations.push({ entity: "event", data, reason });
  const existingVendor = (id: string) => plan.vendors.find((v) => v.id === id);
  let reply = "";
  if (
    normalized === demoPrompts.wedding[0].toLowerCase() ||
    normalized === demoPrompts.corporate[0].toLowerCase()
  ) {
    if (plan.tasks.length || plan.sessions.length || plan.vendors.length)
      return {
        reply:
          "This event already has a plan. Use the next scenario prompt to update it, or create a new event to replay the initial plan.",
        questions,
        operations,
      };
    const wedding = normalized.includes("wedding");
    event(
      {
        type: wedding ? "wedding" : "corporate",
        guestCount: wedding ? 400 : 200,
        endDate: shift(plan.info.startDate, wedding ? 2 : 1),
      },
      "Extracted event type, duration, and guest count from your brief.",
    );
    const sessions = wedding
      ? [
          session("sangeet", "Sangeet", plan.info.startDate),
          session("haldi", "Haldi", shift(plan.info.startDate, 1)),
          session(
            "ceremony",
            "Wedding Ceremony",
            shift(plan.info.startDate, 2),
          ),
          session("reception", "Reception", shift(plan.info.startDate, 2)),
        ]
      : [
          session(
            "activities",
            "Team-building activities",
            plan.info.startDate,
          ),
          session("leadership", "Leadership session", null),
          session("evening", "Evening entertainment", plan.info.startDate),
        ];
    for (const s of sessions)
      operations.push({
        entity: "session",
        action: "upsert",
        data: s,
        reason: "Proposed session from your event brief; review the schedule.",
      });
    const services = wedding
      ? ([
          "venue",
          "catering",
          "decor",
          "photography",
          "entertainment",
          "accommodation",
          "transport",
          "invitations",
        ] as const)
      : ([
          "venue",
          "accommodation",
          "catering",
          "transport",
          "activities",
          "entertainment",
          "branding",
        ] as const);
    for (const service of services) {
      const id =
        service === "venue" ? (wedding ? "sangeet-venue" : "resort") : service;
      const name =
        service === "venue"
          ? wedding
            ? "Sangeet venue"
            : "Corporate resort"
          : service === "photography"
            ? "Reception photographer"
            : `${service[0].toUpperCase()}${service.slice(1)} vendor`;
      vendor(
        newVendor(id, name, service, {
          sessionId:
            service === "venue" && wedding
              ? "sangeet"
              : service === "photography"
                ? "reception"
                : null,
          requiredCapacity: [
            "venue",
            "catering",
            "transport",
            "accommodation",
          ].includes(service)
            ? wedding
              ? service === "accommodation" || service === "transport"
                ? null
                : 400
              : 200
            : null,
        }),
        "Track the required service without assuming a booking.",
      );
      task(
        newTask(`confirm-${id}`, `Confirm ${name.toLowerCase()}`, {
          vendorId: id,
          priority: ["venue", "catering", "transport"].includes(service)
            ? "high"
            : "medium",
          dependencies: ["decor", "catering"].includes(service)
            ? [`confirm-${wedding ? "sangeet-venue" : "resort"}`]
            : [],
        }),
        "Create a concrete planning action.",
      );
    }
    if (!plan.info.startDate)
      questions.push(
        "What are the event dates? Set them in Event details so relative deadlines can be calculated.",
      );
    reply =
      "I drafted the sessions, vendor requirements, and planning tasks. No bookings have been assumed. Review the proposed plan before applying it.";
  } else if (!plan.vendors.length) {
    reply =
      "Start with the first suggested scenario prompt and approve its plan. The following updates reference records created by that step.";
  } else if (normalized === demoPrompts.wedding[1].toLowerCase()) {
    const v = existingVendor("sangeet-venue");
    if (v)
      vendor({ ...v, status: "confirmed" }, "You confirmed the Sangeet venue.");
    const t = plan.tasks.find((t) => t.id === "confirm-sangeet-venue");
    if (t) task({ ...t, status: "done" }, "Venue confirmation is complete.");
    reply =
      "The venue can be marked confirmed. Décor remains open; confirming the venue also clears that task dependency.";
  } else if (normalized === demoPrompts.wedding[2].toLowerCase()) {
    event({ outOfTownGuests: 150 }, "You identified 150 travelling guests.");
    for (const service of ["accommodation", "transport"] as const) {
      const v = existingVendor(service);
      if (v)
        vendor(
          {
            ...v,
            requiredCapacity: 150,
            notes:
              service === "transport"
                ? "Airport transfers for 150 out-of-town guests."
                : "Accommodation for 150 out-of-town guests.",
          },
          "Track required capacity; available capacity still needs confirmation.",
        );
    }
    reply =
      "I propose recording demand for 150 guests in accommodation and airport transfers. After approval, the dashboard will flag unconfirmed capacity.";
  } else if (normalized === demoPrompts.wedding[3].toLowerCase()) {
    task(
      newTask("final-guest-count", "Send final guest count to catering", {
        priority: "high",
        vendorId: "catering",
        sessionId: "ceremony",
        deadlineRule: {
          anchor: "session",
          sessionId: "ceremony",
          offsetDays: -7,
        },
        description:
          "Catering needs the final headcount seven days before the Wedding Ceremony.",
      }),
      "Preserve the seven-day deadline relative to the Wedding Ceremony.",
    );
    if (!plan.sessions.find((s) => s.id === "ceremony")?.date)
      questions.push(
        "What is the Wedding Ceremony date? The deadline stays unresolved until it is confirmed.",
      );
    reply =
      "I propose a deadline seven days before the Wedding Ceremony. After approval, it will recalculate if that ceremony date changes.";
  } else if (normalized === demoPrompts.wedding[4].toLowerCase()) {
    const v = existingVendor("photography");
    if (v)
      vendor(
        { ...v, status: "unavailable" },
        "You reported the Reception photographer is unavailable.",
      );
    task(
      newTask(
        "replace-photographer",
        "Book a replacement Reception photographer",
        {
          vendorId: "photography",
          sessionId: "reception",
          priority: "high",
          description:
            "Check availability, confirm coverage and pricing, and update the vendor record once booked.",
        },
      ),
      "Restore photography coverage for the Reception.",
    );
    reply =
      "Reception photography will be uncovered. I propose marking the vendor unavailable and adding a high-priority replacement task. The risk stays open until a replacement is confirmed.";
  } else if (normalized === demoPrompts.corporate[1].toLowerCase()) {
    const v = existingVendor("resort");
    if (v)
      vendor(
        { ...v, status: "confirmed", capacity: 200 },
        "The resort is confirmed for 200 people.",
      );
    const t = plan.tasks.find((t) => t.id === "confirm-resort");
    if (t) task({ ...t, status: "done" }, "Resort confirmation is complete.");
    reply =
      "The resort is confirmed with capacity for 200. Separate accommodation and meal arrangements still need their own confirmations.";
  } else if (normalized === demoPrompts.corporate[2].toLowerCase()) {
    event(
      { outOfTownGuests: 40 },
      "40 employees will travel from other cities.",
    );
    task(
      newTask(
        "arrival-coordination",
        "Coordinate arrivals for 40 travelling employees",
        {
          priority: "high",
          description:
            "Collect arrival times and coordinate transfers with the main transportation plan.",
        },
      ),
      "Different arrival cities create a separate coordination need.",
    );
    reply =
      "I propose recording 40 travelling employees and adding an arrival-coordination task. Overall transport demand remains 200.";
  } else if (normalized === demoPrompts.corporate[3].toLowerCase()) {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: plan.info.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const friday = shift(today, (5 - weekday + 7) % 7)!;
    const previous = plan.tasks.find((t) => t.id === "confirm-activities");
    task(
      {
        ...(previous ||
          newTask("confirm-activities", "Finalize team-building activities")),
        dueDate: friday,
        deadlineRule: null,
      },
      `Interpreted “by Friday” as ${friday} in ${plan.info.timezone}; review this date before approval.`,
    );
    reply = `I interpreted Friday as ${friday} in ${plan.info.timezone}. Review that date in the proposal; request a correction or edit the task if you mean a different Friday.`;
  } else if (normalized === demoPrompts.corporate[4].toLowerCase()) {
    const previous = plan.sessions.find((s) => s.id === "leadership");
    if (previous)
      operations.push({
        entity: "session",
        action: "upsert",
        data: {
          ...previous,
          date: shift(plan.info.startDate, 1),
          notes:
            "CEO attends only on day two. Schedule leadership on the second day.",
        },
        reason: "Match the leadership session to the CEO’s attendance.",
      });
    if (!plan.info.startDate)
      questions.push(
        "What is the outing start date? Set it before assigning a calendar date to day two.",
      );
    reply =
      "The leadership session belongs on day two. I retained the attendance constraint in its notes; the exact time is still open.";
  } else if (normalized === demoPrompts.corporate[5].toLowerCase()) {
    const v = existingVendor("transport");
    if (v)
      vendor(
        { ...v, capacity: 150, requiredCapacity: 200, status: "contacted" },
        "The vendor can cover only 150 of 200 employees.",
      );
    task(
      newTask(
        "extra-transport",
        "Arrange transport for 50 additional employees",
        {
          priority: "high",
          vendorId: "transport",
          description:
            "Ask for extra vehicles or confirm a second vendor. Update total capacity only after confirmation.",
        },
      ),
      "Resolve the 50-person capacity gap.",
    );
    reply =
      "The reported capacity would leave a 50-person transport shortfall. I propose recording it and adding an urgent task to arrange additional vehicles. Review and approve these changes to update the dashboard.";
  } else {
    reply =
      "This is a scripted demo, so free-form requests are not processed by AI. Use a suggested scenario prompt, edit records directly, or switch this event to live Gemini mode. Nothing was changed.";
  }
  return { reply, questions, operations };
}
