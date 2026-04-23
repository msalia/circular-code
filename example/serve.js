const http = require("http");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  let url = req.url.split("?")[0];
  if (url === "/") url = "/index.html";

  const filePath = path.join(DIR, url);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Kill it with: lsof -ti:${PORT} | xargs kill`);
    console.error(`Or use a different port: PORT=3001 npm run example`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log("");
  console.log(`  Circular Code example app`);
  console.log(`  http://localhost:${PORT}`);
  console.log("");
  console.log("  Press Ctrl+C to stop");
  console.log("");
});
