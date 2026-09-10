import { afterEach, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
afterEach(() => vi.unstubAllEnvs());
it("uses Render's HTTPS origin and secure cookies without a local env file", () => {
  vi.stubEnv("JWT_SECRET", "deployment-test-secret-at-least-32-characters");
  vi.stubEnv("APP_ORIGIN", undefined);
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://qa.onrender.com");
  expect(config().origin).toBe("https://qa.onrender.com");
  expect(config().secureCookies).toBe(true);
});
it("preserves explicit origins and the local default", () => {
  vi.stubEnv("JWT_SECRET", "deployment-test-secret-at-least-32-characters");
  vi.stubEnv("APP_ORIGIN", "https://events.example.com");
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://qa.onrender.com");
  expect(config().origin).toBe("https://events.example.com");
  vi.stubEnv("APP_ORIGIN", undefined);
  vi.stubEnv("RENDER_EXTERNAL_URL", undefined);
  expect(config().origin).toBe("http://127.0.0.1:3000");
  expect(config().secureCookies).toBe(false);
});
