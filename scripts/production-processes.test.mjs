import { test } from "node:test";
import assert from "node:assert/strict";
import { productionProcesses } from "./production-processes.mjs";

test("local startup keeps web on 3000 and API on 4000", () => {
  const [api, web] = productionProcesses({});
  assert.equal(api.options.env.PORT, "4000");
  assert.equal(web.args.at(-1), "3000");
  assert.equal(web.options.env.PORT, "3000");
});
test("Render's public port never changes the internal API port", () => {
  const env = { PORT: "10000", RENDER_EXTERNAL_URL: "https://qa.onrender.com" };
  const [api, web] = productionProcesses(env);
  assert.equal(api.options.env.PORT, "4000");
  assert.equal(web.args.at(-1), "10000");
  assert.equal(web.options.env.PORT, "10000");
  assert.equal(api.options.env.RENDER_EXTERNAL_URL, env.RENDER_EXTERNAL_URL);
  assert.equal(env.PORT, "10000");
});
test("invalid or conflicting public ports fail before launching children", () => {
  for (const PORT of ["4000", "0", "65536", "invalid"])
    assert.throws(() => productionProcesses({ PORT }));
});
