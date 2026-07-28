import { getScanById } from '@/src/lib/scanDb';
import { isMongoConfigured } from '@/src/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!isMongoConfigured()) {
      return NextResponse.json(
        { error: 'MONGODB_URI not configured' },
        { status: 500 },
      );
    }

    const result = await getScanById(id);

    if (!result) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Get scan error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to load scan' },
      { status: 500 },
    );
  }
}
