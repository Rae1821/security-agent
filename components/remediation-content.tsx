'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

type TextSegment = { type: 'text'; content: string };
type InlineCodeSegment = { type: 'inline-code'; content: string };
type CodeBlockSegment = { type: 'code'; content: string; language?: string };
type RemediationSegment = TextSegment | InlineCodeSegment | CodeBlockSegment;

function parseInlineSegments(text: string): Array<TextSegment | InlineCodeSegment> {
  const parts = text.split(/(`[^`\n]+`)/g).filter(Boolean);

  if (parts.length === 0) {
    return text ? [{ type: 'text', content: text }] : [];
  }

  return parts.map((part) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return { type: 'inline-code' as const, content: part.slice(1, -1) };
    }
    return { type: 'text' as const, content: part };
  });
}

export function parseRemediation(text: string): RemediationSegment[] {
  const segments: RemediationSegment[] = [];
  const fenceRegex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'code',
      language: match[1]?.trim() || undefined,
      content: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', content: text });
  }

  return segments;
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={handleCopy}
      className="text-muted-foreground"
    >
      {copied ? (
        <>
          <Check data-icon="inline-start" />
          Copied
        </>
      ) : (
        <>
          <Copy data-icon="inline-start" />
          Copy
        </>
      )}
    </Button>
  );
}

function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">
          {language || 'code'}
        </span>
        <CopyCodeButton code={code} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function TextBlock({ content }: { content: string }) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((paragraph, index) => {
        const inlineSegments = parseInlineSegments(paragraph);

        return (
          <p key={index} className="text-base leading-7 text-foreground">
            {inlineSegments.map((segment, segmentIndex) => {
              if (segment.type === 'inline-code') {
                return (
                  <code
                    key={segmentIndex}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm"
                  >
                    {segment.content}
                  </code>
                );
              }

              return <span key={segmentIndex}>{segment.content}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function RemediationContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const segments = parseRemediation(content);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {segments.map((segment, index) => {
        if (segment.type === 'code') {
          return (
            <CodeBlock
              key={index}
              code={segment.content}
              language={segment.language}
            />
          );
        }

        return <TextBlock key={index} content={segment.content} />;
      })}
    </div>
  );
}
