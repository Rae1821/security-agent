import { exportToSheets } from '@/src/lib/exportSheets';
import { ScanResult } from '@/src/lib/report';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { result, sheetTitle } = (await request.json()) as {
      result: ScanResult;
      sheetTitle?: string;
    };

    if (!result) {
      return NextResponse.json(
        { error: 'result is required' },
        { status: 400 },
      );
    }

    const url = await exportToSheets(result, sheetTitle);

    return NextResponse.json({ url });
  } catch (err) {
    console.error('Sheets export error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Export failed' },
      { status: 500 },
    );
  }
}
