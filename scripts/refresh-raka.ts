/** Explicit local-demo publication; startup never overwrites someone's customized profile. */
import { rakaPackage } from "../apps/server/raka.js";
const origin = "http://127.0.0.1:3000";
let cookie = "";
async function call(path: string, body?: unknown) {
  const response = await fetch(origin + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies[0]!.split(";")[0]!;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
await call("/bootstrap");
await call("/session", { userId: "raka" });
const previous = (await call("/profile-history")).state;
const draft = await call("/profile-drafts", rakaPackage);
const published = await call(`/profile-drafts/${draft.id}/publish`, {
  revision: draft.revision,
  expectedVersion: previous.version,
});
console.log(
  JSON.stringify({
    profile: "http://127.0.0.1:3000/?profile=raka",
    previousPublication: previous.publicationId,
    publication: published.publicationId,
    version: published.version,
  }),
);
