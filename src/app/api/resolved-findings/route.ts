import {
  getResolvedFindingKeys,
  setFindingResolved,
} from '@/src/lib/scanDb';
import { isMongoConfigured } from '@/src/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const targetDir = request.nextUrl.searchParams.get('targetDir');

    if (!targetDir) {
      return NextResponse.json(
        { error: 'targetDir is required' },
        { status: 400 },
      );
    }

    if (!isMongoConfigured()) {
      return NextResponse.json({ resolvedKeys: [] });
    }

    const resolvedKeys = await getResolvedFindingKeys(targetDir);
    return NextResponse.json({ resolvedKeys });
  } catch (err) {
    console.error('Get resolved findings error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to load resolved findings' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { targetDir, findingKey, resolved } = (await request.json()) as {
      targetDir?: string;
      findingKey?: string;
      resolved?: boolean;
    };

    if (!targetDir || !findingKey || typeof resolved !== 'boolean') {
      return NextResponse.json(
        { error: 'targetDir, findingKey, and resolved are required' },
        { status: 400 },
      );
    }

    if (!isMongoConfigured()) {
      return NextResponse.json(
        { error: 'MONGODB_URI not configured' },
        { status: 500 },
      );
    }

    await setFindingResolved(targetDir, findingKey, resolved);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Update resolved finding error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to update finding' },
      { status: 500 },
    );
  }
}
