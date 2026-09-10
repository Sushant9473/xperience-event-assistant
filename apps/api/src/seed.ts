import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import {
  emptyPlan,
  applyOperations,
  demoPrompts,
  type EventRecord,
} from "@event/shared";
import { config } from "./config.js";
import { ensureIndexes, type User } from "./app.js";
import { demoResponse } from "./demo.js";
const env = config();
const email = (process.env.SEED_EMAIL || "demo@example.com").toLowerCase();
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 10 || password.length > 72)
  throw new Error(
    "Set SEED_PASSWORD in .env to 10–72 characters before seeding.",
  );
const client = new MongoClient(env.mongodbUri);
await client.connect();
try {
  const db = client.db(env.database);
  await ensureIndexes(db);
  let user = await db.collection<User>("users").findOne({ email });
  if (!user) {
    const created: User = {
      id: randomUUID(),
      name: "Demo Planner",
      email,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString(),
    };
    await db.collection<User>("users").insertOne(created);
    user = await db.collection<User>("users").findOne({ email });
  }
  for (const type of ["wedding", "corporate"] as const) {
    const id = `sample-${type}-${user!.id}`;
    if (await db.collection("events").findOne({ id })) continue;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 30);
    const startDate = start.toISOString().slice(0, 10);
    let plan = emptyPlan({
      title:
        type === "wedding"
          ? "Aarav & Meera · Wedding"
          : "Northstar · Team Retreat",
      type,
      startDate,
      timezone: "Asia/Kolkata",
      location: type === "wedding" ? "Jaipur" : "Lonavala",
    });
    const initial = demoResponse(plan, demoPrompts[type][0]);
    plan = applyOperations(plan, initial.operations).plan;
    const stamp = new Date().toISOString();
    const event: EventRecord = {
      id,
      ownerId: user!.id,
      mode: "demo",
      revision: 1,
      plan,
      messages: [
        {
          id: randomUUID(),
          role: "assistant",
          text: "This fictional sample starts with a prepared plan and sample dates 30 days from setup. Use the scenario prompts to explore updates.",
          createdAt: stamp,
        },
      ],
      proposals: [],
      history: [
        {
          id: randomUUID(),
          revision: 1,
          title: "Loaded fictional sample plan",
          changes: [],
          createdAt: stamp,
        },
      ],
      createdAt: stamp,
      updatedAt: stamp,
    };
    await db.collection<EventRecord>("events").insertOne(event);
  }
  console.log(
    `Sample events are ready for ${email}. Existing accounts and sample events were preserved.`,
  );
} finally {
  await client.close();
}
