import path from "path";
import fs from "fs";
import { SECURITY_CONFIG } from "../config/security";

/**
 * Manages file locks to prevent race conditions using OS-level file locks
 * Works across multiple processes
 */
export class FileLockManager {
  private lockDir: string;
  private activeLocks: Map<string, number>; // Track locks held by this process

  constructor(
    lockDir: string = path.join(SECURITY_CONFIG.BASE_DIRECTORY, ".locks")
  ) {
    this.lockDir = lockDir;
    this.activeLocks = new Map();
    // Ensure lock directory exists
    if (!fs.existsSync(this.lockDir)) {
      fs.mkdirSync(this.lockDir, { recursive: true });
    }
  }

  /**
   * Gets the lock file path for a given file
   */
  private getLockFilePath(filePath: string): string {
    const hash = Buffer.from(filePath)
      .toString("base64")
      .replace(/[/+=]/g, "_");
    return path.join(this.lockDir, `${hash}.lock`);
  }

  /**
   * Acquires an OS-level exclusive lock for a file operation
   * Uses file system locks that work across processes
   * Supports re-entrant locking (same process can acquire lock multiple times)
   */
  async acquireLock(filePath: string): Promise<() => void> {
    const lockFile = this.getLockFilePath(filePath);

    // Check if this process already holds the lock (re-entrant)
    if (this.activeLocks.has(lockFile)) {
      const count = this.activeLocks.get(lockFile)!;
      this.activeLocks.set(lockFile, count + 1);

      // Return a release function that just decrements the counter
      return () => {
        const currentCount = this.activeLocks.get(lockFile)!;
        if (currentCount > 1) {
          this.activeLocks.set(lockFile, currentCount - 1);
        } else {
          // Last reference, actually release the lock
          this.activeLocks.delete(lockFile);
          try {
            if (fs.existsSync(lockFile)) {
              fs.unlinkSync(lockFile);
            }
          } catch (error) {
            console.error("Error releasing lock:", error);
          }
        }
      };
    }

    let fd: number | null = null;
    const maxRetries = 10;
    const retryDelay = 50; // ms

    // Try to create an exclusive lock file
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Try to open with exclusive flag (fails if file exists)
        fd = fs.openSync(lockFile, "wx");
        break;
      } catch (error: any) {
        if (error.code === "EEXIST") {
          // Lock file exists, wait and retry
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          throw error;
        }
      }
    }

    if (fd === null) {
      throw new Error(
        `Unable to acquire lock for ${filePath}. File may be locked by another process.`
      );
    }

    // Write process ID to lock file for debugging
    fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}`);
    fs.closeSync(fd);

    // Mark as held by this process
    this.activeLocks.set(lockFile, 1);

    // Return release function
    return () => {
      const currentCount = this.activeLocks.get(lockFile);
      if (!currentCount) return; // Already released

      if (currentCount > 1) {
        this.activeLocks.set(lockFile, currentCount - 1);
      } else {
        this.activeLocks.delete(lockFile);
        try {
          if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
          }
        } catch (error) {
          console.error("Error releasing lock:", error);
        }
      }
    };
  }

  /**
   * Executes a callback with file lock
   */
  async withLock<T>(filePath: string, callback: () => Promise<T>): Promise<T> {
    const release = await this.acquireLock(filePath);
    try {
      return await callback();
    } finally {
      release();
    }
  }

  /**
   * Clean up stale lock files (optional maintenance)
   */
  cleanStaleLocks(maxAgeMs: number = 60000): void {
    if (!fs.existsSync(this.lockDir)) return;

    const now = Date.now();
    const files = fs.readdirSync(this.lockDir);

    for (const file of files) {
      if (!file.endsWith(".lock")) continue;

      const lockPath = path.join(this.lockDir, file);
      try {
        const stats = fs.statSync(lockPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(lockPath);
        }
      } catch (error) {
        // Ignore errors for files that might have been deleted
      }
    }
  }
}
