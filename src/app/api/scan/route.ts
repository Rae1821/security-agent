import { analyzeWithPersistence, saveScan } from '@/src/lib/scanDb';
import { isMongoConfigured } from '@/src/lib/mongodb';
import { readAllSourceFiles } from '@/src/lib/fileReader';
import { buildResult } from '@/src/lib/report';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { targetDir } = await request.json();

    if (!targetDir || typeof targetDir !== 'string') {
      return NextResponse.json(
        { error: 'targetDir is required and must be a string' },
        { status: 400 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured on server' },
        { status: 500 },
      );
    }

    if (!isMongoConfigured()) {
      console.warn('MONGODB_URI not configured — scans will not be cached');
    }

    const resolvedPath = path.resolve(targetDir);

    const files = await readAllSourceFiles(resolvedPath);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No matching source files found at that path' },
        { status: 404 },
      );
    }

    const { findings, stats, contentFingerprint, loadedFromScanHistory, scanId } =
      await analyzeWithPersistence(
        resolvedPath,
        files,
        (current, total, fileName) => {
          console.log(`[${current}/${total}] ${fileName}`);
        },
      );

    const result = buildResult(findings, {
      targetDir: resolvedPath,
      filesScanned: files.length,
      filesFromCache: stats.filesFromCache,
      filesAnalyzed: stats.filesAnalyzed,
      contentFingerprint,
      fromCache: loadedFromScanHistory,
    });

    if (loadedFromScanHistory && scanId) {
      result.meta.id = scanId;
    } else if (!loadedFromScanHistory) {
      const scanId = await saveScan(result, stats);
      result.meta.id = scanId;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Scan error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Unknown error during scan' },
      { status: 500 },
    );
  }
}
