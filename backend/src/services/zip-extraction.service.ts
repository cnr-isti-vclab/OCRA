import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * List ZIP archive entries by reading the archive central directory via `unzip -Z1`.
 *
 * This avoids extracting the archive just to inspect its declared contents.
 */
export async function listZipEntries(zipPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('unzip', ['-Z1', zipPath], {
      cwd: path.dirname(zipPath),
      maxBuffer: 10 * 1024 * 1024,
    });

    return stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to inspect ZIP archive "${zipPath}": ${message}`);
  }
}

/**
 * Extract a ZIP archive using the system `unzip` command.
 *
 * We intentionally avoid `extract-zip` because some valid RTI archives
 * were observed to stall mid-extraction, leaving the ingestion request pending.
 */
export async function extractZipArchive(zipPath: string, targetDir: string): Promise<void> {
  try {
    await execFileAsync('unzip', ['-oq', zipPath, '-d', targetDir], {
      cwd: path.dirname(zipPath),
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract ZIP archive "${zipPath}": ${message}`);
  }
}
