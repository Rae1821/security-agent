'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildCsvFilename, findingsToCsv } from '@/src/lib/exportCsv';
import { ScanListItem } from '@/src/lib/scanDb';
import { ScanResult } from '@/src/lib/report';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ScanHistory } from '@/components/scan-history';
import { ScanResultsPanel } from '@/components/scan-results-panel';

export default function Home() {
  const [targetDir, setTargetDir] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [scansLoading, setScansLoading] = useState(true);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  async function loadResolvedKeys(targetDir: string) {
    try {
      const res = await fetch(
        `/api/resolved-findings?targetDir=${encodeURIComponent(targetDir)}`,
      );
      const data = await res.json();
      if (res.ok) {
        setResolvedKeys(new Set(data.resolvedKeys ?? []));
      }
    } catch (err) {
      console.error('Failed to load resolved findings:', err);
    }
  }

  async function loadScanHistory() {
    setScansLoading(true);
    try {
      const res = await fetch('/api/scans');
      const data = await res.json();
      if (res.ok) {
        setScans(data.scans);
      }
    } catch (err) {
      console.error('Failed to load scan history:', err);
    } finally {
      setScansLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setScansLoading(true);
      try {
        const res = await fetch('/api/scans');
        const data = await res.json();
        if (!cancelled && res.ok) {
          setScans(data.scans);
        }
      } catch (err) {
        console.error('Failed to load scan history:', err);
      } finally {
        if (!cancelled) {
          setScansLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleScan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedScanId(null);

    try {
      let res: Response;

      if (zipFile) {
        const formData = new FormData();
        formData.append('file', zipFile);
        res = await fetch('/api/scan', {
          method: 'POST',
          body: formData,
        });
      } else {
        res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetDir }),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Scan failed');
      } else {
        setResult(data);
        setSelectedScanId(data.meta.id ?? null);
        void loadScanHistory();
        void loadResolvedKeys(data.meta.targetDir);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectScan(scan: ScanListItem) {
    setHistoryLoadingId(scan.id);
    setError(null);

    try {
      const res = await fetch(`/api/scans/${scan.id}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to load scan');
        return;
      }

      setResult(data);
      setSelectedScanId(scan.id);
      setTargetDir(data.meta.targetDir);
      void loadResolvedKeys(data.meta.targetDir);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setHistoryLoadingId(null);
    }
  }

  async function handleToggleResolved(key: string, resolved: boolean) {
    if (!result) return;

    setTogglingKey(key);
    const previous = new Set(resolvedKeys);

    setResolvedKeys((current) => {
      const next = new Set(current);
      if (resolved) next.add(key);
      else next.delete(key);
      return next;
    });

    try {
      const res = await fetch('/api/resolved-findings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetDir: result.meta.targetDir,
          findingKey: key,
          resolved,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update finding');
      }
    } catch (err) {
      setResolvedKeys(previous);
      setError(err instanceof Error ? err.message : 'Failed to update finding');
    } finally {
      setTogglingKey(null);
    }
  }

  function handleCsvDownload() {
    if (!result) return;

    const csv = findingsToCsv(result);
    const filename = buildCsvFilename(result.meta.targetDir);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className='mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-6 py-12 lg:grid-cols-[minmax(240px,280px)_1fr]'>
      <ScanHistory
        scans={scans}
        loading={scansLoading}
        selectedScanId={selectedScanId}
        loadingScanId={historyLoadingId}
        onSelect={handleSelectScan}
      />

      <div className='flex min-w-0 flex-col gap-8'>
        <div className='flex flex-col gap-2'>
          <h1 className='text-3xl font-bold tracking-tight'>
            Security Scan Agent
          </h1>
          <p className='text-muted-foreground'>
            Static code analysis for web applications, powered by Claude.
          </p>
        </div>

        <form onSubmit={handleScan} className='flex flex-col gap-3'>
          <div className='flex gap-3'>
            <Input
              type='text'
              value={targetDir}
              onChange={(e) => {
                setTargetDir(e.target.value);
                if (e.target.value) setZipFile(null);
              }}
              placeholder='/absolute/path/to/your/repo'
              className='flex-1'
              disabled={!!zipFile}
              required={!zipFile}
            />
            <Button type='submit' disabled={loading || (!targetDir && !zipFile)}>
              {loading && (
                <Loader2 data-icon='inline-start' className='animate-spin' />
              )}
              {loading ? 'Scanning...' : 'Scan'}
            </Button>
          </div>
          <div className='flex items-center gap-3'>
            <span className='text-sm text-muted-foreground'>or</span>
            <Input
              type='file'
              accept='.zip,application/zip'
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setZipFile(file);
                if (file) setTargetDir('');
              }}
              className='flex-1'
            />
            {zipFile && (
              <span className='truncate text-sm text-muted-foreground'>
                {zipFile.name}
              </span>
            )}
          </div>
        </form>

        {loading && (
          <Alert>
            <AlertDescription>
              Analyzing files — this can take a minute or more depending on repo
              size. Check your terminal for live progress.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <ScanResultsPanel
            result={result}
            resolvedKeys={resolvedKeys}
            togglingKey={togglingKey}
            onToggleResolved={handleToggleResolved}
            onCsvDownload={handleCsvDownload}
          />
        )}
      </div>
    </main>
  );
}
