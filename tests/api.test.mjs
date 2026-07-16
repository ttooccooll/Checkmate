// Payment endpoint request-handling without a live wallet: method checks,
// server-side price list, hash validation, and generic errors when
// NWC_CONNECTION_STRING is absent.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { default: createInvoice } = await import(join(root, "api/create-invoice.js"));
const { default: checkInvoice } = await import(join(root, "api/check-invoice.js"));

delete process.env.NWC_CONNECTION_STRING;

function mockRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

const results = [];
async function run(name, handler, req, expectStatus) {
  const res = mockRes();
  await handler(req, res);
  results.push({ name, status: res.statusCode, pass: res.statusCode === expectStatus });
}

await run("create: wrong method", createInvoice, { method: "GET" }, 405);
await run("create: unknown item", createInvoice, { method: "POST", body: { item: "jetpack" } }, 400);
await run(
  "create: client-sent amount rejected",
  createInvoice,
  { method: "POST", body: { amount: 1, memo: "x" } },
  400
);
await run(
  "create: valid item, no env -> generic 502",
  createInvoice,
  { method: "POST", body: { item: "helmet" } },
  502
);
await run("check: wrong method", checkInvoice, { method: "POST", query: {} }, 405);
await run("check: bad hash", checkInvoice, { method: "GET", query: { paymentHash: "zzz" } }, 400);
await run("check: missing hash", checkInvoice, { method: "GET", query: {} }, 400);
await run(
  "check: valid hash, no env -> generic 502",
  checkInvoice,
  { method: "GET", query: { paymentHash: "a".repeat(64) } },
  502
);

const failed = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} -> ${r.status}`);
}
process.exit(failed.length ? 1 : 0);
