import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  handleDetect,
  handleGoogleLogin,
  handleGoogleLoginCallback,
  handleHealth,
  handleLogout,
  handleMe,
  handleRobots,
  handleSitemap,
  sendJson
} from "./src/server/handlers.js";
import { config } from "./src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const getCacheControl = (extension) => {
  if (extension === ".html") {
    return "no-store";
  }

  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"].includes(extension)) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=3600, must-revalidate";
};

const serveStatic = async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.normalize(path.join(publicDir, safePath));

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  let fileStat = await stat(filePath);
  if (fileStat.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    fileStat = await stat(filePath);
  }

  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": getCacheControl(extension)
  });
  createReadStream(filePath).pipe(res);
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && requestUrl.pathname === "/auth/google") {
      handleGoogleLogin(res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/auth/google/callback") {
      await handleGoogleLoginCallback(req, res, requestUrl);
      return;
    }

    if ((req.method === "POST" || req.method === "GET") && requestUrl.pathname === "/auth/logout") {
      handleLogout(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/me") {
      handleMe(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      handleHealth(res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/sitemap.xml") {
      handleSitemap(req, res);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/robots.txt") {
      handleRobots(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/detect") {
      await handleDetect(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Request failed" });
  }
});

server.listen(config.port, () => {
  console.log(`AI Voice Detector MVP running at http://localhost:${config.port}`);
  console.log(`Provider configured: ${Boolean(config.modulateApiKey && config.modulateApiUrl)}`);
});
