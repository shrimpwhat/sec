import fs from "fs";
import path from "path";
import {
  PathValidator,
  FileSizeValidator,
  SECURITY_CONFIG,
} from "./utils/security";
import { DatabaseManager } from "./database";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionRatio: number;
}

/**
 * Secure ZIP archive manager with ZIP bomb protection
 */
export class ZipManager {
  private pathValidator: PathValidator;
  private db: DatabaseManager;

  constructor(db: DatabaseManager, baseDir?: string) {
    this.pathValidator = new PathValidator(baseDir);
    this.db = db;
  }

  /**
   * Creates a ZIP archive from files
   */
  async createZip(
    files: string[],
    outputZipPath: string,
    userId: number
  ): Promise<void> {
    const sanitizedOutputName = this.pathValidator.sanitizeFilename(
      path.basename(outputZipPath)
    );
    const validOutputPath =
      this.pathValidator.validatePath(sanitizedOutputName);

    // Validate all input files
    const validFiles: string[] = [];
    let totalSize = 0;

    for (const file of files) {
      const validPath = this.pathValidator.validatePath(file);

      if (!fs.existsSync(validPath)) {
        throw new Error(`File not found: ${file}`);
      }

      const stats = fs.statSync(validPath);
      if (stats.isDirectory()) {
        throw new Error(`Cannot add directory to ZIP: ${file}`);
      }

      totalSize += stats.size;
      validFiles.push(validPath);
    }

    // Validate total size
    FileSizeValidator.validateFileSize(totalSize, SECURITY_CONFIG.MAX_ZIP_SIZE);

    try {
      // Use system zip command for better compatibility
      const baseDir = this.pathValidator.getBaseDir();
      const relativeFiles = validFiles.map((f) => path.relative(baseDir, f));

      // Create zip using native commands
      const zipCommand =
        process.platform === "win32"
          ? `powershell Compress-Archive -Path ${relativeFiles
              .map((f) => `"${f}"`)
              .join(",")} -DestinationPath "${validOutputPath}"`
          : `cd "${baseDir}" && zip -q "${validOutputPath}" ${relativeFiles
              .map((f) => `"${f}"`)
              .join(" ")}`;

      await execAsync(zipCommand);

      // Verify the created zip file size
      const stats = fs.statSync(validOutputPath);
      FileSizeValidator.validateFileSize(
        stats.size,
        SECURITY_CONFIG.MAX_ZIP_SIZE
      );

      // Log operation
      const relativePath = path.relative(baseDir, validOutputPath);
      const fileId = this.db.createFile(
        sanitizedOutputName,
        stats.size,
        relativePath,
        userId
      );
      this.db.logOperation(
        "create",
        userId,
        fileId,
        `Created ZIP archive: ${sanitizedOutputName}`
      );
    } catch (error) {
      throw new Error(
        `Failed to create ZIP: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Extracts a ZIP archive with bomb protection
   */
  async extractZip(
    zipPath: string,
    outputDir: string,
    userId: number
  ): Promise<string[]> {
    const validZipPath = this.pathValidator.validatePath(zipPath);
    const sanitizedOutputDir = this.pathValidator.sanitizeFilename(outputDir);
    const validOutputPath = this.pathValidator.validatePath(sanitizedOutputDir);

    if (!fs.existsSync(validZipPath)) {
      throw new Error("ZIP file not found");
    }

    // Validate ZIP file size
    const zipStats = fs.statSync(validZipPath);
    FileSizeValidator.validateFileSize(
      zipStats.size,
      SECURITY_CONFIG.MAX_ZIP_SIZE
    );

    // First, analyze the ZIP without extracting
    const entries = await this.analyzeZip(validZipPath);

    // Validate against ZIP bomb
    this.validateZipEntries(entries, zipStats.size);

    // Create output directory
    if (!fs.existsSync(validOutputPath)) {
      fs.mkdirSync(validOutputPath, { recursive: true });
    }

    try {
      // Extract using system command
      const unzipCommand =
        process.platform === "win32"
          ? `powershell Expand-Archive -Path "${validZipPath}" -DestinationPath "${validOutputPath}" -Force`
          : `unzip -q -o "${validZipPath}" -d "${validOutputPath}"`;

      await execAsync(unzipCommand);

      // Verify extracted files
      const extractedFiles = this.getExtractedFiles(validOutputPath);

      // Log operation
      this.db.logOperation(
        "read",
        userId,
        null,
        `Extracted ZIP: ${path.basename(zipPath)} (${
          extractedFiles.length
        } files)`
      );

      return extractedFiles;
    } catch (error) {
      throw new Error(
        `Failed to extract ZIP: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Analyzes ZIP contents without extracting
   */
  private async analyzeZip(zipPath: string): Promise<ZipEntry[]> {
    try {
      // Use system command to list ZIP contents
      const listCommand =
        process.platform === "win32"
          ? `powershell "Add-Type -A System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('${zipPath}').Entries | Select-Object Name,CompressedLength,Length | ConvertTo-Json"`
          : `unzip -l -v "${zipPath}"`;

      const { stdout } = await execAsync(listCommand);

      if (process.platform === "win32") {
        // Parse PowerShell JSON output
        const entries = JSON.parse(stdout);
        return Array.isArray(entries)
          ? entries.map((e: any) => ({
              name: e.Name,
              compressedSize: e.CompressedLength,
              uncompressedSize: e.Length,
              compressionRatio:
                e.CompressedLength > 0 ? e.Length / e.CompressedLength : 0,
            }))
          : [
              {
                name: entries.Name,
                compressedSize: entries.CompressedLength,
                uncompressedSize: entries.Length,
                compressionRatio:
                  entries.CompressedLength > 0
                    ? entries.Length / entries.CompressedLength
                    : 0,
              },
            ];
      } else {
        // Parse unzip -l -v output
        return this.parseUnzipOutput(stdout);
      }
    } catch (error) {
      throw new Error(
        `Failed to analyze ZIP: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Parses unzip command output
   */
  private parseUnzipOutput(output: string): ZipEntry[] {
    const entries: ZipEntry[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      // Parse lines like: "  1234  Defl:N      567  54% 2024-01-01 12:00 filename.txt"
      const match = line.match(
        /^\s*(\d+)\s+\w+:?\w*\s+(\d+)\s+\d+%.*?\s+(.+)$/
      );
      if (match && match[1] && match[2] && match[3]) {
        const uncompressedSize = parseInt(match[1], 10);
        const compressedSize = parseInt(match[2], 10);
        const name = match[3].trim();

        entries.push({
          name,
          compressedSize,
          uncompressedSize,
          compressionRatio:
            compressedSize > 0 ? uncompressedSize / compressedSize : 0,
        });
      }
    }

    return entries;
  }

  /**
   * Validates ZIP entries to detect ZIP bombs
   */
  private validateZipEntries(entries: ZipEntry[], zipSize: number): void {
    let totalUncompressed = 0;
    let totalCompressed = 0;

    for (const entry of entries) {
      // Check individual file compression ratio
      if (entry.compressionRatio > SECURITY_CONFIG.MAX_COMPRESSION_RATIO) {
        throw new Error(
          `ZIP bomb detected: File "${
            entry.name
          }" has compression ratio ${entry.compressionRatio.toFixed(2)} (max: ${
            SECURITY_CONFIG.MAX_COMPRESSION_RATIO
          })`
        );
      }

      // Check individual uncompressed size
      if (entry.uncompressedSize > SECURITY_CONFIG.MAX_UNCOMPRESSED_SIZE) {
        throw new Error(
          `File too large: "${entry.name}" uncompressed size ${entry.uncompressedSize} bytes exceeds limit`
        );
      }

      totalUncompressed += entry.uncompressedSize;
      totalCompressed += entry.compressedSize;
    }

    // Check total compression ratio
    const totalRatio =
      totalCompressed > 0 ? totalUncompressed / totalCompressed : 0;
    FileSizeValidator.validateCompressionRatio(zipSize, totalUncompressed);

    // Check total uncompressed size
    if (totalUncompressed > SECURITY_CONFIG.MAX_UNCOMPRESSED_SIZE) {
      throw new Error(
        `ZIP bomb detected: Total uncompressed size ${totalUncompressed} bytes exceeds limit (${SECURITY_CONFIG.MAX_UNCOMPRESSED_SIZE} bytes)`
      );
    }
  }

  /**
   * Gets list of extracted files
   */
  private getExtractedFiles(dir: string, baseDir: string = dir): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        files.push(...this.getExtractedFiles(fullPath, baseDir));
      } else {
        files.push(path.relative(baseDir, fullPath));
      }
    }

    return files;
  }

  /**
   * Lists contents of a ZIP file without extracting
   */
  async listZipContents(zipPath: string, userId: number): Promise<ZipEntry[]> {
    const validZipPath = this.pathValidator.validatePath(zipPath);

    if (!fs.existsSync(validZipPath)) {
      throw new Error("ZIP file not found");
    }

    const entries = await this.analyzeZip(validZipPath);

    // Log operation
    this.db.logOperation(
      "read",
      userId,
      null,
      `Listed ZIP contents: ${path.basename(zipPath)}`
    );

    return entries;
  }
}
