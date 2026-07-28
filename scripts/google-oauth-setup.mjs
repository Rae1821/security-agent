/**
 * One-time setup: authorize this app to create Google Sheets in your Drive.
 *
 * Prerequisites (Google Cloud Console → APIs & Services → Credentials):
 * 1. Enable Google Drive API and Google Sheets API
 * 2. Create an OAuth 2.0 Client ID (type: Desktop app)
 * 3. Add your Google account as a test user (if the app is in "Testing")
 *
 * Usage:
 *   npm run google-oauth-setup
 * (reads GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET from .env.local)
 */

import { google } from 'googleapis';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { URL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET.\n' +
      'Add them to .env.local, or pass them as env vars when running this script.',
  );
  process.exit(1);
}

console.log(`Using client ID: ${CLIENT_ID.slice(0, 20)}...`);

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n1. Open this URL in your browser and sign in with your Gmail:\n');
console.log(authUrl);
console.log('\n2. After approving, you will be redirected back here automatically.\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing authorization code');
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      '<h1>Authorization successful</h1><p>You can close this tab and return to the terminal.</p>',
    );

    console.log('Success! Add these lines to your .env.local:\n');
    console.log(`GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(
      '\nKeep GOOGLE_DRIVE_FOLDER_ID pointing at a folder in your Drive.',
    );
    console.log(
      'You can remove GOOGLE_SERVICE_ACCOUNT_KEY_PATH — OAuth replaces it for exports.\n',
    );

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Token exchange failed:', err.message);
    if (err.message === 'invalid_client') {
      console.error(
        '\nThis usually means GOOGLE_OAUTH_CLIENT_SECRET in .env.local does not match\n' +
          'the secret in Google Cloud Console. Fix it by:\n' +
          '  1. Open console.cloud.google.com → APIs & Services → Credentials\n' +
          '  2. Click your OAuth 2.0 Client ID (type must be "Desktop app")\n' +
          '  3. Copy the Client secret again (or reset it) and update .env.local\n' +
          '  4. Run: npm run google-oauth-setup\n',
      );
    }
    res.writeHead(500);
    res.end('Authorization failed — see terminal for details');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for callback on http://localhost:${PORT} ...`);
});
