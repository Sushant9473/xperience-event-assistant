import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { MongoClient, type Db } from "mongodb";
import request from "supertest";
import jwt from "jsonwebtoken";
import {
  emptyPlan,
  newTask,
  demoPrompts,
  type EventView,
  type AiResponse,
} from "@event/shared";
import { createApp, ensureIndexes } from "../src/app.js";
import { makeAssistant } from "../src/ai.js";

let client: MongoClient, db: Db, mongo: ChildProcess, temp: string;
let app: ReturnType<typeof createApp>, cookie: string, secondCookie: string;
const origin = "http://localhost:3000",
  secret = "test-secret-only-not-a-real-credential-123456";
const settings = {
  jwtSecret: secret,
  origin,
  liveAvailable: true,
  disableRateLimits: true,
};
const headers = () => ({ Origin: origin, Cookie: cookie });
const eventBody = () => ({
  info: emptyPlan({
    title: "Integration event",
    type: "wedding",
    startDate: "2030-03-15",
    timezone: "Asia/Kolkata",
  }).info,
  mode: "demo",
});
async function createEvent() {
  const response = await request(app)
    .post("/api/events")
    .set(headers())
    .send(eventBody())
    .expect(201);
  return response.body.event as EventView;
}
async function proposed() {
  const event = await createEvent();
  const response = await request(app)
    .post(`/api/events/${event.id}/messages`)
    .set(headers())
    .send({ text: demoPrompts.wedding[0] })
    .expect(201);
  return response.body.event as EventView;
}
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "xperience-tests-"));
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  mongo = spawn(
    "mongod",
    [
      "--dbpath",
      temp,
      "--bind_ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--quiet",
    ],
    { stdio: "ignore" },
  );
  let spawnError: Error | undefined;
  mongo.on("error", (error) => {
    spawnError = error;
  });
  client = new MongoClient(`mongodb://127.0.0.1:${port}`, {
    serverSelectionTimeoutMS: 1000,
  });
  let connected = false;
  for (let i = 0; i < 20; i++) {
    if (spawnError) throw spawnError;
    try {
      await client.connect();
      connected = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!connected) throw new Error("Could not start isolated test MongoDB.");
  db = client.db("xperience_test");
  await ensureIndexes(db);
  app = createApp(db, settings, makeAssistant());
  const first = await request(app)
    .post("/api/auth/register")
    .set("Origin", origin)
    .send({
      name: "Test Planner",
      email: "planner@example.com",
      password: "test-password-1234",
    })
    .expect(201);
  cookie = first.headers["set-cookie"][0].split(";")[0];
  const second = await request(app)
    .post("/api/auth/register")
    .set("Origin", origin)
    .send({
      name: "Another Planner",
      email: "other@example.com",
      password: "test-password-1234",
    })
    .expect(201);
  secondCookie = second.headers["set-cookie"][0].split(";")[0];
}, 30000);
afterAll(async () => {
  await client?.close();
  if (mongo && mongo.exitCode === null) {
    const exited = new Promise((resolve) => mongo.once("exit", resolve));
    mongo.kill("SIGTERM");
    await exited;
  }
  if (temp) await rm(temp, { recursive: true, force: true });
}, 15000);
describe("authentication and access boundaries", () => {
  it("hashes passwords and uses expiring HTTP-only cookies", async () => {
    const user = await db
      .collection("users")
      .findOne({ email: "planner@example.com" });
    expect(user?.passwordHash).not.toBe("test-password-1234");
    expect(user?.passwordHash).toMatch(/^\$2/);
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: "PLANNER@example.com", password: "test-password-1234" })
      .expect(200);
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect(response.body.user.passwordHash).toBeUndefined();
    await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email: "planner@example.com", password: "wrong-password-1234" })
      .expect(401);
  });
  it("rejects unknown origins, absent credentials, and expired JWTs", async () => {
    await request(app)
      .post("/api/events")
      .set("Cookie", cookie)
      .send(eventBody())
      .expect(403);
    await request(app)
      .post("/api/events")
      .set({ Origin: "https://attacker.example", Cookie: cookie })
      .send(eventBody())
      .expect(403);
    await request(app).get("/api/events").expect(401);
    const expired = jwt.sign({}, secret, {
      subject: "unknown",
      expiresIn: -1,
      issuer: "xperience-api",
      audience: "xperience-web",
    });
    await request(app)
      .get("/api/events")
      .set("Cookie", `xperience_session=${expired}`)
      .expect(401);
  });
  it("isolates reads, writes, messages, proposals, and deletes across accounts", async () => {
    const event = await proposed(),
      p = event.proposals[0];
    const other = { Cookie: secondCookie, Origin: origin };
    for (const path of ["", "/history", "/messages"])
      await request(app)
        .get(`/api/events/${event.id}${path}`)
        .set(other)
        .expect(404);
    await request(app)
      .patch(`/api/events/${event.id}`)
      .set(other)
      .send({
        revision: 0,
        operations: [
          { entity: "event", data: { title: "Stolen" }, reason: "Test" },
        ],
      })
      .expect(404);
    await request(app)
      .post(`/api/events/${event.id}/messages`)
      .set(other)
      .send({ text: "hello" })
      .expect(404);
    await request(app)
      .post(`/api/events/${event.id}/proposals/${p.id}/approve`)
      .set(other)
      .expect(404);
    await request(app)
      .post(`/api/events/${event.id}/proposals/${p.id}/reject`)
      .set(other)
      .expect(404);
    await request(app).delete(`/api/events/${event.id}`).set(other).expect(404);
    const list = await request(app).get("/api/events").set(other).expect(200);
    expect(list.body.events).toEqual([]);
  });
  it("clears the session cookie on logout", async () => {
    const response = await request(app)
      .post("/api/auth/logout")
      .set(headers())
      .expect(200);
    expect(response.headers["set-cookie"][0]).toMatch(/xperience_session=;/);
    expect(response.headers["set-cookie"][0]).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
  });
});
describe("review before apply and persistence", () => {
  it("can reject and resubmit the same task while describing it only as proposed", async () => {
    const receivedStates: string[][] = [];
    const liveApp = createApp(db, settings, async (current) => {
      receivedStates.push(current.proposals.map((p) => p.status));
      return {
        reply: "I've added Confirm transport to your plan.",
        questions: [],
        operations: [
          {
            entity: "task",
            action: "upsert",
            data: newTask("transport", "Confirm transport", {
              priority: "high",
            }),
            reason: "Requested task",
          },
        ],
      };
    });
    const created = await request(liveApp)
      .post("/api/events")
      .set(headers())
      .send({ ...eventBody(), mode: "live" })
      .expect(201);
    const id = created.body.event.id;
    const first = await request(liveApp)
      .post(`/api/events/${id}/messages`)
      .set(headers())
      .send({ text: "Add Confirm transport." })
      .expect(201);
    const rejectedId = first.body.event.proposals[0].id;
    expect(first.body.event.messages.at(-1).text).toContain(
      "Nothing has been applied yet",
    );
    expect(first.body.event.messages.at(-1).text).not.toContain("I've added");
    await request(liveApp)
      .post(`/api/events/${id}/proposals/${rejectedId}/reject`)
      .set(headers())
      .expect(200);
    const second = await request(liveApp)
      .post(`/api/events/${id}/messages`)
      .set(headers())
      .send({ text: "Add Confirm transport." })
      .expect(201);
    const newId = second.body.event.proposals.at(-1).id;
    expect(newId).not.toBe(rejectedId);
    expect(receivedStates).toEqual([[], ["rejected"]]);
    expect(second.body.event.plan.tasks).toEqual([]);
    expect(
      second.body.event.proposals.map((p: { status: string }) => p.status),
    ).toEqual(["rejected", "pending"]);
    const approved = await request(liveApp)
      .post(`/api/events/${id}/proposals/${newId}/approve`)
      .set(headers())
      .expect(200);
    expect(approved.body.event.plan.tasks).toHaveLength(1);
    expect(approved.body.event.plan.tasks[0].title).toBe("Confirm transport");
  });
  it("persists conversations without changing the plan until approval", async () => {
    const event = await proposed();
    expect(event.plan.tasks).toHaveLength(0);
    expect(event.revision).toBe(0);
    expect(event.messages).toHaveLength(2);
    const p = event.proposals[0];
    const response = await request(app)
      .post(`/api/events/${event.id}/proposals/${p.id}/approve`)
      .set(headers())
      .expect(200);
    expect(response.body.event.plan.tasks.length).toBeGreaterThan(0);
    expect(response.body.event.revision).toBe(1);
    const restartedApp = createApp(db, settings, makeAssistant());
    const reloaded = await request(restartedApp)
      .get(`/api/events/${event.id}`)
      .set(headers())
      .expect(200);
    expect(reloaded.body.event.plan).toEqual(response.body.event.plan);
    expect(reloaded.body.event.history).toHaveLength(1);
  });
  it("is idempotent under concurrent duplicate approvals", async () => {
    const event = await proposed(),
      path = `/api/events/${event.id}/proposals/${event.proposals[0].id}/approve`;
    const [a, b] = await Promise.all([
      request(app).post(path).set(headers()),
      request(app).post(path).set(headers()),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const loaded = await request(app)
      .get(`/api/events/${event.id}`)
      .set(headers());
    expect(loaded.body.event.revision).toBe(1);
    expect(loaded.body.event.history).toHaveLength(1);
  });
  it("rejects stale proposals after manual edits and protects manual edit revisions", async () => {
    const event = await proposed();
    const update = {
      revision: event.revision,
      operations: [
        {
          entity: "event",
          data: { title: "Updated name" },
          reason: "Test manual update",
        },
      ],
    };
    await request(app)
      .patch(`/api/events/${event.id}`)
      .set(headers())
      .send(update)
      .expect(200);
    await request(app)
      .patch(`/api/events/${event.id}`)
      .set(headers())
      .send(update)
      .expect(409);
    await request(app)
      .post(
        `/api/events/${event.id}/proposals/${event.proposals[0].id}/approve`,
      )
      .set(headers())
      .expect(409);
    const loaded = await request(app)
      .get(`/api/events/${event.id}`)
      .set(headers());
    expect(loaded.body.event.plan.info.title).toBe("Updated name");
    expect(loaded.body.event.plan.tasks).toHaveLength(0);
  });
  it("rejects proposals without changing the plan and prevents later approval", async () => {
    const event = await proposed(),
      path = `/api/events/${event.id}/proposals/${event.proposals[0].id}`;
    const response = await request(app)
      .post(`${path}/reject`)
      .set(headers())
      .expect(200);
    expect(response.body.event.plan.tasks).toHaveLength(0);
    expect(response.body.event.revision).toBe(0);
    await request(app).post(`${path}/reject`).set(headers()).expect(200);
    await request(app).post(`${path}/approve`).set(headers()).expect(409);
  });
  it("rejects invalid input without writing a partial plan", async () => {
    const event = await createEvent();
    await request(app)
      .patch(`/api/events/${event.id}`)
      .set(headers())
      .send({
        revision: 0,
        operations: [
          {
            entity: "event",
            data: { guestCount: -10 },
            reason: "Invalid data",
          },
        ],
      })
      .expect(400);
    const loaded = await request(app)
      .get(`/api/events/${event.id}`)
      .set(headers());
    expect(loaded.body.event.revision).toBe(0);
  });
  it("returns an explicit error for provider failures and malformed AI responses without demo fallback", async () => {
    const event = await createEvent();
    const failingApp = createApp(db, settings, async () => {
      throw new Error("Provider unavailable");
    });
    const response = await request(failingApp)
      .post(`/api/events/${event.id}/messages`)
      .set(headers())
      .send({ text: "Please plan my event" })
      .expect(502);
    expect(response.body.error).toContain("Retry");
    const invalidApp = createApp(
      db,
      settings,
      async () =>
        ({
          reply: "ok",
          questions: [],
          operations: [{ entity: "arbitrary_sql", query: "bad" }],
        }) as unknown as AiResponse,
    );
    await request(invalidApp)
      .post(`/api/events/${event.id}/messages`)
      .set(headers())
      .send({ text: "hello" })
      .expect(502);
    const loaded = await request(app)
      .get(`/api/events/${event.id}`)
      .set(headers());
    expect(loaded.body.event.messages).toHaveLength(0);
    expect(loaded.body.event.revision).toBe(0);
  });
  it("rate-limits authentication attempts with a clear JSON error", async () => {
    const limited = createApp(
      db,
      { ...settings, disableRateLimits: false },
      makeAssistant(),
    );
    let status = 0;
    for (let i = 0; i < 31; i++) {
      const response = await request(limited)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({ email: "bad", password: "short" });
      status = response.status;
    }
    expect(status).toBe(429);
  });
  it("reports provider overload and quota failures without saving changes", async () => {
    const event = await createEvent();
    for (const status of [503, 429, 504]) {
      const unavailable = createApp(db, settings, async () => {
        throw Object.assign(new Error("Provider failure"), { status });
      });
      const response = await request(unavailable)
        .post(`/api/events/${event.id}/messages`)
        .set(headers())
        .send({ text: "Update the plan." })
        .expect(status);
      expect(response.body.error).toContain("Your plan was not changed");
    }
    const loaded = await request(app)
      .get(`/api/events/${event.id}`)
      .set(headers());
    expect(loaded.body.event.messages).toHaveLength(0);
    expect(loaded.body.event.revision).toBe(0);
  });
});
