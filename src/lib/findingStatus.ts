import { Finding } from './analyzer';

/** Stable key for a finding — survives rescans when the same issue is still present. */
export function findingKey(finding: Finding): string {
  return [
    finding.file,
    finding.title,
    finding.line,
    finding.vulnerability_class,
  ].join('::');
}

export function isFindingResolved(
  finding: Finding,
  resolvedKeys: Set<string>,
): boolean {
  return resolvedKeys.has(findingKey(finding));
}
