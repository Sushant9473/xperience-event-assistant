import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
export function config() {
  const jwtSecret = process.env.JWT_SECRET;
  if (
    !jwtSecret ||
    jwtSecret.length < 32 ||
    jwtSecret.startsWith("replace-with")
  )
    throw new Error(
      "Set JWT_SECRET in the root .env to a random secret of at least 32 characters.",
    );
  const origin =
    process.env.APP_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://127.0.0.1:3000";
  return {
    mongodbUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27019",
    database: process.env.MONGODB_DB || "xperience_assistant",
    jwtSecret,
    origin,
    secureCookies: new URL(origin).protocol === "https:",
    port: Number(process.env.PORT || 4000),
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  };
}
