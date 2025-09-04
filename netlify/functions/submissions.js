// netlify/functions/submissions.js (MULTI-COLUMN, CommonJS)
// Writes each field to A:H so your Sheet columns fill correctly.
// Header row (A1:H1):
// date | housekeeper | shift | completedCount | totalTasks | completionRate | submittedAt | incompleteList

const { google } = require("googleapis");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};
const respond = (s, d) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify(d),
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
    // works with either one-line-with-\n or real newlines
    const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    if (!email || !privateKey || !spreadsheetId) return respond(500, { error: "Missing env vars" });

    const auth = new google.auth.JWT(email, null, privateKey, ["https://www.googleapis.com/auth/spreadsheets"]);
    const sheets = google.sheets({ version: "v4", auth });

    if (event.httpMethod === "GET") {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: "A2:H" });
      const rows = r.data.values || [];
      const headers = ["date","housekeeper","shift","completedCount","totalTasks","completionRate","submittedAt","incompleteList"];
      const submissions = rows.map(row => {
        const o = {};
        headers.forEach((h,i)=> o[h] = row[i] ?? "");
        o.completedCount = o.completedCount === "" ? "" : Number(o.completedCount);
        o.totalTasks     = o.totalTasks     === "" ? "" : Number(o.totalTasks);
        o.completionRate = o.completionRate === "" ? "" : Number(o.completionRate);
        // H is stored as "a; b; c" → return an array for the UI
        o.incompleteList = o.incompleteList ? String(o.incompleteList).split(/;\s*/) : [];
        return o;
      });
      return respond(200, { submissions });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      // accept either "incomplete" OR "incompleteList" from the form
      let inc =
        Array.isArray(body.incompleteList) ? body.incompleteList :
        Array.isArray(body.incomplete)     ? body.incomplete :
        typeof body.incompleteList === "string" ? body.incompleteList.split(/,\s*|;\s*/) :
        typeof body.incomplete === "string"     ? body.incomplete.split(/,\s*|;\s*/) :
        [];

      const completedCount = Number(body.completedCount ?? 0);
      const totalTasks     = Number(body.totalTasks ?? 0);
      const completionRate = totalTasks ? Math.round((completedCount / totalTasks) * 100) : 0;

      const row = [
        body.date || "",
        body.housekeeper || "",
        body.shift || "",
        String(completedCount),
        String(totalTasks),
        String(completionRate),  // store integer percent
        body.submittedAt || new Date().toISOString(),
        inc.join("; ")           // column H
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "A:H",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });

      return respond(200, { ok: true });
    }

    return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };
  } catch (e) {
    return respond(500, { error: e.message || "Unknown error" });
  }
};
