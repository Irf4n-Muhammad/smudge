import http from "node:http";

/**
 * Single public entry point for production. One port serves two origins by Host name: the app
 * (Next.js, which forwards /api to the API) and the post runtime, which must stay a separate
 * origin so post code can never read the app's cookies.
 */
export function createEdge({ appHost, runtimeHost, appPort, runtimePort, clientIpHeader, hsts }) {
  return http.createServer((req, res) => {
    const host = (req.headers.host ?? "").toLowerCase();
    const port = host === runtimeHost ? runtimePort : host === appHost ? appPort : null;
    if (port === null) {
      res.writeHead(421, { "Content-Type": "text/plain" }).end("Unknown host");
      return;
    }
    const forwarded = clientIpHeader ? req.headers[clientIpHeader] : undefined;
    const clientIp =
      (typeof forwarded === "string" && forwarded.split(",")[0].trim()) ||
      req.socket.remoteAddress ||
      "unknown";
    const headers = { ...req.headers, "x-forma-client-ip": clientIp };
    const upstream = http.request(
      { host: "127.0.0.1", port, method: req.method, path: req.url, headers },
      (response) => {
        const out = { ...response.headers };
        if (hsts) out["strict-transport-security"] = "max-age=31536000; includeSubDomains";
        res.writeHead(response.statusCode ?? 502, out);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Upstream unavailable");
    });
    req.pipe(upstream);
  });
}
