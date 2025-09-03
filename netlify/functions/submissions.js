// Netlify Function: submissions (A:H)
const { google } = require('googleapis');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const RANGE_WRITE = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:H';
const RANGE_READ  = process.env.GOOGLE_SHEETS_GET_RANGE || 'Sheet1!A2:H';

function sheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    SCOPES
  );
  return google.sheets({ version: 'v4', auth });
}

exports.handler = async (event) => {
  const sheets = sheetsClient();
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const row = [
        b.date || '',
        b.housekeeper || '',
        b.shift || '',
        b.completedCount ?? '',
        b.totalTasks ?? '',
        b.completionRate ?? '',
        b.submittedAt || new Date().toISOString(),
        b.incompleteList || ''
      ];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: RANGE_WRITE,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'GET') {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: RANGE_READ,
      });
      const values = resp.data.values || [];
      const submissions = values.map(r => ({
        date: r[0] || '',
        housekeeper: r[1] || '',
        shift: r[2] || '',
        completedCount: r[3] ? Number(r[3]) : 0,
        totalTasks: r[4] ? Number(r[4]) : 0,
        completionRate: r[5] ? Number(r[5]) : 0,
        submittedAt: r[6] || '',
        incompleteList: r[7] || ''
      }));
      return { statusCode: 200, headers: cors, body: JSON.stringify({ submissions }) };
    }

    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: String(err) }) };
  }
};
