import { Database } from "bun:sqlite";
import path from "path";

export interface User {
  id: number;
  username: string;
  password_hash: string;
}

export interface FileRecord {
  id: number;
  filename: string;
  created_at: string;
  size: number;
  location: string;
  owner_id: number;
}

export interface Operation {
  id: number;
  timestamp: string;
  operation_type: "create" | "modify" | "delete" | "read";
  file_id: number | null;
  user_id: number;
  details: string;
}

export class DatabaseManager {
  private db: Database;

  constructor(dbPath: string = path.join(__dirname, "../", "filemanager.db")) {
    this.db = new Database(dbPath, { create: true });
    this.initDatabase();
  }

  private initDatabase(): void {
    // Create Users table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS Users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
      );
    `);

    // Create Files table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS Files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        size INTEGER,
        location TEXT,
        owner_id INTEGER NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(id)
      );
    `);

    // Create Operations table (audit log)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS Operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        operation_type TEXT NOT NULL CHECK(operation_type IN ('create', 'modify', 'delete', 'read')),
        file_id INTEGER,
        user_id INTEGER NOT NULL,
        details TEXT,
        FOREIGN KEY (file_id) REFERENCES Files(id),
        FOREIGN KEY (user_id) REFERENCES Users(id)
      );
    `);

    // Create indices for better performance
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_files_owner ON Files(owner_id);
      CREATE INDEX IF NOT EXISTS idx_operations_user ON Operations(user_id);
      CREATE INDEX IF NOT EXISTS idx_operations_file ON Operations(file_id);
    `);
  }

  // User operations with prepared statements
  createUser(username: string, passwordHash: string): number {
    const stmt = this.db.prepare(
      "INSERT INTO Users (username, password_hash) VALUES (?, ?)"
    );
    const result = stmt.run(username, passwordHash);
    return result.lastInsertRowid as number;
  }

  getUserByUsername(username: string): User | undefined {
    const stmt = this.db.prepare("SELECT * FROM Users WHERE username = ?");
    return stmt.get(username) as User | undefined;
  }

  getUserById(id: number): User | undefined {
    const stmt = this.db.prepare("SELECT * FROM Users WHERE id = ?");
    return stmt.get(id) as User | undefined;
  }

  // File operations with prepared statements
  createFile(
    filename: string,
    size: number,
    location: string,
    ownerId: number
  ): number {
    const stmt = this.db.prepare(
      "INSERT INTO Files (filename, size, location, owner_id) VALUES (?, ?, ?, ?)"
    );
    const result = stmt.run(filename, size, location, ownerId);
    return result.lastInsertRowid as number;
  }

  getFileById(id: number): FileRecord | undefined {
    const stmt = this.db.prepare("SELECT * FROM Files WHERE id = ?");
    return stmt.get(id) as FileRecord | undefined;
  }

  getFilesByOwner(ownerId: number): FileRecord[] {
    const stmt = this.db.prepare("SELECT * FROM Files WHERE owner_id = ?");
    return stmt.all(ownerId) as FileRecord[];
  }

  updateFileSize(id: number, size: number): void {
    const stmt = this.db.prepare("UPDATE Files SET size = ? WHERE id = ?");
    stmt.run(size, id);
  }

  deleteFile(id: number): void {
    const stmt = this.db.prepare("DELETE FROM Files WHERE id = ?");
    stmt.run(id);
  }

  // Operation logging with prepared statements
  logOperation(
    operationType: "create" | "modify" | "delete" | "read",
    userId: number,
    fileId: number | null = null,
    details: string = ""
  ): number {
    const stmt = this.db.prepare(
      "INSERT INTO Operations (operation_type, user_id, file_id, details) VALUES (?, ?, ?, ?)"
    );
    const result = stmt.run(operationType, userId, fileId, details);
    return result.lastInsertRowid as number;
  }

  getOperationsByUser(userId: number, limit: number = 100): Operation[] {
    const stmt = this.db.prepare(
      "SELECT * FROM Operations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?"
    );
    return stmt.all(userId, limit) as Operation[];
  }

  getAllOperations(limit: number = 100): Operation[] {
    const stmt = this.db.prepare(
      "SELECT * FROM Operations ORDER BY timestamp DESC LIMIT ?"
    );
    return stmt.all(limit) as Operation[];
  }

  // Transaction support for atomic operations
  beginTransaction(): void {
    this.db.run("BEGIN TRANSACTION");
  }

  commit(): void {
    this.db.run("COMMIT");
  }

  rollback(): void {
    this.db.run("ROLLBACK");
  }

  // Execute operation in transaction
  transaction<T>(callback: () => T): T {
    return this.db.transaction(callback)();
  }

  close(): void {
    this.db.close();
  }
}
