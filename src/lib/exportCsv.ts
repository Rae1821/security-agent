import { buildFixPrompt } from './fixPrompt';
import { ScanResult } from './report';

// Escape a cell value for CSV: wrap in quotes, escape internal quotes
function escapeCell(value: string | undefined | null): string {
  const str = value ?? '';
  return `"${str.replace(/"/g, '""')}"`;
}

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
  'AI Fix Prompt',
];

export function findingsToCsv(result: ScanResult): string {
  const rows: string[] = [HEADERS.join(',')];

  for (const f of result.findings) {
    const row = [
      escapeCell(f.severity),
      escapeCell(f.title),
      escapeCell(f.file),
      escapeCell(f.line),
      escapeCell(f.vulnerability_class),
      escapeCell(f.confidence),
      escapeCell(f.explanation),
      escapeCell(f.exploit_scenario),
      escapeCell(f.remediation),
      escapeCell(buildFixPrompt(f)),
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

export function buildCsvFilename(targetDir: string): string {
  const repoName = targetDir.split('/').filter(Boolean).pop() ?? 'scan';
  const date = new Date().toISOString().split('T')[0];
  return `security-scan-${repoName}-${date}.csv`;
}
