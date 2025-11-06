import * as readline from "readline";
import { DatabaseManager } from "./src/database";
import { AuthService } from "./src/auth";
import { FileManager } from "./src/fileManager";
import {
  DataHandler,
  SafeJSONHandler,
  SafeXMLHandler,
} from "./src/dataHandlers";
import { ZipManager } from "./src/zipManager";
import { SECURITY_CONFIG } from "./src/utils/security";

/**
 * Secure File Manager CLI Application
 */
class FileManagerApp {
  private db: DatabaseManager;
  private auth: AuthService;
  private fileManager: FileManager;
  private dataHandler: DataHandler;
  private zipManager: ZipManager;
  private rl: readline.Interface;

  constructor() {
    this.db = new DatabaseManager();
    this.auth = new AuthService(this.db);
    this.fileManager = new FileManager(this.db);
    this.dataHandler = new DataHandler();
    this.zipManager = new ZipManager(this.db);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async start(): Promise<void> {
    let running = true;

    while (running) {
      if (!this.auth.isAuthenticated()) {
        running = await this.authMenu();
      } else {
        running = await this.mainMenu();
      }
    }

    this.cleanup();
  }

  private async authMenu(): Promise<boolean> {
    console.log("\n=== Authentication Menu ===");
    console.log("1. Login");
    console.log("2. Register");
    console.log("3. Exit");

    const choice = await this.question("\nSelect action: ");

    switch (choice) {
      case "1":
        await this.login();
        break;
      case "2":
        await this.register();
        break;
      case "3":
        return false;
      default:
        console.log("Invalid choice");
    }

    return true;
  }

  private async login(): Promise<void> {
    try {
      const username = await this.question("Username: ");
      const password = await this.question("Password: ");

      const user = await this.auth.login(username, password);
      console.log(`\n✓ Login successful! Welcome, ${user.username}!`);
    } catch (error) {
      console.error(
        `✗ Login error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async register(): Promise<void> {
    try {
      const username = await this.question("Username: ");
      const password = await this.question("Password: ");
      const confirmPassword = await this.question("Confirm password: ");

      if (password !== confirmPassword) {
        console.log("✗ Passwords do not match");
        return;
      }

      const user = await this.auth.register(username, password);
      console.log(
        `\n✓ Registration successful! User ${user.username} created.`
      );
    } catch (error) {
      console.error(
        `✗ Registration error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async mainMenu(): Promise<boolean> {
    const user = this.auth.getCurrentUser();
    console.log(`\n=== Main Menu (User: ${user?.username}) ===`);
    console.log("1. File Operations");
    console.log("2. JSON/XML Operations");
    console.log("3. ZIP Archive Operations");
    console.log("4. System Information");
    console.log("5. Operation History");
    console.log("6. Change Password");
    console.log("7. Clear Storage");
    console.log("8. Logout");

    const choice = await this.question("\nSelect action: ");

    switch (choice) {
      case "1":
        await this.fileOperationsMenu();
        break;
      case "2":
        await this.dataFormatsMenu();
        break;
      case "3":
        await this.zipOperationsMenu();
        break;
      case "4":
        await this.systemInfoMenu();
        break;
      case "5":
        await this.showHistory();
        break;
      case "6":
        await this.changePassword();
        break;
      case "7":
        await this.clearStorage();
        break;
      case "8":
        this.auth.logout();
        console.log("✓ Logged out successfully");
        break;
      default:
        console.log("Invalid choice");
    }

    return true;
  }

  private async fileOperationsMenu(): Promise<void> {
    console.log("\n=== File Operations ===");
    console.log("1. Create File");
    console.log("2. Read File");
    console.log("3. Modify File");
    console.log("4. Delete File");
    console.log("5. Copy File");
    console.log("6. List Files");
    console.log("7. File Information");
    console.log("8. Back");

    const choice = await this.question("\nSelect action: ");

    try {
      const user = this.auth.getCurrentUser()!;

      switch (choice) {
        case "1":
          await this.createFile(user.id);
          break;
        case "2":
          await this.readFile(user.id);
          break;
        case "3":
          await this.modifyFile(user.id);
          break;
        case "4":
          await this.deleteFile(user.id);
          break;
        case "5":
          await this.copyFile(user.id);
          break;
        case "6":
          await this.listFiles(user.id);
          break;
        case "7":
          await this.getFileInfo(user.id);
          break;
        case "8":
          return;
        default:
          console.log("Invalid choice");
      }
    } catch (error) {
      console.error(
        `✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async createFile(userId: number): Promise<void> {
    const filename = await this.question("Filename (with extension): ");

    // Acquire lock before asking for content
    const lockManager = this.fileManager.getLockManager();
    const pathValidator = this.fileManager.getPathValidator();
    const sanitizedFilename = pathValidator.sanitizeFilename(filename);
    const validPath = pathValidator.validatePath(sanitizedFilename);
    const release = await lockManager.acquireLock(validPath);

    try {
      const content = await this.question("File content: ");

      await this.fileManager.writeFile(filename, content, userId);
      console.log("✓ File created successfully");
    } finally {
      release();
    }
  }

  private async readFile(userId: number): Promise<void> {
    const filename = await this.question("Filename: ");
    const content = await this.fileManager.readFile(filename, userId);
    console.log("\n--- File Content ---");
    console.log(content);
    console.log("--- End of File ---");
  }

  private async modifyFile(userId: number): Promise<void> {
    const filename = await this.question("Filename: ");

    // Acquire lock before asking for content
    const lockManager = this.fileManager.getLockManager();
    const pathValidator = this.fileManager.getPathValidator();
    const validPath = pathValidator.validatePath(filename);
    const release = await lockManager.acquireLock(validPath);

    try {
      const content = await this.question("New content: ");

      await this.fileManager.writeFile(filename, content, userId);
      console.log("✓ File modified successfully");
    } finally {
      release();
    }
  }

  private async deleteFile(userId: number): Promise<void> {
    const filename = await this.question("Filename: ");

    // Acquire lock before asking for confirmation
    const lockManager = this.fileManager.getLockManager();
    const pathValidator = this.fileManager.getPathValidator();
    const validPath = pathValidator.validatePath(filename);
    const release = await lockManager.acquireLock(validPath);

    try {
      const confirm = await this.question(
        `Delete file "${filename}"? (yes/no): `
      );

      if (confirm.toLowerCase() === "yes" || confirm.toLowerCase() === "y") {
        await this.fileManager.deleteFile(filename, userId);
        console.log("✓ File deleted successfully");
      } else {
        console.log("Cancelled");
      }
    } finally {
      release();
    }
  }

  private async copyFile(userId: number): Promise<void> {
    const source = await this.question("Source file: ");
    const dest = await this.question("Destination file: ");

    await this.fileManager.copyFile(source, dest, userId);
    console.log("✓ File copied successfully");
  }

  private async listFiles(userId: number): Promise<void> {
    const files = await this.fileManager.listFiles(".", userId);

    console.log("\n--- File List ---");
    files.forEach((file, index) => {
      console.log(`${index + 1}. ${file}`);
    });
    console.log(`Total files: ${files.length}`);
  }

  private async getFileInfo(userId: number): Promise<void> {
    const filename = await this.question("Filename: ");
    const info = await this.fileManager.getFileInfo(filename, userId);

    console.log("\n--- File Information ---");
    console.log(`Name: ${info.name}`);
    console.log(`Size: ${info.size} bytes`);
    console.log(`Created: ${info.created.toLocaleString()}`);
    console.log(`Modified: ${info.modified.toLocaleString()}`);
    console.log(`Type: ${info.isDirectory ? "Directory" : "File"}`);
  }

  private async dataFormatsMenu(): Promise<void> {
    console.log("\n=== JSON/XML Operations ===");
    console.log("1. Create JSON File");
    console.log("2. Read JSON File");
    console.log("3. Create XML File");
    console.log("4. Read XML File");
    console.log("5. Convert JSON to XML");
    console.log("6. Convert XML to JSON");
    console.log("7. Back");

    const choice = await this.question("\nSelect action: ");

    try {
      const user = this.auth.getCurrentUser()!;

      switch (choice) {
        case "1":
          await this.createJSONFile(user.id);
          break;
        case "2":
          await this.readJSONFile(user.id);
          break;
        case "3":
          await this.createXMLFile(user.id);
          break;
        case "4":
          await this.readXMLFile(user.id);
          break;
        case "5":
          await this.convertFormat(user.id, "json", "xml");
          break;
        case "6":
          await this.convertFormat(user.id, "xml", "json");
          break;
        case "7":
          return;
        default:
          console.log("Invalid choice");
      }
    } catch (error) {
      console.error(
        `✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async createJSONFile(userId: number): Promise<void> {
    const filename = await this.question("JSON filename: ");
    console.log("Enter data in key=value format (empty line to finish):");

    const data: any = {};
    while (true) {
      const line = await this.question("> ");
      if (!line) break;

      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        data[key.trim()] = valueParts.join("=").trim();
      }
    }

    const jsonString = SafeJSONHandler.stringify(data, true);
    await this.fileManager.writeFile(filename, jsonString, userId);
    console.log("✓ JSON file created successfully");
  }

  private async readJSONFile(userId: number): Promise<void> {
    const filename = await this.question("JSON filename: ");
    const content = await this.fileManager.readFile(filename, userId);
    const data = SafeJSONHandler.parse(content);

    console.log("\n--- JSON Content ---");
    console.log(JSON.stringify(data, null, 2));
  }

  private async createXMLFile(userId: number): Promise<void> {
    const filename = await this.question("XML filename: ");
    console.log("Enter data in key=value format (empty line to finish):");

    const data: any = { root: {} };
    while (true) {
      const line = await this.question("> ");
      if (!line) break;

      const [key, ...valueParts] = line.split("=");
      if (key && valueParts.length > 0) {
        data.root[key.trim()] = valueParts.join("=").trim();
      }
    }

    const xmlHandler = new SafeXMLHandler();
    const xmlString = xmlHandler.build(data);
    await this.fileManager.writeFile(filename, xmlString, userId);
    console.log("✓ XML file created successfully");
  }

  private async readXMLFile(userId: number): Promise<void> {
    const filename = await this.question("XML filename: ");
    const content = await this.fileManager.readFile(filename, userId);

    const xmlHandler = new SafeXMLHandler();
    const data = xmlHandler.parse(content);

    console.log("\n--- XML Content ---");
    console.log(JSON.stringify(data, null, 2));
  }

  private async convertFormat(
    userId: number,
    from: "json" | "xml",
    to: "json" | "xml"
  ): Promise<void> {
    const inputFile = await this.question(`${from.toUpperCase()} filename: `);
    const outputFile = await this.question(
      `Output ${to.toUpperCase()} filename: `
    );

    const content = await this.fileManager.readFile(inputFile, userId);
    const converted = this.dataHandler.convert(content, from, to);

    await this.fileManager.writeFile(outputFile, converted, userId);
    console.log(
      `✓ File converted successfully from ${from.toUpperCase()} to ${to.toUpperCase()}`
    );
  }

  private async zipOperationsMenu(): Promise<void> {
    console.log("\n=== ZIP Archive Operations ===");
    console.log("1. Create ZIP Archive");
    console.log("2. Extract ZIP Archive");
    console.log("3. View ZIP Contents");
    console.log("4. Back");

    const choice = await this.question("\nSelect action: ");

    try {
      const user = this.auth.getCurrentUser()!;

      switch (choice) {
        case "1":
          await this.createZip(user.id);
          break;
        case "2":
          await this.extractZip(user.id);
          break;
        case "3":
          await this.listZipContents(user.id);
          break;
        case "4":
          return;
        default:
          console.log("Invalid choice");
      }
    } catch (error) {
      console.error(
        `✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async createZip(userId: number): Promise<void> {
    const zipName = await this.question("ZIP archive name: ");
    console.log("Enter filenames to archive (empty line to finish):");

    const files: string[] = [];
    while (true) {
      const file = await this.question("File: ");
      if (!file) break;
      files.push(file);
    }

    if (files.length === 0) {
      console.log("No files to archive");
      return;
    }

    await this.zipManager.createZip(files, zipName, userId);
    console.log("✓ ZIP archive created successfully");
  }

  private async extractZip(userId: number): Promise<void> {
    const zipFile = await this.question("ZIP archive name: ");
    const outputDir = await this.question("Extraction directory: ");

    const extractedFiles = await this.zipManager.extractZip(
      zipFile,
      outputDir,
      userId
    );
    console.log(`✓ Extracted files: ${extractedFiles.length}`);
    extractedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
    });
  }

  private async listZipContents(userId: number): Promise<void> {
    const zipFile = await this.question("ZIP archive name: ");
    const entries = await this.zipManager.listZipContents(zipFile, userId);

    console.log("\n--- ZIP Archive Contents ---");
    console.log(
      `${"Filename".padEnd(40)} ${"Size".padEnd(15)} ${"Compressed".padEnd(
        15
      )} ${"Ratio"}`
    );
    console.log("-".repeat(80));

    entries.forEach((entry) => {
      console.log(
        `${entry.name.padEnd(40)} ${String(entry.uncompressedSize).padEnd(
          15
        )} ${String(entry.compressedSize).padEnd(
          15
        )} ${entry.compressionRatio.toFixed(2)}`
      );
    });

    const totalUncompressed = entries.reduce(
      (sum, e) => sum + e.uncompressedSize,
      0
    );
    const totalCompressed = entries.reduce(
      (sum, e) => sum + e.compressedSize,
      0
    );
    const avgRatio =
      totalCompressed > 0 ? totalUncompressed / totalCompressed : 0;

    console.log("-".repeat(80));
    console.log(`Total files: ${entries.length}`);
    console.log(`Uncompressed size: ${totalUncompressed} bytes`);
    console.log(`Compressed size: ${totalCompressed} bytes`);
    console.log(`Average compression ratio: ${avgRatio.toFixed(2)}`);
  }

  private async systemInfoMenu(): Promise<void> {
    console.log("\n=== System Information ===");

    const diskSpace = await this.fileManager.getDiskSpace();

    console.log("\n--- Disk Space ---");
    console.log(`Total: ${this.formatBytes(diskSpace.total)}`);
    console.log(`Used: ${this.formatBytes(diskSpace.used)}`);
    console.log(`Free: ${this.formatBytes(diskSpace.free)}`);
    console.log(
      `Usage: ${((diskSpace.used / diskSpace.total) * 100).toFixed(2)}%`
    );

    console.log("\n--- Security Settings ---");
    console.log(
      `Max file size: ${this.formatBytes(SECURITY_CONFIG.MAX_FILE_SIZE)}`
    );
    console.log(
      `Max JSON size: ${this.formatBytes(SECURITY_CONFIG.MAX_JSON_SIZE)}`
    );
    console.log(
      `Max XML size: ${this.formatBytes(SECURITY_CONFIG.MAX_XML_SIZE)}`
    );
    console.log(
      `Max ZIP size: ${this.formatBytes(SECURITY_CONFIG.MAX_ZIP_SIZE)}`
    );
    console.log(
      `Max compression ratio: ${SECURITY_CONFIG.MAX_COMPRESSION_RATIO}`
    );
    console.log(`Base directory: ${SECURITY_CONFIG.BASE_DIRECTORY}`);
    console.log(
      `Allowed extensions: ${SECURITY_CONFIG.ALLOWED_FILE_EXTENSIONS.join(
        ", "
      )}`
    );
  }

  private async showHistory(): Promise<void> {
    const limit = await this.question(
      "Number of recent operations (default 20): "
    );
    const numLimit = parseInt(limit) || 20;

    const operations = this.auth.getUserActivity(numLimit);

    console.log(`${"Time".padEnd(20)} ${"Operation".padEnd(10)} ${"Details"}`);
    console.log("-".repeat(80));

    operations.forEach((op) => {
      const time = new Date(op.timestamp).toLocaleString();
      console.log(
        `${time.padEnd(20)} ${op.operation_type.padEnd(10)} ${op.details}`
      );
    });

    console.log(`\nTotal operations: ${operations.length}`);
  }

  private async changePassword(): Promise<void> {
    try {
      const oldPassword = await this.question("Current password: ");
      const newPassword = await this.question("New password: ");
      const confirmPassword = await this.question("Confirm new password: ");

      if (newPassword !== confirmPassword) {
        console.log("✗ Passwords do not match");
        return;
      }

      await this.auth.changePassword(oldPassword, newPassword);
      console.log("✓ Password changed successfully");
    } catch (error) {
      console.error(
        `✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private async clearStorage(): Promise<void> {
    try {
      console.log(
        "\nWARNING: This will delete ALL files in the storage directory!"
      );
      const confirm = await this.question(
        "Are you sure you want to clear storage? Type 'YES' to confirm: "
      );

      if (confirm !== "YES") {
        console.log("Cancelled");
        return;
      }

      const user = this.auth.getCurrentUser()!;
      await this.fileManager.clearStorage(user.id);
      console.log("✓ Storage cleared successfully");
    } catch (error) {
      console.error(
        `✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  private formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let value = bytes;

    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }

    return `${value.toFixed(2)} ${units[i]}`;
  }

  private cleanup(): void {
    this.rl.close();
    this.db.close();
  }
}

// Start the application
const app = new FileManagerApp();
app.start().catch((error) => {
  console.error("Critical error:", error);
  process.exit(1);
});
