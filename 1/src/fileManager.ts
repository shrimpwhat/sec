import fs from "fs";
import path from "path";
import {
  PathValidator,
  FileSizeValidator,
  FileLockManager,
  SECURITY_CONFIG,
} from "./utils/security";
import { DatabaseManager } from "./database";

export class FileManager {
  private pathValidator: PathValidator;
  private lockManager: FileLockManager;
  private db: DatabaseManager;

  constructor(db: DatabaseManager, baseDir?: string) {
    this.pathValidator = new PathValidator(baseDir);
    this.lockManager = new FileLockManager();
    this.db = db;
  }

  /**
   * Get the lock manager instance
   */
  getLockManager(): FileLockManager {
    return this.lockManager;
  }

  /**
   * Get the path validator instance
   */
  getPathValidator(): PathValidator {
    return this.pathValidator;
  }

  /**
   * Reads a file securely
   */
  async readFile(filePath: string, userId: number): Promise<string> {
    const validPath = this.pathValidator.validatePath(filePath);

    return this.lockManager.withLock(validPath, async () => {
      if (!fs.existsSync(validPath)) {
        throw new Error("File does not exist");
      }

      const stats = fs.statSync(validPath);
      FileSizeValidator.validateFileSize(stats.size);

      const content = fs.readFileSync(validPath, "utf-8");

      // Log the operation
      this.db.logOperation(
        "read",
        userId,
        null,
        `Read file: ${path.basename(filePath)}`
      );

      return content;
    });
  }

  /**
   * Writes content to a file securely
   */
  async writeFile(
    filePath: string,
    content: string,
    userId: number
  ): Promise<void> {
    const filename = path.basename(filePath);
    const sanitizedFilename = this.pathValidator.sanitizeFilename(filename);
    const validPath = this.pathValidator.validatePath(sanitizedFilename);

    // Validate file extension
    if (!this.pathValidator.validateExtension(sanitizedFilename)) {
      throw new Error("File extension not allowed");
    }

    // Validate content size
    const contentSize = Buffer.byteLength(content, "utf-8");
    FileSizeValidator.validateFileSize(contentSize);

    return this.lockManager.withLock(validPath, async () => {
      // Ensure directory exists
      const dir = path.dirname(validPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileExists = fs.existsSync(validPath);
      const operationType = fileExists ? "modify" : "create";

      // Write file atomically
      const tempPath = `${validPath}.tmp`;
      fs.writeFileSync(tempPath, content, "utf-8");
      fs.renameSync(tempPath, validPath);

      // Update database
      const stats = fs.statSync(validPath);
      const relativePath = path.relative(
        this.pathValidator.getBaseDir(),
        validPath
      );

      if (!fileExists) {
        const fileId = this.db.createFile(
          sanitizedFilename,
          stats.size,
          relativePath,
          userId
        );
        this.db.logOperation(
          operationType,
          userId,
          fileId,
          `Created file: ${sanitizedFilename}`
        );
      } else {
        // Find existing file record and update
        const files = this.db.getFilesByOwner(userId);
        const fileRecord = files.find((f) => f.location === relativePath);
        if (fileRecord) {
          this.db.updateFileSize(fileRecord.id, stats.size);
          this.db.logOperation(
            operationType,
            userId,
            fileRecord.id,
            `Modified file: ${sanitizedFilename}`
          );
        }
      }
    });
  }

  /**
   * Deletes a file securely
   */
  async deleteFile(filePath: string, userId: number): Promise<void> {
    const validPath = this.pathValidator.validatePath(filePath);

    return this.lockManager.withLock(validPath, async () => {
      if (!fs.existsSync(validPath)) {
        throw new Error("File does not exist");
      }

      const relativePath = path.relative(
        this.pathValidator.getBaseDir(),
        validPath
      );

      // Find file record
      const files = this.db.getFilesByOwner(userId);
      const fileRecord = files.find((f) => f.location === relativePath);

      // Delete the file
      fs.unlinkSync(validPath);

      // Update database
      if (fileRecord) {
        this.db.deleteFile(fileRecord.id);
        this.db.logOperation(
          "delete",
          userId,
          fileRecord.id,
          `Deleted file: ${path.basename(filePath)}`
        );
      } else {
        this.db.logOperation(
          "delete",
          userId,
          null,
          `Deleted file: ${path.basename(filePath)}`
        );
      }
    });
  }

  /**
   * Lists files in a directory
   */
  async listFiles(dirPath: string = ".", userId: number): Promise<string[]> {
    const validPath = this.pathValidator.validatePath(dirPath);

    if (!fs.existsSync(validPath)) {
      throw new Error("Directory does not exist");
    }

    const stats = fs.statSync(validPath);
    if (!stats.isDirectory()) {
      throw new Error("Path is not a directory");
    }

    const files = fs.readdirSync(validPath);

    // Log the operation
    this.db.logOperation("read", userId, null, `Listed directory: ${dirPath}`);

    return files;
  }

  /**
   * Copies a file securely
   */
  async copyFile(
    sourcePath: string,
    destPath: string,
    userId: number
  ): Promise<void> {
    const validSourcePath = this.pathValidator.validatePath(sourcePath);
    const destFilename = this.pathValidator.sanitizeFilename(
      path.basename(destPath)
    );
    const validDestPath = this.pathValidator.validatePath(destFilename);

    if (!fs.existsSync(validSourcePath)) {
      throw new Error("Source file does not exist");
    }

    const stats = fs.statSync(validSourcePath);
    FileSizeValidator.validateFileSize(stats.size);

    // Use lock for both files
    const releaseSrc = await this.lockManager.acquireLock(validSourcePath);
    const releaseDest = await this.lockManager.acquireLock(validDestPath);

    try {
      // Copy file
      fs.copyFileSync(validSourcePath, validDestPath);

      // Update database
      const relativePath = path.relative(
        this.pathValidator.getBaseDir(),
        validDestPath
      );
      const fileId = this.db.createFile(
        destFilename,
        stats.size,
        relativePath,
        userId
      );
      this.db.logOperation(
        "create",
        userId,
        fileId,
        `Copied file: ${sourcePath} -> ${destFilename}`
      );
    } finally {
      releaseDest();
      releaseSrc();
    }
  }

  /**
   * Gets file information
   */
  async getFileInfo(
    filePath: string,
    userId: number
  ): Promise<{
    name: string;
    size: number;
    created: Date;
    modified: Date;
    isDirectory: boolean;
  }> {
    const validPath = this.pathValidator.validatePath(filePath);

    if (!fs.existsSync(validPath)) {
      throw new Error("File does not exist");
    }

    const stats = fs.statSync(validPath);

    this.db.logOperation(
      "read",
      userId,
      null,
      `Got file info: ${path.basename(filePath)}`
    );

    return {
      name: path.basename(validPath),
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isDirectory: stats.isDirectory(),
    };
  }

  /**
   * Creates a directory securely
   */
  async createDirectory(dirPath: string, userId: number): Promise<void> {
    const sanitizedPath = this.pathValidator.sanitizeFilename(dirPath);
    const validPath = this.pathValidator.validatePath(sanitizedPath);

    if (fs.existsSync(validPath)) {
      throw new Error("Directory already exists");
    }

    fs.mkdirSync(validPath, { recursive: true });

    this.db.logOperation(
      "create",
      userId,
      null,
      `Created directory: ${sanitizedPath}`
    );
  }

  /**
   * Gets disk space information
   */
  async getDiskSpace(): Promise<{
    total: number;
    free: number;
    used: number;
  }> {
    // This is platform-specific; for cross-platform we'd use a library
    // For now, return mock data or use fs.statfs on Linux
    const baseDir = this.pathValidator.getBaseDir();

    try {
      // Try to get directory stats
      const stats = fs.statfsSync ? fs.statfsSync(baseDir) : null;
      if (stats) {
        return {
          total: stats.blocks * stats.bsize,
          free: stats.bfree * stats.bsize,
          used: (stats.blocks - stats.bfree) * stats.bsize,
        };
      }
    } catch (error) {
      // Fallback for systems where statfs is not available
    }

    // Return information about the storage directory
    const calculateDirSize = (dirPath: string): number => {
      let size = 0;
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          size += calculateDirSize(filePath);
        } else {
          size += stats.size;
        }
      }

      return size;
    };

    const used = fs.existsSync(baseDir) ? calculateDirSize(baseDir) : 0;

    return {
      total: SECURITY_CONFIG.MAX_FILE_SIZE * 10, // Mock value
      free: SECURITY_CONFIG.MAX_FILE_SIZE * 10 - used,
      used,
    };
  }

  /**
   * Clears all files from storage directory
   */
  async clearStorage(userId: number): Promise<void> {
    const baseDir = this.pathValidator.getBaseDir();

    const deleteRecursive = (dirPath: string): void => {
      if (!fs.existsSync(dirPath)) return;

      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          // Skip .locks directory
          if (file === ".locks") continue;
          deleteRecursive(filePath);
          fs.rmdirSync(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
    };

    try {
      deleteRecursive(baseDir);

      // Clean up database records
      const files = this.db.getFilesByOwner(userId);
      for (const file of files) {
        this.db.deleteFile(file.id);
      }

      this.db.logOperation("delete", userId, null, "Cleared all storage");
    } catch (error) {
      throw new Error(
        `Failed to clear storage: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
