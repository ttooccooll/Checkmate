// Share to Nostr via the player's NIP-07 extension (Alby, nos2x, …).
// The extension signs a kind-1 note; we publish it to a few well-known
// relays over bare WebSockets (NIP-01) — no libraries needed.

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

export function hasNostr() {
  return typeof window.nostr?.signEvent === "function";
}

function publishTo(relayUrl, signedEvent, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let ws;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    try {
      ws = new WebSocket(relayUrl);
    } catch {
      return done(false);
    }

    const timer = setTimeout(() => done(false), timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify(["EVENT", signedEvent]));
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data[0] === "OK" && data[1] === signedEvent.id) {
          clearTimeout(timer);
          done(data[2] === true);
        }
      } catch {
        /* ignore malformed relay chatter */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      done(false);
    };
  });
}

// Returns { ok: true, relays: n } on success, { ok: false, reason } otherwise.
// reasons: "no-extension" | "rejected" | "no-relay"
export async function shareToNostr(text) {
  if (!hasNostr()) return { ok: false, reason: "no-extension" };

  let signed;
  try {
    signed = await window.nostr.signEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "gamestr"],
        ["t", "checkmatedelivery"],
      ],
      content: text,
    });
  } catch {
    return { ok: false, reason: "rejected" };
  }

  const results = await Promise.all(RELAYS.map((r) => publishTo(r, signed)));
  const okCount = results.filter(Boolean).length;
  return okCount > 0
    ? { ok: true, relays: okCount }
    : { ok: false, reason: "no-relay" };
}
