'use client';

import { SeverityBadge } from '@/components/severity-badge';
import { ScanListItem } from '@/src/lib/scanDb';
import { Severity } from '@/src/lib/analyzer';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const HIGHLIGHT_SEVERITIES: Severity[] = ['critical', 'high'];

function formatScanDate(timestamp: string) {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

interface ScanHistoryProps {
  scans: ScanListItem[];
  loading: boolean;
  selectedScanId: string | null;
  loadingScanId: string | null;
  onSelect: (scan: ScanListItem) => void;
}

export function ScanHistory({
  scans,
  loading,
  selectedScanId,
  loadingScanId,
  onSelect,
}: ScanHistoryProps) {
  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <Card>
        <CardHeader>
          <CardTitle>Previous scans</CardTitle>
          <CardDescription>
            Click a project to view its saved results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" />
              Loading scans...
            </div>
          ) : scans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved scans yet. Run a scan to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {scans.map((scan) => {
                const isSelected = selectedScanId === scan.id;
                const isLoading = loadingScanId === scan.id;
                const issueHighlights = HIGHLIGHT_SEVERITIES.filter(
                  (severity) => scan.summary[severity] > 0,
                );

                return (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() => onSelect(scan)}
                    disabled={isLoading}
                    className={cn(
                      'flex w-full flex-col gap-2 rounded-lg border px-3 py-3 text-left transition-colors',
                      'border-transparent bg-muted/50 hover:bg-muted',
                      isSelected && 'border-ring bg-muted hover:bg-secondary',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium leading-snug">
                        {scan.displayName}
                      </span>
                      {isLoading && <Loader2 className="animate-spin" />}
                    </div>
                    <span className="line-clamp-2 font-mono text-xs text-muted-foreground">
                      {scan.targetDir}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {scan.findingsCount} issue
                        {scan.findingsCount === 1 ? '' : 's'}
                      </span>
                      {issueHighlights.map((severity) => (
                        <SeverityBadge
                          key={severity}
                          severity={severity}
                          count={scan.summary[severity]}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatScanDate(scan.timestamp)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}
