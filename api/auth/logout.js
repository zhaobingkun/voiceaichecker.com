import { handleLogout, sendJson } from "../../src/server/handlers.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    handleLogout(req, res);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Request failed" });
  }
}
