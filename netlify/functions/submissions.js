// netlify/functions/submissions.js
// CommonJS function that handles CORS, POST (append a row) and GET (read rows)

const { google } = require("googleapis");

// Helper: keep real newlines even if Netlify stored \n
function normalizePrivateKey(raw) {
  if (!raw) return "";
  return raw.includes("BEGIN PRIVATE KEY") ? raw : raw.replace(/\\n/g, "\n");
}

// Helper: first sheet name (so you don't have to hardcode)
async function getFirstSheetTitle(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets && meta.data.sheets[0];
  const title = sheet?.properties?.title || "Sheet1";
  return title;
}

exports.handler = async (event) => {
  // CORS (allow the browser to POST)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
    const {
      GOOGLE_SHEETS_ID,
      GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY,
    } = process.env;

    if (!GOOGLE_SHEETS_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing Google env vars" }),
      };
    }

    const auth = new google.auth.JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: normalizePrivateKey(GOOGLE_PRIVATE_KEY),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const sheetTitle = await getFirstSheetTitle(sheets, GOOGLE_SHEETS_ID);

    if (event.httpMethod === "GET") {
      // Read rows for Manager Dashboard
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: `${sheetTitle}!A:H`,
      });

      const rows = res.data.values || [];
      const header = rows[0] || [];
      const body = rows.slice(1).map((r) => {
        const obj = {};
        header.forEach((h, i) => (obj[h] = r[i] ?? ""));
        return obj;
      });

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: JSON.stringify({ header, rows: body }),
      };
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");

      // Expected fields from the form
      const {
        date,             // ISO (yyyy-mm-dd) from <input type="date">
        housekeeper,      // string
        shift,            // "Morning" | "Middle" | "Evening"
        completedCount,   // number
        totalTasks,       // number
        completionRate,   // decimal 0..1
        submittedAt,      // ISO timestamp
        incomplete,       // array of strings (unchecked tasks)
      } = payload;

      // Protect against undefined values
      const safeDate = date || new Date().toISOString().slice(0, 10);
      const safeHK = housekeeper || "";
      const safeShift = shift || "";
      const safeCompleted = Number.isFinite(completedCount) ? completedCount : 0;
      const safeTotal = Number.isFinite(totalTasks) ? totalTasks : 0;
      const safeRate = Number.isFinite(completionRate) ? completionRate : 0;
      const safeSubmitted = submittedAt || new Date().toISOString();
      const safeIncomplete = Array.isArray(incomplete) ? incomplete : [];

      const row = [
        safeDate,
        safeHK,
        safeShift,
        String(safeCompleted),
        String(safeTotal),
        String(safeRate),
        safeSubmitted,
        safeIncomplete.join("\n"), // <-- Multi-line cell of unchecked tasks
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEETS_ID,
        range: `${sheetTitle}!A:H`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: JSON.stringify({ ok: true }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: String(err && err.message || err) }),
    };
  }
};
