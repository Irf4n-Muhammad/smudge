import { headers } from "next/headers";

/** Server-side read of a share link's public data, for link previews. Null when unavailable. */
export async function publicJson<T>(path: string): Promise<T | null> {
  const port = process.env.FORMA_API_PORT ?? "3001";
  try {
    // Keep the visitor's own rate-limit bucket instead of sharing the web server's.
    const client = (await headers()).get("x-forma-client-ip");
    const response = await fetch(`http://127.0.0.1:${port}/api/public${path}`, {
      cache: "no-store",
      headers: client ? { "x-forma-client-ip": client } : {},
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}
export const metadataBase = new URL(process.env.FORMA_PUBLIC_URL ?? "http://127.0.0.1:3000");
