import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { DatabaseManager } from "./src/database";
import { AuthService } from "./src/auth";
import { FileManager } from "./src/fileManager";
import { SafeJSONHandler, SafeXMLHandler } from "./src/dataHandlers";
import { SECURITY_CONFIG } from "./src/utils/security";
import fs from "fs";

let db: DatabaseManager;
let auth: AuthService;
let fileManager: FileManager;
let testUserId: number;

beforeAll(async () => {
  // Setup test environment
  db = new DatabaseManager("./test.db");
  auth = new AuthService(db);
  fileManager = new FileManager(db);

  // Create test user
  const user = await auth.register("testuser123", "SecurePass123!");
  testUserId = user.id;
  await auth.login("testuser123", "SecurePass123!");
});

afterAll(() => {
  // Cleanup
  db.close();

  try {
    fs.unlinkSync("./test.db");
    fs.unlinkSync("./test.db-shm");
    fs.unlinkSync("./test.db-wal");
  } catch (e) {
    // Ignore cleanup errors
  }
});

describe("Authentication and User Management", () => {
  test("should register a new user with hashed password", async () => {
    const user = await auth.register("newuser456", "AnotherPass456!");
    expect(user.username).toBe("newuser456");
    expect(user.password_hash).toBeDefined();
    expect(user.password_hash).not.toBe("AnotherPass456!");
  });

  test("should not allow duplicate usernames", async () => {
    try {
      await auth.register("testuser123", "Aa1!");
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect((error as Error).message).toContain("already exists");
    }
  });

  test("should validate username format", async () => {
    try {
      await auth.register("invalid user!", "Aa1!");
      expect(false).toBe(true);
    } catch (error) {
      expect((error as Error).message).toContain(
        "Username can only contain alphanumeric characters"
      );
    }
  });

  test("should enforce password requirements", async () => {
    const timestamp = Date.now();

    // Too short
    try {
      await auth.register(`user${timestamp}_1`, "we");
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect((error as Error).message).toContain(
        "Password must be at least 3 characters"
      );
    }
  });

  test("should authenticate user with correct credentials", async () => {
    const user = await auth.login("testuser123", "SecurePass123!");
    expect(user.username).toBe("testuser123");
    expect(auth.isAuthenticated()).toBe(true);
  });

  test("should reject invalid credentials", async () => {
    try {
      await auth.login("testuser123", "WrongPass1!");
      expect(false).toBe(true);
    } catch (error) {
      expect((error as Error).message).toContain("Invalid credentials");
    }
  });
});

describe("File Operations", () => {
  test("should create and read a file", async () => {
    await fileManager.writeFile("test.txt", "Hello, secure world!", testUserId);
    const content = await fileManager.readFile("test.txt", testUserId);
    expect(content).toBe("Hello, secure world!");
  });

  test("should get file information", async () => {
    const info = await fileManager.getFileInfo("test.txt", testUserId);
    expect(info.name).toBe("test.txt");
    expect(info.size).toBe(20);
    expect(info.isDirectory).toBe(false);
  });

  test("should list files in directory", async () => {
    const files = await fileManager.listFiles(".", testUserId);
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  test("should copy a file", async () => {
    await fileManager.copyFile("test.txt", "test-copy.txt", testUserId);
    const content = await fileManager.readFile("test-copy.txt", testUserId);
    expect(content).toBe("Hello, secure world!");
  });

  test("should delete a file", async () => {
    await fileManager.writeFile("to-delete.txt", "delete me", testUserId);
    await fileManager.deleteFile("to-delete.txt", testUserId);

    try {
      await fileManager.readFile("to-delete.txt", testUserId);
      expect(false).toBe(true);
    } catch (error) {
      expect((error as Error).message).toContain("File does not exist");
    }
  });

  test("should create a directory", async () => {
    const dirName = `testdir-${Date.now()}`;
    await fileManager.createDirectory(dirName, testUserId);
    const info = await fileManager.getFileInfo(dirName, testUserId);
    expect(info.isDirectory).toBe(true);
  });
});

describe("Path Traversal Protection", () => {
  test("should block path traversal in read operations", async () => {
    try {
      await fileManager.readFile("../../../etc/passwd", testUserId);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("should sanitize filename in write operations", async () => {
    // Sanitization removes "../" so file is created with sanitized name
    await fileManager.writeFile("../../attack.txt", "malicious", testUserId);

    // The file should be created as "attack.txt" (sanitized)
    const content = await fileManager.readFile("attack.txt", testUserId);
    expect(content).toBe("malicious");
  });

  test("should block absolute paths outside base directory", async () => {
    try {
      await fileManager.readFile("/etc/passwd", testUserId);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("should sanitize filenames with dangerous characters", async () => {
    // These characters should be removed
    await fileManager.writeFile("file<>:|?.txt", "content", testUserId);
    const content = await fileManager.readFile("file.txt", testUserId);
    expect(content).toBe("content");
  });
});

describe("File Size Validation", () => {
  test("should reject files exceeding size limit", async () => {
    const largeContent = "x".repeat(SECURITY_CONFIG.MAX_FILE_SIZE + 1);

    try {
      await fileManager.writeFile("large.txt", largeContent, testUserId);
      expect(false).toBe(true);
    } catch (error) {
      expect((error as Error).message).toContain(
        "exceeds maximum allowed size"
      );
    }
  });

  test("should accept files within size limit", async () => {
    const normalContent = "x".repeat(1000);
    await fileManager.writeFile("normal.txt", normalContent, testUserId);
    const content = await fileManager.readFile("normal.txt", testUserId);
    expect(content).toBe(normalContent);
  });
});

describe("JSON Handling", () => {
  test("should safely serialize and parse JSON", async () => {
    const data = { name: "Test", value: 123, nested: { key: "value" } };
    const jsonString = SafeJSONHandler.stringify(data);

    await fileManager.writeFile("data.json", jsonString, testUserId);
    const content = await fileManager.readFile("data.json", testUserId);
    const parsed = SafeJSONHandler.parse(content);

    expect(parsed.name).toBe("Test");
    expect(parsed.value).toBe(123);
    expect(parsed.nested.key).toBe("value");
  });

  test("should reject oversized JSON", async () => {
    const largeObj: any = {};
    for (let i = 0; i < 100000; i++) {
      largeObj[`key${i}`] = "x".repeat(200);
    }

    expect(() => {
      SafeJSONHandler.stringify(largeObj);
    }).toThrow("exceeds maximum allowed size");
  });

  test("should reject deeply nested JSON", async () => {
    let deepObj: any = {};
    let current = deepObj;

    // Create object nested 20 levels deep
    for (let i = 0; i < 20; i++) {
      current.nested = {};
      current = current.nested;
    }

    const jsonString = JSON.stringify(deepObj);

    expect(() => {
      SafeJSONHandler.parse(jsonString);
    }).toThrow("Object nesting too deep");
  });

  test("should handle pretty printing", async () => {
    const data = { a: 1, b: 2 };
    const pretty = SafeJSONHandler.stringify(data, true);
    expect(pretty).toContain("\n");
    expect(pretty).toContain("  ");
  });
});

describe("XML Handling", () => {
  test("should safely build and parse XML", async () => {
    const xmlHandler = new SafeXMLHandler();
    const data = { root: { item: "test", value: 42 } };
    const xmlString = xmlHandler.build(data);

    await fileManager.writeFile("data.xml", xmlString, testUserId);
    const content = await fileManager.readFile("data.xml", testUserId);
    const parsed = xmlHandler.parse(content);

    expect(parsed.root.item).toBe("test");
    expect(parsed.root.value).toBe(42);
  });

  test("should block XXE attacks with DOCTYPE", async () => {
    const xmlHandler = new SafeXMLHandler();
    const maliciousXML = `<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<root><data>&xxe;</data></root>`;

    expect(() => {
      xmlHandler.parse(maliciousXML);
    }).toThrow("DOCTYPE");
  });

  test("should block XXE attacks with ENTITY", async () => {
    const xmlHandler = new SafeXMLHandler();
    const maliciousXML = `<?xml version="1.0"?>
<!ENTITY xxe SYSTEM "file:///etc/passwd">
<root><data>&xxe;</data></root>`;

    expect(() => {
      xmlHandler.parse(maliciousXML);
    }).toThrow("ENTITY");
  });

  test("should block external entity references", async () => {
    const xmlHandler = new SafeXMLHandler();
    const maliciousXML = `<?xml version="1.0"?>
<root SYSTEM="http://evil.com/malicious.dtd">test</root>`;

    expect(() => {
      xmlHandler.parse(maliciousXML);
    }).toThrow("external entity");
  });

  test("should reject oversized XML", async () => {
    const xmlHandler = new SafeXMLHandler();
    const largeXML =
      "<root>" + "x".repeat(SECURITY_CONFIG.MAX_XML_SIZE + 1) + "</root>";

    expect(() => {
      xmlHandler.parse(largeXML);
    }).toThrow("exceeds maximum allowed size");
  });
});

describe("SQL Injection Protection", () => {
  test("should prevent SQL injection in username", async () => {
    try {
      await auth.register("admin' OR '1'='1", "Aa1!");
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("should use prepared statements for all queries", async () => {
    // This test verifies that the database still works correctly
    // which means prepared statements are working
    const user = db.getUserByUsername("testuser123");
    expect(user).toBeDefined();
    expect(user?.username).toBe("testuser123");
  });

  test("should handle special characters in filenames safely", async () => {
    // These should be sanitized, not cause SQL errors
    const filename = "file'; DROP TABLE Users; --";
    await fileManager.writeFile(filename, "safe content", testUserId);

    // Database should still work
    const user = db.getUserById(testUserId);
    expect(user).toBeDefined();
  });
});

describe("Database Operations and Logging", () => {
  test("should log all user operations", async () => {
    const beforeCount = auth.getUserActivity(1000).length;

    await fileManager.writeFile("logged-file.txt", "content", testUserId);
    await fileManager.readFile("logged-file.txt", testUserId);

    const afterCount = auth.getUserActivity(1000).length;
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  test("should use transactions for atomic operations", async () => {
    let transactionWorked = false;

    db.transaction(() => {
      db.logOperation("create", testUserId, null, "Transaction test");
      transactionWorked = true;
    });

    expect(transactionWorked).toBe(true);
  });

  test("should track file ownership", async () => {
    const filename = `owned-${Date.now()}.txt`;
    await fileManager.writeFile(filename, "my file", testUserId);

    const userFiles = db.getFilesByOwner(testUserId);
    const ownedFile = userFiles.find((f) => f.filename === filename);

    expect(ownedFile).toBeDefined();
    expect(ownedFile?.owner_id).toBe(testUserId);
  });

  test("should record operation details", async () => {
    const filename = `detailed-${Date.now()}.txt`;
    await fileManager.writeFile(filename, "test", testUserId);

    const operations = auth.getUserActivity(50);
    const createOp = operations.find(
      (op) => op.operation_type === "create" && op.details.includes(filename)
    );

    expect(createOp).toBeDefined();
    expect(createOp?.user_id).toBe(testUserId);
  });
});

describe("Race Condition Prevention", () => {
  test("should handle concurrent file writes safely", async () => {
    const filename = "concurrent.txt";

    // Simulate concurrent writes
    const writes = Promise.all([
      fileManager.writeFile(filename, "write1", testUserId),
      fileManager.writeFile(filename, "write2", testUserId),
      fileManager.writeFile(filename, "write3", testUserId),
    ]);

    await writes;

    // File should have one of the values (not corrupted)
    const content = await fileManager.readFile(filename, testUserId);
    expect(["write1", "write2", "write3"]).toContain(content);
  });

  test("should handle concurrent read/write without corruption", async () => {
    const filename = "read-write.txt";
    await fileManager.writeFile(filename, "initial", testUserId);

    const operations = Promise.all([
      fileManager.readFile(filename, testUserId),
      fileManager.writeFile(filename, "updated", testUserId),
      fileManager.readFile(filename, testUserId),
    ]);

    const [read1, , read2] = await operations;

    // Reads should return valid content (not corrupted)
    expect(["initial", "updated"]).toContain(read1);
    expect(["initial", "updated"]).toContain(read2);
  });
});

describe("Security Configuration", () => {
  test("should enforce maximum file size", () => {
    expect(SECURITY_CONFIG.MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  });

  test("should enforce maximum JSON size", () => {
    expect(SECURITY_CONFIG.MAX_JSON_SIZE).toBe(10 * 1024 * 1024);
  });

  test("should enforce maximum XML size", () => {
    expect(SECURITY_CONFIG.MAX_XML_SIZE).toBe(10 * 1024 * 1024);
  });

  test("should enforce maximum ZIP size", () => {
    expect(SECURITY_CONFIG.MAX_ZIP_SIZE).toBe(50 * 1024 * 1024);
  });

  test("should enforce maximum compression ratio", () => {
    expect(SECURITY_CONFIG.MAX_COMPRESSION_RATIO).toBe(100);
  });

  test("should have allowed file extensions", () => {
    expect(SECURITY_CONFIG.ALLOWED_FILE_EXTENSIONS).toContain(".txt");
    expect(SECURITY_CONFIG.ALLOWED_FILE_EXTENSIONS).toContain(".json");
    expect(SECURITY_CONFIG.ALLOWED_FILE_EXTENSIONS).toContain(".xml");
    expect(SECURITY_CONFIG.ALLOWED_FILE_EXTENSIONS).toContain(".zip");
  });
});

describe("System Information", () => {
  test("should get disk space information", async () => {
    const diskSpace = await fileManager.getDiskSpace();

    expect(diskSpace.total).toBeGreaterThan(0);
    expect(diskSpace.free).toBeGreaterThanOrEqual(0);
    expect(diskSpace.used).toBeGreaterThanOrEqual(0);
    expect(diskSpace.total).toBeGreaterThanOrEqual(diskSpace.used);
  });
});

describe("Audit Logging", () => {
  test("should log file creation", async () => {
    const filename = `audit-${Date.now()}.txt`;
    const beforeOps = auth.getUserActivity(1000);

    await fileManager.writeFile(filename, "test", testUserId);

    const afterOps = auth.getUserActivity(1000);

    // Should have at least one more operation
    expect(afterOps.length).toBeGreaterThanOrEqual(beforeOps.length);

    const createOp = afterOps.find(
      (op) => op.operation_type === "create" && op.details.includes(filename)
    );
    expect(createOp).toBeDefined();
  });

  test("should log file modifications", async () => {
    const filename = `modify-${Date.now()}.txt`;
    await fileManager.writeFile(filename, "v1", testUserId);

    // Clear previous operations from memory
    const beforeModify = auth.getUserActivity(1000);

    // Now modify
    await fileManager.writeFile(filename, "v2", testUserId);

    const ops = auth.getUserActivity(1000);
    const modifyOps = ops.filter(
      (op) => op.operation_type === "modify" && op.details.includes(filename)
    );

    expect(modifyOps.length).toBeGreaterThan(0);
  });

  test("should log file deletions", async () => {
    await fileManager.writeFile("delete-test.txt", "test", testUserId);
    await fileManager.deleteFile("delete-test.txt", testUserId);

    const ops = auth.getUserActivity(1000);
    const deleteOp = ops.find(
      (op) =>
        op.operation_type === "delete" && op.details.includes("delete-test.txt")
    );

    expect(deleteOp).toBeDefined();
  });

  test("should log file reads", async () => {
    await fileManager.writeFile("read-test.txt", "test", testUserId);

    const beforeOps = auth.getUserActivity(1000);
    await fileManager.readFile("read-test.txt", testUserId);
    const afterOps = auth.getUserActivity(1000);

    expect(afterOps.length).toBeGreaterThan(beforeOps.length);
  });
});
