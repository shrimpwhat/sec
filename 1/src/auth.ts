import bcrypt from "bcrypt";
import { DatabaseManager } from "./database";
import type { User } from "./database";
import { InputSanitizer } from "./utils/security";

const SALT_ROUNDS = 10;

/**
 * Authentication service with secure password hashing
 */
export class AuthService {
  private db: DatabaseManager;
  private currentUser: User | null = null;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Registers a new user with hashed password
   */
  async register(username: string, password: string): Promise<User> {
    // Validate and sanitize username
    const sanitizedUsername = InputSanitizer.validateUsername(username);

    // Validate password strength
    this.validatePassword(password);

    // Check if user already exists
    const existingUser = this.db.getUserByUsername(sanitizedUsername);
    if (existingUser) {
      throw new Error("Username already exists");
    }

    // Hash password using bcrypt
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user in database
    const userId = this.db.createUser(sanitizedUsername, passwordHash);

    const user = this.db.getUserById(userId);
    if (!user) {
      throw new Error("Failed to create user");
    }

    // Log the registration
    this.db.logOperation("create", userId, null, "User registered");

    return user;
  }

  /**
   * Authenticates a user with username and password
   */
  async login(username: string, password: string): Promise<User> {
    // Sanitize username
    const sanitizedUsername = InputSanitizer.sanitizeString(username, 50);

    // Get user from database
    const user = this.db.getUserByUsername(sanitizedUsername);
    if (!user) {
      // Use generic error message to prevent username enumeration
      throw new Error("Invalid credentials");
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new Error("Invalid credentials");
    }

    // Set current user
    this.currentUser = user;

    // Log the login
    this.db.logOperation("read", user.id, null, "User logged in");

    return user;
  }

  /**
   * Logs out the current user
   */
  logout(): void {
    if (this.currentUser) {
      this.db.logOperation(
        "read",
        this.currentUser.id,
        null,
        "User logged out"
      );
      this.currentUser = null;
    }
  }

  /**
   * Changes user password
   */
  async changePassword(
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!this.currentUser) {
      throw new Error("No user logged in");
    }

    // Verify old password
    const isValid = await bcrypt.compare(
      oldPassword,
      this.currentUser.password_hash
    );
    if (!isValid) {
      throw new Error("Invalid current password");
    }

    // Validate new password
    this.validatePassword(newPassword);

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update in database (we'd need to add this method to DatabaseManager)
    // For now, we'll create a new method
    this.db.transaction(() => {
      const stmt = (this.db as any).db.prepare(
        "UPDATE Users SET password_hash = ? WHERE id = ?"
      );
      stmt.run(newPasswordHash, this.currentUser!.id);
    });

    // Update current user object
    this.currentUser.password_hash = newPasswordHash;

    // Log the operation
    this.db.logOperation(
      "modify",
      this.currentUser.id,
      null,
      "Password changed"
    );
  }

  /**
   * Gets the currently logged in user
   */
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * Checks if a user is logged in
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  /**
   * Validates password strength
   */
  private validatePassword(password: string): void {
    if (password.length < 3) {
      throw new Error("Password must be at least 3 characters long");
    }

    if (password.length > 128) {
      throw new Error("Password must not exceed 128 characters");
    }
  }

  /**
   * Gets user activity log
   */
  getUserActivity(limit: number = 50): any[] {
    if (!this.currentUser) {
      throw new Error("No user logged in");
    }

    return this.db.getOperationsByUser(this.currentUser.id, limit);
  }

  /**
   * Deletes user account (admin function)
   */
  async deleteAccount(password: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error("No user logged in");
    }

    // Verify password before deletion
    const isValid = await bcrypt.compare(
      password,
      this.currentUser.password_hash
    );
    if (!isValid) {
      throw new Error("Invalid password");
    }

    const userId = this.currentUser.id;

    // Delete user from database (transaction for safety)
    this.db.transaction(() => {
      // Delete user's files
      const stmt1 = (this.db as any).db.prepare(
        "DELETE FROM Files WHERE owner_id = ?"
      );
      stmt1.run(userId);

      // Note: Operations are kept for audit purposes

      // Delete user
      const stmt2 = (this.db as any).db.prepare(
        "DELETE FROM Users WHERE id = ?"
      );
      stmt2.run(userId);
    });

    this.currentUser = null;
  }
}
