import { listScans } from '@/src/lib/scanDb';
import { isMongoConfigured } from '@/src/lib/mongodb';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    if (!isMongoConfigured()) {
      return NextResponse.json({ scans: [] });
    }

    const scans = await listScans();
    return NextResponse.json({ scans });
  } catch (err) {
    console.error('List scans error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to load scans' },
      { status: 500 },
    );
  }
}
