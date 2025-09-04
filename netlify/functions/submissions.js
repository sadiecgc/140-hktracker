// netlify/functions/submissions.js  (MULTI-COLUMN, CommonJS)
// Writes A:H and reads A2:H. Column H stores incomplete tasks (joined by "; ").

const { google } = require("googleapis");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const respond = (statusCode, data, extraHeaders = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
  body: typeof data === "string" ? data : JSON.stringify(data),
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, "");

  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
    // supports both one-line-with-\n and real newlines
    const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

    if (!email || !privateKey || !spreadsheetId) {
      return respond(500, { error: "Missing env vars" });
    }

    const auth = new google.auth.JWT(email, null, privateKey, [
      "https://www.googleapis.com/auth/spreadsheets",
    ]);
    const sheets = google.sheets({ version: "v4", auth });

    // ---- GET: read rows A2:H ----
    if (event.httpMethod === "GET") {
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "A2:H",
      });

      const rows = r.data.values || [];
      const headers = [
        "date",
        "housekeeper",
        "shift",
        "completedCount",
        "totalTasks",
        "completionRate",
        "submittedAt",
        "incompleteList",
      ];

      const submissions = rows.map((row) => {
        const o = {};
        headers.forEach((h, i) => (o[h] = row[i] ?? ""));
        o.completedCount = o.completedCount === "" ? "" : Number(o.completedCount);
        o.totalTasks     = o.totalTasks     === "" ? "" : Number(o.totalTasks);
        o.completionRate = o.completionRate === "" ? "" : Number(o.completionRate);
        // H stored as "a; b; c" -> array for UI
        o.incompleteList = o.incompleteList
          ? String(o.incompleteList).split(/;\s*/).filter(Boolean)
          : [];
        return o;
      });

      return respond(200, { submissions });
    }

    // ---- POST: append one row to A:H ----
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      // accept either 'incompleteList' (array/string) or 'incomplete'
      const inc = Array.isArray(body.incompleteList)
        ? body.incompleteList
        : Array.isArray(body.incomplete)
        ? body.incomplete
        : typeof body.incompleteList === "string"
        ? body.incompleteList.split(/,\s*|;\s*/).filter(Boolean)
        : typeof body.incomplete === "string"
        ? body.incomplete.split(/,\s*|;\s*/).filter(Boolean)
        : [];

      const completedCount = Number(body.completedCount ?? 0);
      const totalTasks     = Number(body.totalTasks ?? 0);
      const completionRate = totalTasks ? Math.round((completedCount / totalTasks) * 100) : 0;

      const row = [
        body.date || "",
        body.housekeeper || "",
        body.shift || "",
        String(completedCount),
        String(totalTasks),
        String(completionRate),                     // integer percent
        body.submittedAt || new Date().toISOString(),
        inc.join("; "),                              // Column H
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "A:H",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });

      return respond(200, { ok: true });
    }

    return respond(405, "Method Not Allowed");
  } catch (err) {
    return respond(500, { error: err.message || "Unknown error" });
  }
};
