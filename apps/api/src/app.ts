import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { type Db, MongoServerError } from "mongodb";
import { z } from "zod";
import {
  eventInfoSchema,
  emptyPlan,
  getRisks,
  applyOperations,
  operationSchema,
  aiResponseSchema,
  type EventRecord,
  type EventView,
  type Proposal,
  type Activity,
  type Message,
  type AiResponse,
} from "@event/shared";
import type { Assistant } from "./ai.js";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}
type Settings = {
  jwtSecret: string;
  origin: string;
  secureCookies?: boolean;
  liveAvailable: boolean;
  disableRateLimits?: boolean;
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const authSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(10)
    .max(72)
    .refine(
      (v) => Buffer.byteLength(v, "utf8") <= 72,
      "Password must fit within 72 UTF-8 bytes.",
    ),
});
const registerSchema = authSchema.extend({
  name: z.string().trim().min(1).max(100),
});
const createSchema = z
  .object({ info: eventInfoSchema, mode: z.enum(["demo", "live"]) })
  .strict();
const messageSchema = z
  .object({ text: z.string().trim().min(1).max(6000) })
  .strict();
const updateSchema = z
  .object({
    revision: z.number().int().min(0),
    operations: z.array(operationSchema).min(1).max(100),
  })
  .strict();
const now = () => new Date().toISOString();
const publicUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});
const view = (event: EventRecord): EventView => ({
  ...event,
  risks: getRisks(event.plan),
});
const userId = (res: Response): string => res.locals.userId;
const param = (req: Request, key: string) => String(req.params[key]);

export async function ensureIndexes(db: Db) {
  await db
    .collection<User>("users")
    .createIndex({ email: 1 }, { unique: true });
  await db.collection<User>("users").createIndex({ id: 1 }, { unique: true });
  await db
    .collection<EventRecord>("events")
    .createIndex({ id: 1 }, { unique: true });
  await db
    .collection<EventRecord>("events")
    .createIndex({ ownerId: 1, updatedAt: -1 });
}
export function createApp(db: Db, settings: Settings, assistant: Assistant) {
  const app = express();
  const users = db.collection<User>("users"),
    events = db.collection<EventRecord>("events");
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", (req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== settings.origin
    )
      return next(new HttpError(403, "Request origin is not allowed."));
    next();
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !!settings.disableRateLimits,
    message: { error: "Too many sign-in attempts. Please try again later." },
  });
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    keyGenerator: (_req, res) => userId(res),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !!settings.disableRateLimits,
    message: { error: "Please wait a moment before sending another message." },
  });
  const cookieOptions = {
    httpOnly: true,
    secure: !!settings.secureCookies,
    sameSite: "strict" as const,
    path: "/",
  };
  function setSession(res: Response, user: User) {
    res.cookie(
      "xperience_session",
      jwt.sign({}, settings.jwtSecret, {
        subject: user.id,
        expiresIn: "8h",
        algorithm: "HS256",
        issuer: "xperience-api",
        audience: "xperience-web",
      }),
      { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 },
    );
  }
  app.get("/api/health", async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: "ok" });
  });
  app.get("/api/config", (_req, res) =>
    res.json({ liveAvailable: settings.liveAvailable }),
  );
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    const body = registerSchema.parse(req.body);
    const user: User = {
      id: randomUUID(),
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12),
      createdAt: now(),
    };
    try {
      await users.insertOne(user);
    } catch (e) {
      if (e instanceof MongoServerError && e.code === 11000)
        throw new HttpError(409, "An account with this email already exists.");
      throw e;
    }
    setSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const body = authSchema.parse(req.body);
    const user = await users.findOne({ email: body.email });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash)))
      throw new HttpError(401, "Email or password is incorrect.");
    setSession(res, user);
    res.json({ user: publicUser(user) });
  });
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie("xperience_session", cookieOptions);
    res.json({ ok: true });
  });
  app.use("/api", async (req, res, next) => {
    try {
      const token = jwt.verify(
        req.cookies.xperience_session || "",
        settings.jwtSecret,
        {
          algorithms: ["HS256"],
          issuer: "xperience-api",
          audience: "xperience-web",
        },
      );
      if (typeof token === "string" || !token.sub)
        throw new Error("No subject");
      const user = await users.findOne({ id: token.sub });
      if (!user) throw new Error("No user");
      res.locals.userId = user.id;
      res.locals.user = publicUser(user);
      next();
    } catch {
      next(new HttpError(401, "Please sign in to continue."));
    }
  });
  app.get("/api/auth/me", (_req, res) => res.json({ user: res.locals.user }));
  async function owned(req: Request, res: Response) {
    const event = await events.findOne(
      { id: param(req, "id"), ownerId: userId(res) },
      { projection: { _id: 0 } },
    );
    if (!event) throw new HttpError(404, "Event not found.");
    return event;
  }
  app.get("/api/events", async (_req, res) => {
    const all = await events
      .find(
        { ownerId: userId(res) },
        { projection: { id: 1, plan: 1, mode: 1, updatedAt: 1 } },
      )
      .sort({ updatedAt: -1 })
      .toArray();
    res.json({
      events: all.map((e) => ({
        id: e.id,
        title: e.plan.info.title,
        type: e.plan.info.type,
        guestCount: e.plan.info.guestCount,
        startDate: e.plan.info.startDate,
        mode: e.mode,
        updatedAt: e.updatedAt,
      })),
    });
  });
  app.post("/api/events", async (req, res) => {
    const body = createSchema.parse(req.body);
    if (body.mode === "live" && !settings.liveAvailable)
      throw new HttpError(
        400,
        "Configure GEMINI_API_KEY before creating a live event.",
      );
    const plan = applyOperations(emptyPlan(), [
      { entity: "event", data: body.info, reason: "Create event" },
    ]).plan;
    const event: EventRecord = {
      id: randomUUID(),
      ownerId: userId(res),
      mode: body.mode,
      revision: 0,
      plan,
      messages: [],
      proposals: [],
      history: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await events.insertOne(structuredClone(event));
    res.status(201).json({ event: view(event) });
  });
  app.get("/api/events/:id", async (req, res) =>
    res.json({ event: view(await owned(req, res)) }),
  );
  app.delete("/api/events/:id", async (req, res) => {
    await owned(req, res);
    await events.deleteOne({ id: param(req, "id"), ownerId: userId(res) });
    res.json({ ok: true });
  });
  app.get("/api/events/:id/history", async (req, res) =>
    res.json({ history: (await owned(req, res)).history }),
  );
  app.get("/api/events/:id/messages", async (req, res) =>
    res.json({ messages: (await owned(req, res)).messages }),
  );
  app.patch("/api/events/:id", async (req, res) => {
    const body = updateSchema.parse(req.body),
      event = await owned(req, res);
    if (event.revision !== body.revision)
      throw new HttpError(
        409,
        "This event changed. Refresh it before saving your edits.",
      );
    const { plan, changes } = applyOperations(event.plan, body.operations);
    const activity: Activity = {
      id: randomUUID(),
      revision: event.revision + 1,
      title: "Manual update",
      changes,
      createdAt: now(),
    };
    const saved = await events.findOneAndUpdate(
      { id: event.id, ownerId: userId(res), revision: body.revision },
      {
        $set: { plan, updatedAt: now() },
        $inc: { revision: 1 },
        $push: { history: { $each: [activity], $slice: -200 } },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    if (!saved)
      throw new HttpError(
        409,
        "This event changed. Refresh it before saving your edits.",
      );
    res.json({ event: view(saved) });
  });
  app.patch("/api/events/:id/mode", async (req, res) => {
    const { mode, revision } = z
      .object({
        mode: z.enum(["demo", "live"]),
        revision: z.number().int().min(0),
      })
      .strict()
      .parse(req.body);
    if (mode === "live" && !settings.liveAvailable)
      throw new HttpError(
        400,
        "Configure GEMINI_API_KEY on the server before switching to live mode.",
      );
    const event = await owned(req, res);
    const activity: Activity = {
      id: randomUUID(),
      revision: revision + 1,
      title: `Switched to ${mode} mode`,
      changes: [
        {
          entity: "mode",
          label: "Assistant mode",
          before: event.mode,
          after: mode,
          reason: "Explicit mode change.",
        },
      ],
      createdAt: now(),
    };
    const saved = await events.findOneAndUpdate(
      { id: event.id, ownerId: userId(res), revision },
      {
        $set: { mode, updatedAt: now() },
        $inc: { revision: 1 },
        $push: { history: { $each: [activity], $slice: -200 } },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    if (!saved)
      throw new HttpError(
        409,
        "This event changed. Refresh before switching modes.",
      );
    res.json({ event: view(saved) });
  });
  app.post("/api/events/:id/messages", aiLimiter, async (req, res) => {
    const { text } = messageSchema.parse(req.body),
      event = await owned(req, res);
    let result: AiResponse;
    try {
      result = aiResponseSchema.parse(await assistant(event, text));
      applyOperations(event.plan, result.operations);
    } catch (error) {
      const providerStatus =
        error &&
        typeof error === "object" &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : undefined;
      console.error(
        "Assistant failed:",
        error instanceof Error ? error.name : "Unknown error",
        providerStatus ?? "no provider status",
      );
      if (providerStatus === 503)
        throw new HttpError(
          503,
          "Gemini is temporarily busy. Your plan was not changed. Please retry shortly.",
        );
      if (providerStatus === 429)
        throw new HttpError(
          429,
          "Gemini's request limit or quota has been reached. Your plan was not changed. Wait before retrying, or check your Gemini project quota.",
        );
      if (
        providerStatus === 504 ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw new HttpError(
          504,
          "Gemini took too long to respond. Your plan was not changed. Please retry or send a smaller update.",
        );
      throw new HttpError(
        502,
        "The assistant could not produce a valid response. Your plan was not changed. Retry your message, check the server AI configuration, or explicitly select demo mode.",
      );
    }
    const proposal: Proposal | undefined = result.operations.length
      ? {
          id: randomUUID(),
          baseRevision: event.revision,
          status: "pending",
          operations: result.operations,
          changes: applyOperations(event.plan, result.operations).changes,
          createdAt: now(),
        }
      : undefined;
    const messages: Message[] = [
      { id: randomUUID(), role: "user", text, createdAt: now() },
      {
        id: randomUUID(),
        role: "assistant",
        text: [
          proposal && event.mode === "live"
            ? `I've prepared ${proposal.changes.length} proposed ${proposal.changes.length === 1 ? "change" : "changes"} for your review. Nothing has been applied yet. Review the proposal below and approve it to update your plan.`
            : result.reply,
          ...result.questions,
        ].join("\n\n"),
        questions: result.questions,
        createdAt: now(),
        ...(proposal ? { proposalId: proposal.id } : {}),
      },
    ];
    const saved = await events.findOneAndUpdate(
      { id: event.id, ownerId: userId(res), revision: event.revision },
      {
        $push: {
          messages: { $each: messages, $slice: -200 },
          ...(proposal
            ? { proposals: { $each: [proposal], $slice: -100 } }
            : {}),
        },
        $set: { updatedAt: now() },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    if (!saved)
      throw new HttpError(
        409,
        "The event changed while the assistant was thinking. Send your message again to use the latest plan.",
      );
    res.status(201).json({ event: view(saved) });
  });
  app.post(
    "/api/events/:id/proposals/:proposalId/approve",
    async (req, res) => {
      const event = await owned(req, res),
        proposalId = param(req, "proposalId");
      const proposal = event.proposals.find((p) => p.id === proposalId);
      if (!proposal) throw new HttpError(404, "Proposal not found.");
      if (proposal.status === "approved")
        return res.json({ event: view(event) });
      if (proposal.status !== "pending")
        throw new HttpError(409, "This proposal has already been rejected.");
      if (proposal.baseRevision !== event.revision)
        throw new HttpError(
          409,
          "This proposal is outdated because the event changed. Reject it and request a new proposal.",
        );
      const { plan, changes } = applyOperations(
        event.plan,
        proposal.operations,
      );
      const activity: Activity = {
        id: randomUUID(),
        revision: event.revision + 1,
        title: "Approved assistant proposal",
        changes,
        createdAt: now(),
        proposalId,
      };
      const saved = await events.findOneAndUpdate(
        {
          id: event.id,
          ownerId: userId(res),
          revision: event.revision,
          proposals: { $elemMatch: { id: proposalId, status: "pending" } },
        },
        {
          $set: { plan, "proposals.$.status": "approved", updatedAt: now() },
          $inc: { revision: 1 },
          $push: { history: { $each: [activity], $slice: -200 } },
        },
        { returnDocument: "after", projection: { _id: 0 } },
      );
      if (!saved) {
        const latest = await owned(req, res);
        if (
          latest.proposals.find((p) => p.id === proposalId)?.status ===
          "approved"
        )
          return res.json({ event: view(latest) });
        throw new HttpError(
          409,
          "The event changed while applying the proposal. Refresh and review the latest state.",
        );
      }
      res.json({ event: view(saved) });
    },
  );
  app.post("/api/events/:id/proposals/:proposalId/reject", async (req, res) => {
    const event = await owned(req, res),
      id = param(req, "proposalId");
    const proposal = event.proposals.find((p) => p.id === id);
    if (!proposal) throw new HttpError(404, "Proposal not found.");
    if (proposal.status === "rejected") return res.json({ event: view(event) });
    if (proposal.status === "approved")
      throw new HttpError(
        409,
        "An approved proposal cannot be rejected. Make a new edit instead.",
      );
    const saved = await events.findOneAndUpdate(
      {
        id: event.id,
        ownerId: userId(res),
        proposals: { $elemMatch: { id, status: "pending" } },
      },
      { $set: { "proposals.$.status": "rejected", updatedAt: now() } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    if (!saved)
      throw new HttpError(409, "The proposal changed. Refresh the event.");
    res.json({ event: view(saved) });
  });
  app.use((_req, _res, next) =>
    next(new HttpError(404, "Endpoint not found.")),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
            .join("; "),
        });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Invalid JSON request." });
      if (
        error instanceof Error &&
        !(error instanceof MongoServerError) &&
        /references|dependencies|date|guests|record|deadline|session|capacity/i.test(
          error.message,
        )
      )
        return res.status(400).json({ error: error.message });
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
      return res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    },
  );
  return app;
}
