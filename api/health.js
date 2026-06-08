import { handleHealth, sendJson } from "../src/server/handlers.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    handleHealth(res);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Request failed" });
  }
}
