// netlify/functions/submissions.js
const { google } = require('googleapis');

const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB || 'Submissions';

// Build a Sheets client and normalize the private key so "\n" becomes real new lines
function getSheets() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let key = process.env.GOOGLE_PRIVATE_KEY || '';

  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  }

  // If someone pasted the whole JSON key into the env var by mistake, extract private_key
  try {
    if (key.trim().startsWith('{') && key.includes('"private_key"')) {
      const parsed = JSON.parse(key);
      key = parsed.private_key || key;
    }
  } catch (_) { /* ignore if not JSON */ }

  // Strip accidental wrapping quotes
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  // Convert "\n" to real newlines and tidy
  key = key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();

  // Sanity check
  if (!/BEGIN (RSA )?PRIVATE KEY/.test(key)) {
    throw new Error('GOOGLE_PRIVATE_KEY looks malformed after normalization');
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Simple helper to return responses with CORS
function respond(status, body = {}) {
  return {
    statusCode: status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') return respond(200);

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  // Parse the JSON body the form sends
  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Bad JSON' });
  }

  const {
    date,
    housekeeper,
    shift,
    completed = [],
    incomplete = [],
    totalTasks,
    completedCount
  } = payload;

    const nowISO = new Date().toISOString();
  const d = date || nowISO.slice(0, 10);

  const compCount = (typeof completedCount === 'number')
    ? completedCount
    : (Array.isArray(completed) ? completed.length : 0);

  const total = (typeof totalTasks === 'number')
    ? totalTasks
    : compCount + (Array.isArray(incomplete) ? incomplete.length : 0);

  // numeric 0..1 (Sheets shows as % because the column is formatted)
  const rate = total ? compCount / total : '';

  // pretty multi-line string for the sheet
  const incompleteStr = Array.isArray(incomplete) ? incomplete.join('\n') : '';

  // 8 columns matching the new header
  const row = [
    d,                    // A: Date
    housekeeper || '',    // B: Housekeeper
    shift || '',          // C: Shift
    compCount,            // D: Completed Tasks
    total,                // E: Total Tasks
    rate,                 // F: Completion Rate (0..1)
    nowISO,               // G: Submitted At
    incompleteStr         // H: Incomplete List
  ];

  try {
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    });
    return respond(200, { ok: true });
  } catch (err) {
    return respond(500, { error: String(err.message || err) });
  }
};
