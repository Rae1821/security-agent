import { analyzeWithPersistence, saveScan } from '@/src/lib/scanDb';
import { isMongoConfigured } from '@/src/lib/mongodb';
import { readAllSourceFiles } from '@/src/lib/fileReader';
import { buildResult } from '@/src/lib/report';
import { unzipToTmp } from '@/src/lib/unzip';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

export const maxDuration = 300;

async function resolveTargetDir(request: NextRequest): Promise<string> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      throw new Error('file is required when uploading a zip archive');
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      throw new Error('Uploaded file must be a .zip archive');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    return unzipToTmp(buffer, file.name);
  }

  const { targetDir } = await request.json();

  if (!targetDir || typeof targetDir !== 'string') {
    throw new Error('targetDir is required and must be a string');
  }

  return path.resolve(targetDir);
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured on server' },
        { status: 500 },
      );
    }

    if (!isMongoConfigured()) {
      console.warn('MONGODB_URI not configured — scans will not be cached');
    }

    let resolvedPath: string;
    try {
      resolvedPath = await resolveTargetDir(request);
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 400 },
      );
    }

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
    } else if (!loadedFromScanHistory && isMongoConfigured()) {
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
