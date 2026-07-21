import WebSocket from "ws";
import { NWCClient } from "@getalby/sdk/nwc";

// nostr-tools needs a global WebSocket; Node < 22 doesn't provide one.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

// The single source of truth for prices. The client only ever names an
// item — it can never choose an amount.
// continueRun is deliberately priced magnitudes above the upgrades:
// reviving a run must never be cheaper than playing well.
export const PRICES_SATS = {
  helmet: 50,
  speedBoost: 50,
  offRoadTreads: 75,
  shockAbsorbers: 75,
  metalDetector: 100,
  continueRun: 5000,
};

const REQUEST_TIMEOUT_MS = 15000;

export function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("NWC request timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// One fresh connection per invocation — serverless instances can't reliably
// reuse sockets across requests. Callers must close() in a finally block.
export function getNwcClient() {
  const url = process.env.NWC_CONNECTION_STRING;
  if (!url) {
    throw new Error("NWC_CONNECTION_STRING env var is not set");
  }
  return new NWCClient({ nostrWalletConnectUrl: url });
}
