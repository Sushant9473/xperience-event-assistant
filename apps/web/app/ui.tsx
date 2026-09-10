"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, ArrowRight } from "lucide-react";
import type { Change } from "@event/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The server is unavailable. Please try again." }));
  if (!response.ok)
    throw new ApiError(response.status, data.error || "Request failed.");
  return data;
}
export function dateLabel(date: string | null, short = false) {
  return date
    ? new Intl.DateTimeFormat("en", {
        month: short ? "short" : "long",
        day: "numeric",
        ...(short ? {} : { year: "numeric" }),
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`))
    : "Date to be confirmed";
}
export function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      // Unmounting a native dialog can otherwise reset keyboard focus to body.
      requestAnimationFrame(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected)
          trigger.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const labels: Record<string, string> = {
  guestCount: "Guests",
  outOfTownGuests: "Travelling guests",
  startDate: "Start date",
  endDate: "End date",
  dueDate: "Due date",
  deadlineRule: "Relative deadline",
  sessionId: "Session",
  vendorId: "Vendor",
  requiredCapacity: "Required capacity",
};
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (typeof value === "object") {
    const rule = value as {
      anchor?: string;
      offsetDays?: number;
      sessionId?: string;
    };
    if (rule.anchor)
      return `${Math.abs(rule.offsetDays || 0)} days ${(rule.offsetDays || 0) < 0 ? "before" : "after"} ${rule.sessionId || pretty(rule.anchor)}`;
    return JSON.stringify(value);
  }
  return typeof value === "string" ? pretty(value) : String(value);
}
export function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <div className="change-list">
      {changes.map((change, index) => {
        const before = (
          change.before && typeof change.before === "object"
            ? change.before
            : {}
        ) as Record<string, unknown>;
        const after = (
          change.after && typeof change.after === "object" ? change.after : {}
        ) as Record<string, unknown>;
        const fields = [
          ...new Set([...Object.keys(before), ...Object.keys(after)]),
        ].filter(
          (k) =>
            k !== "id" &&
            JSON.stringify(before[k]) !== JSON.stringify(after[k]) &&
            !(
              change.before === null &&
              (after[k] === "" ||
                after[k] === null ||
                (Array.isArray(after[k]) && !(after[k] as unknown[]).length))
            ),
        );
        return (
          <article className="change" key={index}>
            <div className="row between">
              <strong>{change.label}</strong>
              <Badge tone={change.after === null ? "danger" : "blue"}>
                {change.after === null
                  ? "Remove"
                  : change.before === null
                    ? "Add"
                    : "Update"}{" "}
                {change.entity}
              </Badge>
            </div>
            <p>{change.reason}</p>
            <dl className="diff-fields">
              {fields.map((key) => (
                <div className="diff-field" key={key}>
                  <dt>{labels[key] || pretty(key)}</dt>
                  <dd>
                    {change.before !== null && (
                      <>
                        <span className="before-value">
                          {display(before[key])}
                        </span>
                        <ArrowRight size={14} aria-label="changes to" />
                      </>
                    )}
                    <span className="after-value">{display(after[key])}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {typeof change.before === "string" && (
              <p>
                {display(change.before)} → {display(change.after)}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
