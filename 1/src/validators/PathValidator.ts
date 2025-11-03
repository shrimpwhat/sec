import path from "path";
import fs from "fs";
import { SECURITY_CONFIG } from "../config/security";

/**
 * Prevents path traversal attacks by validating and normalizing paths
 */
export class PathValidator {
  private baseDir: string;

  constructor(baseDir: string = SECURITY_CONFIG.BASE_DIRECTORY) {
    this.baseDir = path.resolve(baseDir);
    // Ensure base directory exists
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Validates and resolves a path to ensure it's within the base directory
   * Prevents path traversal attacks
   */
  validatePath(userPath: string): string {
    // Normalize and resolve the path
    const normalizedPath = path.normalize(userPath);
    const resolvedPath = path.resolve(this.baseDir, normalizedPath);

    // Check if the resolved path is within the base directory
    if (!resolvedPath.startsWith(this.baseDir)) {
      throw new Error("Path traversal detected: Access denied");
    }

    return resolvedPath;
  }

  /**
   * Checks if a file extension is allowed
   */
  validateExtension(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return SECURITY_CONFIG.ALLOWED_FILE_EXTENSIONS.includes(ext) || ext === "";
  }

  /**
   * Sanitizes filename to prevent issues
   */
  sanitizeFilename(filename: string): string {
    // Remove path separators and dangerous characters
    let sanitized = filename
      .replace(/[/\\]/g, "")
      .replace(/\.\./g, "")
      .replace(/[<>:"|?*\x00-\x1f]/g, "")
      .trim();

    // Ensure the filename doesn't start with a dot (hidden files)
    if (sanitized.startsWith(".")) {
      sanitized = sanitized.substring(1);
    }

    if (!sanitized) {
      throw new Error("Invalid filename after sanitization");
    }

    return sanitized;
  }

  getBaseDir(): string {
    return this.baseDir;
  }
}
