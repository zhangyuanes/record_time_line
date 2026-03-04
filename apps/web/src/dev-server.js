const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5173);
const ROOT = path.resolve(__dirname, "..");
const INDEX_HTML = path.join(ROOT, "index.html");

function send(res, status, contentType, body) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/api/config") {
    return send(
      res,
      200,
      "application/json; charset=utf-8",
      JSON.stringify(
        {
          apiBaseUrl: process.env.API_BASE_URL || "http://127.0.0.1:8787",
          prototypeRegistry: "/src/features/prototype/prototype-registry.json"
        },
        null,
        2
      )
    );
  }

  if (requestUrl.pathname === "/src/features/prototype/prototype-registry.json") {
    const p = path.join(ROOT, "src", "features", "prototype", "prototype-registry.json");
    if (!fs.existsSync(p)) {
      return send(res, 404, "application/json; charset=utf-8", "{\"error\":\"MISSING_REGISTRY\"}");
    }
    return send(res, 200, "application/json; charset=utf-8", fs.readFileSync(p, "utf8"));
  }

  if (!fs.existsSync(INDEX_HTML)) {
    return send(res, 500, "text/plain; charset=utf-8", "Missing apps/web/index.html");
  }

  return send(res, 200, "text/html; charset=utf-8", fs.readFileSync(INDEX_HTML, "utf8"));
});

server.listen(PORT, HOST, () => {
  console.log(`[web] running at http://${HOST}:${PORT}`);
});
