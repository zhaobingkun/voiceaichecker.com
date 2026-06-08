import { handleGoogleLoginCallback, sendJson } from "../../../src/server/handlers.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    const requestUrl = new URL(req.url, "http://localhost");
    await handleGoogleLoginCallback(req, res, requestUrl);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Request failed" });
  }
}
