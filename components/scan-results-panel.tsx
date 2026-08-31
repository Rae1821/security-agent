'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { RemediationContent } from '@/components/remediation-content';
import { SeverityBadge } from '@/components/severity-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Confidence, Finding, Severity } from '@/src/lib/analyzer';
import { findingKey, isFindingResolved } from '@/src/lib/findingStatus';
import { ScanResult } from '@/src/lib/report';
import { Check, Download, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

type StatusFilter = 'pending' | 'fixed' | 'all';

const SEVERITIES: Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
];

const CONFIDENCE_BADGE_VARIANT: Record<
  Confidence,
  'default' | 'secondary' | 'outline'
> = {
  high: 'default',
  medium: 'secondary',
  low: 'outline',
};

function FindingDetail({
  label,
  children,
  prose = true,
}: {
  label: string;
  children: React.ReactNode;
  prose?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {prose ? (
        <p className="text-base leading-7 text-foreground">{children}</p>
      ) : (
        children
      )}
    </div>
  );
}

function findingAccordionId(finding: Finding, index: number) {
  return `${finding.file}-${finding.title}-${index}`;
}

function ResolvedCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          onChange();
        }
      }}
      className="mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border border-input bg-background transition-colors hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[checked=true]:border-primary data-[checked=true]:bg-primary data-[checked=true]:text-primary-foreground"
      data-checked={checked}
    >
      {disabled ? (
        <Loader2 className="size-3 animate-spin" />
      ) : checked ? (
        <Check className="size-3" />
      ) : null}
    </div>
  );
}

function FindingsList({
  findings,
  resolvedKeys,
  togglingKey,
  onToggleResolved,
}: {
  findings: Finding[];
  resolvedKeys: Set<string>;
  togglingKey: string | null;
  onToggleResolved: (key: string, resolved: boolean) => void;
}) {
  if (findings.length === 0) {
    return (
      <Alert>
        <AlertDescription>No findings in this category.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card size="sm">
      <CardContent>
        <Accordion type="multiple">
          {findings.map((finding, i) => {
            const key = findingKey(finding);
            const resolved = isFindingResolved(finding, resolvedKeys);
            const toggling = togglingKey === key;

            return (
            <AccordionItem
              key={findingAccordionId(finding, i)}
              value={findingAccordionId(finding, i)}
              className={resolved ? 'opacity-60' : undefined}
            >
              <div className="flex items-start gap-3">
                <ResolvedCheckbox
                  checked={resolved}
                  disabled={toggling}
                  onChange={() => onToggleResolved(key, !resolved)}
                />
                <AccordionTrigger className="min-w-0 flex-1 items-start gap-4 py-4 hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-col gap-2 text-left">
                    <span
                      className={`text-base leading-snug font-medium ${resolved ? 'line-through' : ''}`}
                    >
                      {finding.title}
                    </span>
                    <span className="truncate font-mono text-xs leading-relaxed text-muted-foreground">
                      {finding.file}
                      {finding.line && ` : line ${finding.line}`}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={finding.severity} />
                      <Badge variant={CONFIDENCE_BADGE_VARIANT[finding.confidence]}>
                        {finding.confidence} confidence
                      </Badge>
                      {resolved && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Fixed
                        </Badge>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
              </div>
              <AccordionContent>
                <div className="flex flex-col gap-5 pb-2 pl-8">
                  <FindingDetail label="Vulnerability class">
                    {finding.vulnerability_class}
                  </FindingDetail>
                  <FindingDetail label="What's happening">
                    {finding.explanation}
                  </FindingDetail>
                  <FindingDetail label="Exploit scenario">
                    {finding.exploit_scenario}
                  </FindingDetail>
                  <FindingDetail label="Suggested fix" prose={false}>
                    <RemediationContent content={finding.remediation} />
                  </FindingDetail>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

interface ScanResultsPanelProps {
  result: ScanResult;
  resolvedKeys: Set<string>;
  togglingKey: string | null;
  onToggleResolved: (findingKey: string, resolved: boolean) => void;
  onCsvDownload: () => void;
}

export function ScanResultsPanel({
  result,
  resolvedKeys,
  togglingKey,
  onToggleResolved,
  onCsvDownload,
}: ScanResultsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');

  const { fixedCount, pendingCount } = useMemo(() => {
    let fixed = 0;
    for (const finding of result.findings) {
      if (isFindingResolved(finding, resolvedKeys)) fixed++;
    }
    return {
      fixedCount: fixed,
      pendingCount: result.findings.length - fixed,
    };
  }, [result.findings, resolvedKeys]);

  const filterByStatus = (findings: Finding[]) => {
    if (statusFilter === 'all') return findings;
    if (statusFilter === 'fixed') {
      return findings.filter((f) => isFindingResolved(f, resolvedKeys));
    }
    return findings.filter((f) => !isFindingResolved(f, resolvedKeys));
  };

  const activeSeverities = SEVERITIES.filter(
    (severity) =>
      filterByStatus(result.findings.filter((f) => f.severity === severity))
        .length > 0,
  );

  const filteredAll = filterByStatus(result.findings);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan results</CardTitle>
        <CardDescription className="flex flex-col gap-1">
          <span>
            Scanned {result.meta.filesScanned} files in{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {result.meta.targetDir}
            </code>
          </span>
          {result.meta.fromCache ? (
            <span>Loaded from database — no AI calls made.</span>
          ) : (
            result.meta.filesAnalyzed !== undefined && (
              <span>
                {result.meta.filesAnalyzed} analyzed with AI,{' '}
                {result.meta.filesFromCache ?? 0} from cache.
              </span>
            )
          )}
          {result.findings.length > 0 && (
            <span>
              {fixedCount} fixed · {pendingCount} pending — check off items as
              you fix them, then rescan to find anything new.
            </span>
          )}
        </CardDescription>
        <CardAction className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCsvDownload}>
            <Download data-icon="inline-start" />
            Download CSV
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {result.findings.length === 0 ? (
          <Alert>
            <AlertDescription>
              No issues found. This doesn&apos;t guarantee the application is
              secure — it means this scan, on these files, didn&apos;t identify
              exploitable patterns. Logic flaws and architecture-level issues
              may still require manual review.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['pending', `Pending (${pendingCount})`],
                  ['fixed', `Fixed (${fixedCount})`],
                  ['all', `All (${result.findings.length})`],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={statusFilter === value ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {filteredAll.length === 0 ? (
              <Alert>
                <AlertDescription>
                  {statusFilter === 'pending'
                    ? 'All findings are marked as fixed. Rescan to check for new issues.'
                    : 'No findings match this filter.'}
                </AlertDescription>
              </Alert>
            ) : (
          <Tabs defaultValue="all">
            <TabsList className="h-auto w-full flex-wrap">
              <TabsTrigger value="all">
                All ({filteredAll.length})
              </TabsTrigger>
              {activeSeverities.map((severity) => {
                const count = filterByStatus(
                  result.findings.filter((f) => f.severity === severity),
                ).length;
                return (
                <TabsTrigger key={severity} value={severity} className="capitalize">
                  {severity} ({count})
                </TabsTrigger>
              );
              })}
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <FindingsList
                findings={filteredAll}
                resolvedKeys={resolvedKeys}
                togglingKey={togglingKey}
                onToggleResolved={onToggleResolved}
              />
            </TabsContent>

            {activeSeverities.map((severity) => (
              <TabsContent key={severity} value={severity} className="mt-4">
                <FindingsList
                  findings={filterByStatus(
                    result.findings.filter((f) => f.severity === severity),
                  )}
                  resolvedKeys={resolvedKeys}
                  togglingKey={togglingKey}
                  onToggleResolved={onToggleResolved}
                />
              </TabsContent>
            ))}
          </Tabs>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
