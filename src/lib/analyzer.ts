import Anthropic from '@anthropic-ai/sdk';
import { SourceFile } from './fileReader';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type Confidence = 'high' | 'medium' | 'low';

export interface Finding {
  title: string;
  severity: Severity;
  line: string;
  vulnerability_class: string;
  explanation: string;
  exploit_scenario: string;
  remediation: string;
  confidence: Confidence;
  file: string;
}

const SYSTEM_PROMPT = `You are an application security expert reviewing code written by web developers. You have deep knowledge of OWASP Top 10, business logic vulnerabilities, and how real-world web applications get exploited.
 
Your job is to analyze the provided file and identify SPECIFIC, EXPLOITABLE security findings. You are not a generic scanner - do not produce a checklist of CWE categories. Produce findings that are:
 
1. SPECIFIC - cite the exact line(s) and explain the exact exploit path, not "this could be vulnerable"
2. CONTEXTUAL - consider how this code is likely used; don't flag theoretical issues that aren't realistically exploitable given the context shown
3. BUSINESS-LOGIC AWARE - ask what this code is supposed to do, and whether it can be manipulated to do something else (auth bypass, privilege escalation, IDOR, race conditions)
4. DEVELOPER-READABLE - write the finding as if explaining it directly to the developer who wrote it, not to an auditor. Be clear and direct, not jargon-heavy.

For each finding, you MUST respond in this exact JSON structure (an array of findings):
 
[
  {
    "title": "Short descriptive title",
    "severity": "critical | high | medium | low | informational",
    "line": "line number or range",
    "vulnerability_class": "e.g. SQL Injection, IDOR, Broken Auth, XSS, SSRF, etc.",
    "explanation": "What the vulnerable code does and why it's exploitable",
    "exploit_scenario": "A concrete example of how an attacker would exploit this",
    "remediation": "Specific fix in plain text. When including corrected code, wrap it in markdown fences like \`\`\`ts\\ncode here\\n\`\`\` so it can be copied easily",
    "confidence": "high | medium | low - your confidence this is a real, exploitable issue (not a false positive)"
  }
]

  If you find NO legitimate security issues, return an empty array: []
 
Do not pad the response with low-value findings to seem thorough. A clean file with an empty array is a valid and useful result. Only flag things you would actually report in a professional pentest engagement.
 
Respond with ONLY the JSON array. No preamble, no markdown code fences, no explanation outside the JSON.`;

export async function analyzeFile(file: SourceFile): Promise<Finding[]> {
  const userPrompt = `File: ${file.relativePath}
   
  \`\`\`
  ${file.content}
  \`\`\``;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();

    let findings: Omit<Finding, 'file'>[];
    try {
      findings = JSON.parse(cleaned);
    } catch {
      console.warn(`⚠ Could not parse findings JSON for ${file.relativePath}`);
      return [];
    }

    return findings.map((f) => ({ ...f, file: file.relativePath }));
  } catch (err) {
    console.error(
      `✗ Error analyzing ${file.relativePath}: ${(err as Error).message}`,
    );
    return [];
  }
}

export async function analyzeFiles(
  files: SourceFile[],
  onProgress?: (current: number, total: number, fileName: string) => void,
): Promise<Finding[]> {
  const allFindings: Finding[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.relativePath);

    const findings = await analyzeFile(file);
    allFindings.push(...findings);

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return allFindings;
}
