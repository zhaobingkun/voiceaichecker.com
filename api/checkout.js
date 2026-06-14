import { handleCheckout, sendJson } from "../src/server/handlers.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    await handleCheckout(req, res);
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Request failed" });
  }
}
