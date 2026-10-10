import { test, expect } from "@playwright/test";
import { Agent, get } from "node:http";
import { setTimeout } from "node:timers/promises";

test("local API keeps pooled connections alive beyond the proxy's idle timeout", async () => {
  const agent = new Agent({ keepAlive: true, maxSockets: 1, timeout: 10000 });
  const read = () =>
    new Promise<{ status: number; reused: boolean; body: string }>((resolve, reject) => {
      const req = get("http://127.0.0.1:3001/api/health", { agent }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode!, reused: req.reusedSocket, body }));
        res.on("error", reject);
      });
      req.on("error", reject);
    });
  try {
    expect((await read()).status).toBe(200);
    // Cross the old upstream's five-second close boundary with an otherwise healthy socket.
    await setTimeout(5500);
    const next = await read();
    expect(next.reused).toBe(true);
    expect(next.status).toBe(200);
    expect(JSON.parse(next.body)).toEqual({ ok: true });
  } finally {
    agent.destroy();
  }
});
