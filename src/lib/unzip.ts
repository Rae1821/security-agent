import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const TMP_DIR = '/tmp';

/**
 * Extracts a zip archive to a unique directory under /tmp and returns that path.
 */
export async function unzipToTmp(
  zipBuffer: Buffer,
  originalName = 'upload.zip',
): Promise<string> {
  const baseName = path.basename(originalName, path.extname(originalName)) || 'upload';
  const extractDir = path.join(TMP_DIR, `security-scan-${baseName}-${randomUUID()}`);

  await fs.mkdir(extractDir, { recursive: true });

  const zip = new AdmZip(zipBuffer);
  zip.extractAllTo(extractDir, true);

  return extractDir;
}
