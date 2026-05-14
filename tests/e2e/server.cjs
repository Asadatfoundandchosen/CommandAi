"use strict";
const http = require("http");
const port = Number(process.env.E2E_PORT || 4173);
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end();
});
server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`e2e-server-listening:${port}\n`);
});
