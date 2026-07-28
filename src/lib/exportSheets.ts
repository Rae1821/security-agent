import { google } from 'googleapis';
import { ScanResult } from './report';
import { Severity } from './analyzer';
import path from 'path';

// Background colors for severity rows in the sheet
const SEVERITY_COLORS: Record<
  Severity,
  { red: number; green: number; blue: number }
> = {
  critical: { red: 0.96, green: 0.8, blue: 0.8 },
  high: { red: 0.98, green: 0.9, blue: 0.78 },
  medium: { red: 1.0, green: 0.97, blue: 0.8 },
  low: { red: 0.81, green: 0.9, blue: 0.97 },
  informational: { red: 0.93, green: 0.93, blue: 0.93 },
};

const HEADERS = [
  'Severity',
  'Title',
  'File',
  'Line',
  'Vulnerability Class',
  'Confidence',
  'Explanation',
  'Exploit Scenario',
  'Remediation',
];

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

function usesOAuth(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
}

async function getAuthClient() {
  if (usesOAuth()) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
    oauth2.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    });
    return oauth2;
  }

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) {
    throw new Error(
      'Google Sheets export is not configured. For personal Gmail accounts, run `npm run google-oauth-setup` ' +
        'and add the OAuth variables to .env.local. Service accounts created after April 2025 cannot create Drive files.',
    );
  }

  return new google.auth.GoogleAuth({
    keyFile: path.resolve(keyPath),
    scopes: SCOPES,
  });
}

async function transferSpreadsheetOwnership(
  drive: ReturnType<typeof google.drive>,
  spreadsheetId: string,
  ownerEmail: string,
) {
  await drive.permissions.create({
    fileId: spreadsheetId,
    transferOwnership: true,
    requestBody: {
      type: 'user',
      role: 'owner',
      emailAddress: ownerEmail,
    },
  });
}

export async function exportToSheets(
  result: ScanResult,
  sheetTitle?: string,
): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID not set in .env.local');
  }

  const ownerEmail = process.env.GOOGLE_DRIVE_OWNER_EMAIL;
  const authWithUser = usesOAuth();

  if (!authWithUser && !ownerEmail) {
    throw new Error(
      'GOOGLE_DRIVE_OWNER_EMAIL not set in .env.local — set this to your Gmail, or switch to OAuth via `npm run google-oauth-setup`',
    );
  }

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  // 1. Create a new spreadsheet
  const repoName =
    result.meta.targetDir.split('/').filter(Boolean).pop() ?? 'scan';
  const date = new Date().toISOString().split('T')[0];
  const title = sheetTitle ?? `Security Scan — ${repoName} — ${date}`;

  // OAuth creates files directly in your Drive. Service accounts created after
  // April 2025 have 0 bytes of storage and cannot own files at all.
  let spreadsheetId: string;
  try {
    const file = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [folderId],
      },
      fields: 'id',
    });
    spreadsheetId = file.data.id!;
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (
      message.includes('storage quota') ||
      message.includes('storageQuotaExceeded') ||
      message.includes('do not have storage quota')
    ) {
      throw new Error(
        'Your service account cannot create Google Drive files. Google assigns new service accounts 0 bytes of storage ' +
          '(this is not your personal Drive being full). Run `npm run google-oauth-setup`, add the OAuth variables to .env.local, ' +
          'and export again using your Gmail account instead.',
      );
    }
    throw err;
  }

  if (!authWithUser && ownerEmail) {
    await transferSpreadsheetOwnership(drive, spreadsheetId, ownerEmail);
  }

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });

  const findingsSheetId =
    spreadsheet.data.sheets?.[0].properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: findingsSheetId,
              title: 'Findings',
            },
            fields: 'title',
          },
        },
        {
          addSheet: {
            properties: { title: 'Summary' },
          },
        },
      ],
    },
  });

  // 2. Write findings rows
  const findingRows = result.findings.map((f) => [
    f.severity,
    f.title,
    f.file,
    f.line ?? '',
    f.vulnerability_class,
    f.confidence,
    f.explanation,
    f.exploit_scenario,
    f.remediation,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Findings!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [HEADERS, ...findingRows],
    },
  });

  // 3. Write summary rows
  const summaryRows = Object.entries(result.summary).map(
    ([severity, count]) => [severity, count],
  );

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Summary!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Target', result.meta.targetDir],
        ['Files Scanned', result.meta.filesScanned],
        ['Scan Date', result.meta.timestamp],
        ['Total Findings', result.findings.length],
        [],
        ['Severity', 'Count'],
        ...summaryRows,
      ],
    },
  });

  // 4. Format: bold header row, freeze it, color severity rows
  const colorRequests = result.findings.map((f, i) => ({
    repeatCell: {
      range: {
        sheetId: findingsSheetId,
        startRowIndex: i + 1,
        endRowIndex: i + 2,
        startColumnIndex: 0,
        endColumnIndex: HEADERS.length,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor:
            SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.informational,
        },
      },
      fields: 'userEnteredFormat.backgroundColor',
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: findingsSheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId: findingsSheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: findingsSheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: HEADERS.length,
            },
          },
        },
        ...colorRequests,
      ],
    },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
