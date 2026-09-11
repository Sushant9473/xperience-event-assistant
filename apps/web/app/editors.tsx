"use client";
import { useState } from "react";
import {
  eventInfoSchema,
  emptyPlan,
  newTask,
  newVendor,
  type EventView,
  type EventInfo,
  type Operation,
  type Task,
  type Vendor,
  type Session,
  type Plan,
} from "@event/shared";
import { Modal, pretty } from "./ui";

type Kind = "event" | "task" | "vendor" | "session";
export type EditorState = {
  kind: Kind;
  record?: Task | Vendor | Session;
  snapshot: EventView;
};
const field = (data: FormData, name: string) => String(data.get(name) || "");
const nullable = (data: FormData, name: string) => field(data, name) || null;
const number = (data: FormData, name: string) =>
  field(data, name) === "" ? null : Number(field(data, name));
function EventFields({ info }: { info: EventInfo }) {
  return (
    <>
      <label className="span-2">
        Event name
        <input
          name="title"
          defaultValue={info.title}
          required
          maxLength={200}
          placeholder="e.g. Aarav & Meera’s wedding"
        />
      </label>
      <label>
        Event type
        <select name="type" defaultValue={info.type}>
          <option value="wedding">Wedding</option>
          <option value="corporate">Corporate outing</option>
          <option value="other">Other event</option>
        </select>
      </label>
      <label>
        Location
        <input
          name="location"
          defaultValue={info.location}
          maxLength={200}
          placeholder="City or venue"
        />
      </label>
      <label>
        Total guests
        <input
          name="guestCount"
          type="number"
          min="0"
          max="100000"
          defaultValue={info.guestCount}
          required
        />
      </label>
      <label>
        Travelling guests
        <input
          name="outOfTownGuests"
          type="number"
          min="0"
          max="100000"
          defaultValue={info.outOfTownGuests}
          required
        />
      </label>
      <label>
        Start date
        <input
          name="startDate"
          type="date"
          defaultValue={info.startDate || ""}
        />
      </label>
      <label>
        End date
        <input name="endDate" type="date" defaultValue={info.endDate || ""} />
      </label>
      <label className="span-2">
        Timezone
        <input
          name="timezone"
          defaultValue={info.timezone}
          required
          list="timezones"
        />
        <datalist id="timezones">
          <option value="Asia/Kolkata" />
          <option value="UTC" />
          <option value="Europe/London" />
          <option value="America/New_York" />
          <option value="America/Los_Angeles" />
        </datalist>
        <span className="field-help">
          Dates can stay open. Relative deadlines use this timezone.
        </span>
      </label>
    </>
  );
}
function readInfo(data: FormData): EventInfo {
  const result = eventInfoSchema.safeParse({
    title: field(data, "title"),
    type: field(data, "type"),
    location: field(data, "location"),
    guestCount: Number(field(data, "guestCount")),
    outOfTownGuests: Number(field(data, "outOfTownGuests")),
    startDate: nullable(data, "startDate"),
    endDate: nullable(data, "endDate"),
    timezone: field(data, "timezone"),
  });
  if (!result.success)
    throw new Error(result.error.issues.map((issue) => issue.message).join(" "));
  return result.data;
}
export function CreateEvent({
  onClose,
  onCreate,
  liveAvailable,
  initialType = "wedding",
}: {
  onClose: () => void;
  onCreate: (info: EventInfo, mode: "demo" | "live") => Promise<void>;
  liveAvailable: boolean;
  initialType?: EventInfo["type"];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const info = emptyPlan({
    title: "",
    type: initialType,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  }).info;
  return (
    <Modal
      title="Create an event"
      description="Start with what you know. Your assistant will help fill the gaps."
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = new FormData(e.currentTarget);
            await onCreate(
              readInfo(data),
              field(data, "mode") as "demo" | "live",
            );
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not create event.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <EventFields info={info} />
          <label className="span-2">
            Assistant mode
            <select name="mode" defaultValue={liveAvailable ? "live" : "demo"}>
              <option value="demo">Demo — scripted assessment scenarios</option>
              <option value="live" disabled={!liveAvailable}>
                Live Gemini{!liveAvailable ? " — API key required" : ""}
              </option>
            </select>
          </label>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Creating…" : "Create event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SessionPicker({ plan, value }: { plan: Plan; value: string | null }) {
  return (
    <label>
      Session
      <select name="sessionId" defaultValue={value || ""}>
        <option value="">Entire event</option>
        {plan.sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
    </label>
  );
}
export function EditRecord({
  editor,
  onClose,
  onSave,
}: {
  editor: EditorState;
  onClose: () => void;
  onSave: (operations: Operation[], revision: number) => Promise<void>;
}) {
  const { kind, snapshot } = editor,
    { plan } = snapshot;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [id] = useState(() => editor.record?.id || crypto.randomUUID());
  const task = (editor.record || newTask(id, "")) as Task;
  const vendor = (editor.record || newVendor(id, "", "other")) as Vendor;
  const session = (editor.record || {
    id,
    title: "",
    date: null,
    time: null,
    location: "",
    notes: "",
  }) as Session;
  const [relative, setRelative] = useState(!!task.deadlineRule);
  const [anchor, setAnchor] = useState(
    task.deadlineRule?.anchor || "event_start",
  );
  const submit = async (data: FormData) => {
    const reason = "Edited by the event manager.";
    let operations: Operation[];
    if (kind === "event") {
      const info = readInfo(data);
      operations = [{ entity: "event", data: info, reason }];
      if (
        data.get("shiftSessions") &&
        info.startDate &&
        plan.info.startDate &&
        info.startDate !== plan.info.startDate
      ) {
        const delta =
          (Date.parse(`${info.startDate}T12:00:00Z`) -
            Date.parse(`${plan.info.startDate}T12:00:00Z`)) /
          86400000;
        for (const s of plan.sessions.filter((s) => s.date))
          operations.push({
            entity: "session",
            action: "upsert",
            data: {
              ...s,
              date: new Date(
                Date.parse(`${s.date}T12:00:00Z`) + delta * 86400000,
              )
                .toISOString()
                .slice(0, 10),
            },
            reason: "Shift session by the change in event start date.",
          });
      }
    } else if (kind === "task") {
      operations = [
        {
          entity: "task",
          action: "upsert",
          reason,
          data: {
            id,
            title: field(data, "title"),
            description: field(data, "description"),
            status: field(data, "status") as Task["status"],
            priority: field(data, "priority") as Task["priority"],
            assignee: field(data, "assignee"),
            dueDate: relative ? null : nullable(data, "dueDate"),
            dependencies: data.getAll("dependencies").map(String),
            sessionId: nullable(data, "sessionId"),
            vendorId: nullable(data, "vendorId"),
            deadlineRule: relative
              ? {
                  anchor,
                  sessionId:
                    anchor === "session"
                      ? nullable(data, "deadlineSessionId")
                      : null,
                  offsetDays: Number(field(data, "offsetDays")),
                }
              : null,
          },
        },
      ];
    } else if (kind === "vendor") {
      operations = [
        {
          entity: "vendor",
          action: "upsert",
          reason,
          data: {
            id,
            name: field(data, "name"),
            service: field(data, "service") as Vendor["service"],
            status: field(data, "status") as Vendor["status"],
            capacity: number(data, "capacity"),
            requiredCapacity: number(data, "requiredCapacity"),
            sessionId: nullable(data, "sessionId"),
            notes: field(data, "notes"),
          },
        },
      ];
    } else {
      operations = [
        {
          entity: "session",
          action: "upsert",
          reason,
          data: {
            id,
            title: field(data, "title"),
            date: nullable(data, "date"),
            time: nullable(data, "time"),
            location: field(data, "location"),
            notes: field(data, "notes"),
          },
        },
      ];
    }
    await onSave(operations, snapshot.revision);
  };
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        kind === "event"
          ? "Event details"
          : `${editor.record ? "Edit" : "Add"} ${kind}`
      }
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void run(() => submit(data));
        }}
      >
        <div className="form-grid">
          {kind === "event" && (
            <>
              <EventFields info={plan.info} />
              {plan.info.startDate && (
                <label className="check-row span-2">
                  <input type="checkbox" name="shiftSessions" defaultChecked />
                  Shift dated sessions when the start date changes
                </label>
              )}
            </>
          )}
          {kind === "task" && (
            <>
              <label className="span-2">
                Task name
                <input
                  name="title"
                  defaultValue={task.title}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue={task.status}>
                  {["todo", "in_progress", "done"].map((v) => (
                    <option key={v} value={v}>
                      {pretty(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select name="priority" defaultValue={task.priority}>
                  {["low", "medium", "high"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                Assignee
                <input
                  name="assignee"
                  defaultValue={task.assignee}
                  maxLength={100}
                  placeholder="Name or team"
                />
              </label>
              <label className="check-row span-2">
                <input
                  type="checkbox"
                  checked={relative}
                  onChange={(e) => setRelative(e.target.checked)}
                />
                Use a relative deadline
              </label>
              {relative ? (
                <>
                  <label>
                    Anchor
                    <select
                      value={anchor}
                      onChange={(e) =>
                        setAnchor(e.target.value as typeof anchor)
                      }
                    >
                      <option value="event_start">Event start</option>
                      <option value="event_end">Event end</option>
                      <option value="session">Session date</option>
                    </select>
                  </label>
                  <label>
                    Days from anchor
                    <input
                      name="offsetDays"
                      type="number"
                      min="-365"
                      max="365"
                      defaultValue={task.deadlineRule?.offsetDays || 0}
                      required
                    />
                    <span className="field-help">
                      Use −7 for one week before.
                    </span>
                  </label>
                  {anchor === "session" && (
                    <label className="span-2">
                      Deadline session
                      <select
                        name="deadlineSessionId"
                        defaultValue={task.deadlineRule?.sessionId || ""}
                        required
                      >
                        <option value="">Choose a session</option>
                        {plan.sessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              ) : (
                <label className="span-2">
                  Due date
                  <input
                    name="dueDate"
                    type="date"
                    defaultValue={task.dueDate || ""}
                  />
                </label>
              )}
              <SessionPicker plan={plan} value={task.sessionId} />
              <label>
                Vendor
                <select name="vendorId" defaultValue={task.vendorId || ""}>
                  <option value="">No vendor</option>
                  {plan.vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="span-2 dependencies">
                <legend>Depends on</legend>
                {plan.tasks.filter((t) => t.id !== id).length ? (
                  plan.tasks
                    .filter((t) => t.id !== id)
                    .map((t) => (
                      <label key={t.id} className="check-row">
                        <input
                          type="checkbox"
                          name="dependencies"
                          value={t.id}
                          defaultChecked={task.dependencies.includes(t.id)}
                        />
                        {t.title}
                      </label>
                    ))
                ) : (
                  <span className="muted">No other tasks yet.</span>
                )}
              </fieldset>
              <label className="span-2">
                Notes
                <textarea
                  name="description"
                  defaultValue={task.description}
                  maxLength={2000}
                  rows={3}
                />
              </label>
            </>
          )}
          {kind === "vendor" && (
            <>
              <label className="span-2">
                Vendor or requirement name
                <input
                  name="name"
                  defaultValue={vendor.name}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Service
                <select name="service" defaultValue={vendor.service}>
                  {[
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
                  ].map((v) => (
                    <option key={v} value={v}>
                      {pretty(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select name="status" defaultValue={vendor.status}>
                  {["needed", "contacted", "confirmed", "unavailable"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {pretty(v)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Required capacity
                <input
                  type="number"
                  name="requiredCapacity"
                  min="0"
                  max="100000"
                  defaultValue={vendor.requiredCapacity ?? ""}
                  placeholder="People"
                />
              </label>
              <label>
                Available capacity
                <input
                  type="number"
                  name="capacity"
                  min="0"
                  max="100000"
                  defaultValue={vendor.capacity ?? ""}
                  placeholder="Leave blank if unknown"
                />
              </label>
              <SessionPicker plan={plan} value={vendor.sessionId} />
              <label className="span-2">
                Notes
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={vendor.notes}
                  maxLength={2000}
                />
              </label>
            </>
          )}
          {kind === "session" && (
            <>
              <label className="span-2">
                Session name
                <input
                  name="title"
                  defaultValue={session.title}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  name="date"
                  defaultValue={session.date || ""}
                />
              </label>
              <label>
                Time
                <input
                  type="time"
                  name="time"
                  defaultValue={session.time || ""}
                />
              </label>
              <label className="span-2">
                Location
                <input
                  name="location"
                  defaultValue={session.location}
                  maxLength={200}
                />
              </label>
              <label className="span-2">
                Notes
                <textarea
                  name="notes"
                  defaultValue={session.notes}
                  rows={3}
                  maxLength={2000}
                />
              </label>
            </>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          {editor.record && (
            <button
              type="button"
              className="button danger-button push-right"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `Remove this ${kind}? Any dependent references must be removed first.`,
                  )
                )
                  void run(() =>
                    onSave(
                      [
                        {
                          entity: "remove",
                          kind: kind as "task" | "vendor" | "session",
                          id,
                          reason: "Removed by event manager.",
                        },
                      ],
                      snapshot.revision,
                    ),
                  );
              }}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
