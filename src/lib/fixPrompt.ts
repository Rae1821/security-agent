import { Finding } from './analyzer';

// Build a self-contained prompt the user can paste into an AI coding assistant
// to have it fix this finding in their codebase.
export function buildFixPrompt(finding: Finding): string {
  const location = finding.line
    ? `${finding.file} (line ${finding.line})`
    : finding.file;

  return `A security scan found a ${finding.severity}-severity issue in my code. Please fix it.

## Finding
- Title: ${finding.title}
- Vulnerability class: ${finding.vulnerability_class}
- Location: ${location}

## What's happening
${finding.explanation}

## How it could be exploited
${finding.exploit_scenario}

## Suggested fix
${finding.remediation}

## Instructions
1. Open ${finding.file} and find the vulnerable code described above.
2. Check that the issue is real in context. If it is a false positive, tell me why and don't change anything.
3. Make the smallest change that fully fixes the vulnerability, using the suggested fix as a guide and adapting it to the existing code style, libraries, and conventions.
4. Check for the same vulnerable pattern elsewhere in the file or closely related code, and fix it there too.
5. Don't break existing behavior for legitimate users. Update or add tests if the project has them.
6. Summarize what you changed and why it fixes the issue.`;
}
