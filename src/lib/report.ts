import { Finding, Severity } from './analyzer';

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4,
};

export type SeveritySummary = Record<Severity, number>;

export interface ScanMeta {
  id?: string;
  targetDir: string;
  filesScanned: number;
  timestamp: string;
  filesFromCache?: number;
  filesAnalyzed?: number;
  contentFingerprint?: string;
  fromCache?: boolean;
}

export interface ScanResult {
  meta: ScanMeta;
  summary: SeveritySummary;
  findings: Finding[];
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sevDiff =
      (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
    if (sevDiff !== 0) return sevDiff;
    return a.file.localeCompare(b.file);
  });
}

export function summarize(findings: Finding[]): SeveritySummary {
  const counts: SeveritySummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };

  for (const f of findings) {
    if (f.severity in counts) counts[f.severity]++;
  }

  return counts;
}

export function buildResult(
  findings: Finding[],
  meta: {
    targetDir: string;
    filesScanned: number;
    filesFromCache?: number;
    filesAnalyzed?: number;
    contentFingerprint?: string;
    fromCache?: boolean;
  },
): ScanResult {
  return {
    meta: {
      targetDir: meta.targetDir,
      filesScanned: meta.filesScanned,
      timestamp: new Date().toISOString(),
      filesFromCache: meta.filesFromCache,
      filesAnalyzed: meta.filesAnalyzed,
      contentFingerprint: meta.contentFingerprint,
      fromCache: meta.fromCache,
    },
    summary: summarize(findings),
    findings: sortFindings(findings),
  };
}
