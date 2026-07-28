import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { analyzeFile, Finding } from './analyzer';
import { SourceFile } from './fileReader';
import { getDb, isMongoConfigured } from './mongodb';
import { ScanResult, SeveritySummary } from './report';

export const ANALYSIS_MODEL = 'claude-sonnet-4-6';

const FILE_ANALYSES = 'file_analyses';
const SCANS = 'scans';
const RESOLVED_FINDINGS = 'resolved_findings';

export interface ResolvedFindingDoc {
  targetDir: string;
  findingKey: string;
  resolvedAt: Date;
}

export interface FileAnalysisDoc {
  targetDir: string;
  relativePath: string;
  contentHash: string;
  findings: Finding[];
  model: string;
  analyzedAt: Date;
}

export interface ScanDoc {
  _id?: ObjectId;
  targetDir: string;
  filesScanned: number;
  filesFromCache: number;
  filesAnalyzed: number;
  timestamp: string;
  contentFingerprint: string;
  summary: SeveritySummary;
  findings: Finding[];
  model: string;
  createdAt: Date;
}

export interface AnalyzeCacheStats {
  filesFromCache: number;
  filesAnalyzed: number;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function computeRepoFingerprint(files: SourceFile[]): string {
  const parts = files
    .map((file) => `${file.relativePath}:${hashContent(file.content)}`)
    .sort()
    .join('\n');

  return hashContent(parts);
}

async function getCachedFileAnalysis(
  targetDir: string,
  relativePath: string,
): Promise<FileAnalysisDoc | null> {
  const db = await getDb();
  return db.collection<FileAnalysisDoc>(FILE_ANALYSES).findOne({
    targetDir,
    relativePath,
  });
}

async function saveFileAnalysis(
  targetDir: string,
  file: SourceFile,
  findings: Finding[],
): Promise<void> {
  const db = await getDb();
  const contentHash = hashContent(file.content);

  await db.collection<FileAnalysisDoc>(FILE_ANALYSES).updateOne(
    { targetDir, relativePath: file.relativePath },
    {
      $set: {
        targetDir,
        relativePath: file.relativePath,
        contentHash,
        findings,
        model: ANALYSIS_MODEL,
        analyzedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export interface ScanListItem {
  id: string;
  targetDir: string;
  displayName: string;
  timestamp: string;
  filesScanned: number;
  findingsCount: number;
  summary: SeveritySummary;
}

function scanDocToResult(doc: ScanDoc, fromHistory = true): ScanResult {
  return {
    meta: {
      id: doc._id?.toString(),
      targetDir: doc.targetDir,
      filesScanned: doc.filesScanned,
      timestamp: doc.timestamp,
      filesFromCache: doc.filesFromCache,
      filesAnalyzed: doc.filesAnalyzed,
      contentFingerprint: doc.contentFingerprint,
      fromCache: fromHistory,
    },
    summary: doc.summary,
    findings: doc.findings,
  };
}

function displayNameForPath(targetDir: string): string {
  const parts = targetDir.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? targetDir;
}

export async function saveScan(
  result: ScanResult,
  stats: AnalyzeCacheStats,
): Promise<string> {
  const db = await getDb();

  const doc: ScanDoc = {
    targetDir: result.meta.targetDir,
    filesScanned: result.meta.filesScanned,
    filesFromCache: stats.filesFromCache,
    filesAnalyzed: stats.filesAnalyzed,
    timestamp: result.meta.timestamp,
    contentFingerprint: result.meta.contentFingerprint ?? '',
    summary: result.summary,
    findings: result.findings,
    model: ANALYSIS_MODEL,
    createdAt: new Date(),
  };

  const insertResult = await db.collection<ScanDoc>(SCANS).insertOne(doc);
  return insertResult.insertedId.toString();
}

export async function listScans(): Promise<ScanListItem[]> {
  const db = await getDb();
  const docs = await db
    .collection<ScanDoc>(SCANS)
    .aggregate<ScanDoc>([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$targetDir',
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { createdAt: -1 } },
    ])
    .toArray();

  return docs.map((doc) => ({
    id: doc._id!.toString(),
    targetDir: doc.targetDir,
    displayName: displayNameForPath(doc.targetDir),
    timestamp: doc.timestamp,
    filesScanned: doc.filesScanned,
    findingsCount: doc.findings.length,
    summary: doc.summary,
  }));
}

export async function getScanById(id: string): Promise<ScanResult | null> {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDb();
  const doc = await db.collection<ScanDoc>(SCANS).findOne({
    _id: new ObjectId(id),
  });

  if (!doc) return null;
  return scanDocToResult(doc);
}

export async function getCachedScan(
  targetDir: string,
  contentFingerprint: string,
): Promise<ScanResult | null> {
  const db = await getDb();
  const doc = await db.collection<ScanDoc>(SCANS).findOne(
    { targetDir, contentFingerprint },
    { sort: { createdAt: -1 } },
  );

  if (!doc) return null;

  return scanDocToResult(doc, true);
}

export async function getResolvedFindingKeys(
  targetDir: string,
): Promise<string[]> {
  const db = await getDb();
  const docs = await db
    .collection<ResolvedFindingDoc>(RESOLVED_FINDINGS)
    .find({ targetDir })
    .project({ findingKey: 1 })
    .toArray();

  return docs.map((doc) => doc.findingKey);
}

export async function setFindingResolved(
  targetDir: string,
  findingKey: string,
  resolved: boolean,
): Promise<void> {
  const db = await getDb();
  const collection = db.collection<ResolvedFindingDoc>(RESOLVED_FINDINGS);

  if (resolved) {
    await collection.updateOne(
      { targetDir, findingKey },
      { $set: { targetDir, findingKey, resolvedAt: new Date() } },
      { upsert: true },
    );
    return;
  }

  await collection.deleteOne({ targetDir, findingKey });
}

export async function analyzeFilesWithCache(
  targetDir: string,
  files: SourceFile[],
  onProgress?: (current: number, total: number, fileName: string) => void,
): Promise<{ findings: Finding[]; stats: AnalyzeCacheStats }> {
  const stats: AnalyzeCacheStats = {
    filesFromCache: 0,
    filesAnalyzed: 0,
  };
  const allFindings: Finding[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.relativePath);

    const contentHash = hashContent(file.content);
    const cached = await getCachedFileAnalysis(targetDir, file.relativePath);

    if (
      cached &&
      cached.contentHash === contentHash &&
      cached.model === ANALYSIS_MODEL
    ) {
      allFindings.push(...cached.findings);
      stats.filesFromCache++;
      continue;
    }

    const findings = await analyzeFile(file);
    allFindings.push(...findings);
    stats.filesAnalyzed++;

    await saveFileAnalysis(targetDir, file, findings);

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return { findings: allFindings, stats };
}

export async function analyzeFilesWithoutCache(
  files: SourceFile[],
  onProgress?: (current: number, total: number, fileName: string) => void,
): Promise<{ findings: Finding[]; stats: AnalyzeCacheStats }> {
  const allFindings: Finding[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.relativePath);

    const findings = await analyzeFile(file);
    allFindings.push(...findings);

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return {
    findings: allFindings,
    stats: { filesFromCache: 0, filesAnalyzed: files.length },
  };
}

export async function analyzeWithPersistence(
  targetDir: string,
  files: SourceFile[],
  onProgress?: (current: number, total: number, fileName: string) => void,
): Promise<{
  findings: Finding[];
  stats: AnalyzeCacheStats;
  contentFingerprint: string;
  loadedFromScanHistory: boolean;
  scanId?: string;
}> {
  const contentFingerprint = computeRepoFingerprint(files);

  if (isMongoConfigured()) {
    const cachedScan = await getCachedScan(targetDir, contentFingerprint);
    if (cachedScan) {
      return {
        findings: cachedScan.findings,
        stats: {
          filesFromCache: cachedScan.meta.filesScanned ?? files.length,
          filesAnalyzed: 0,
        },
        contentFingerprint,
        loadedFromScanHistory: true,
        scanId: cachedScan.meta.id,
      };
    }

    const result = await analyzeFilesWithCache(targetDir, files, onProgress);
    return { ...result, contentFingerprint, loadedFromScanHistory: false };
  }

  const result = await analyzeFilesWithoutCache(files, onProgress);
  return {
    ...result,
    contentFingerprint,
    loadedFromScanHistory: false,
  };
}
