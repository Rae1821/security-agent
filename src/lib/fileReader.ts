import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';

const TARGET_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'php', 'py'];

// Directory names to skip entirely — checked against every segment
// of the path, so node_modules nested anywhere gets excluded
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'vendor',
  '.turbo',
  'coverage',
  'out',
  '.cache',
]);

export interface SourceFile {
  path: string;
  relativePath: string;
  content: string;
  lines: number;
}

function containsIgnoredDir(filePath: string): boolean {
  return filePath.split(path.sep).some((segment) => IGNORE_DIRS.has(segment));
}

export async function findSourceFiles(targetDir: string): Promise<string[]> {
  const pattern = `**/*.{${TARGET_EXTENSIONS.join(',')}}`;

  const files = await glob(pattern, {
    cwd: targetDir,
    absolute: true,
    nodir: true,
    dot: false,
  });

  return files.filter((f) => !containsIgnoredDir(f));
}

export async function readFileWithMeta(
  filePath: string,
  targetDir: string,
): Promise<SourceFile> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n').length;
  const relativePath = path.relative(targetDir, filePath);

  return { path: filePath, relativePath, content, lines };
}

export async function readAllSourceFiles(
  targetDir: string,
  maxLines = 800,
): Promise<SourceFile[]> {
  const filePaths = await findSourceFiles(targetDir);
  const results: SourceFile[] = [];

  console.log(`Found ${filePaths.length} files before size filter`);

  for (const filePath of filePaths) {
    try {
      const fileData = await readFileWithMeta(filePath, targetDir);

      if (fileData.lines > maxLines) {
        console.warn(
          `⚠ Skipping large file (${fileData.lines} lines): ${fileData.relativePath}`,
        );
        continue;
      }

      results.push(fileData);
    } catch (err) {
      console.warn(`⚠ Could not read ${filePath}: ${(err as Error).message}`);
    }
  }

  return results;
}
