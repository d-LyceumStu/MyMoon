import { getStore } from "@netlify/blobs";

// Set HOST_PASSWORD in Netlify (Site settings > Environment variables). Fallback is used if not set.
const HOST_PASSWORD = process.env.HOST_PASSWORD || "dj909097";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const store = getStore("messages");
  const isHost = () => typeof b.password === "string" && b.password === HOST_PASSWORD;

  async function all() {
    const { blobs } = await store.list();
    const items = await Promise.all(blobs.map((x) => store.get(x.key, { type: "json" })));
    return items.filter(Boolean).sort((a, z) => a.at - z.at);
  }

  // Visitor sends a message
  if (b.action === "send") {
    const name = String(b.name || "").trim().slice(0, 40);
    const text = String(b.text || "").trim().slice(0, 1000);
    const token = String(b.token || "").slice(0, 100);
    if (!name || !text || !token) return json({ error: "missing" }, 400);
    const id = Date.now() + "-" + crypto.randomUUID().slice(0, 8);
    await store.setJSON(id, { id, name, text, token, at: Date.now(), reply: "" });
    return json({ ok: true });
  }

  // Visitor sees ONLY their own conversation (matched by private token)
  if (b.action === "thread") {
    const token = String(b.token || "");
    if (!token) return json({ items: [] });
    const items = (await all())
      .filter((m) => m.token === token)
      .map(({ text, reply, at }) => ({ text, reply, at }));
    return json({ items });
  }

  // Host: password required
  if (b.action === "list") {
    if (!isHost()) return json({ error: "denied" }, 401);
    const items = (await all()).reverse().map(({ id, name, text, reply, at }) => ({ id, name, text, reply, at }));
    return json({ items });
  }

  if (b.action === "reply") {
    if (!isHost()) return json({ error: "denied" }, 401);
    const m = await store.get(String(b.id), { type: "json" });
    if (!m) return json({ error: "not found" }, 404);
    m.reply = String(b.reply || "").slice(0, 1000);
    await store.setJSON(m.id, m);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
};

export const config = { path: "/api/chat" };
