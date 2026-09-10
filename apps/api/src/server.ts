import { MongoClient } from "mongodb";
import { config } from "./config.js";
import { createApp, ensureIndexes } from "./app.js";
import { makeAssistant } from "./ai.js";
const env = config();
const client = new MongoClient(env.mongodbUri, {
  serverSelectionTimeoutMS: 5000,
});
await client.connect();
const db = client.db(env.database);
await ensureIndexes(db);
const app = createApp(
  db,
  {
    jwtSecret: env.jwtSecret,
    origin: env.origin,
    secureCookies: env.secureCookies,
    liveAvailable: !!env.geminiKey,
  },
  makeAssistant(env.geminiKey, env.geminiModel),
);
const server = app.listen(env.port, "127.0.0.1", () =>
  console.log(
    `API ready at http://127.0.0.1:${env.port}. Assistant: ${env.geminiKey ? "Gemini + demo" : "demo (no Gemini key configured)"}.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await client.close();
      process.exit(0);
    }),
  );
