/**
 * Input sanitization for database queries (extra layer of protection)
 */
export class InputSanitizer {
  static sanitizeString(input: string, maxLength: number = 255): string {
    if (typeof input !== "string") {
      throw new Error("Input must be a string");
    }

    // Trim and limit length
    let sanitized = input.trim().substring(0, maxLength);

    // Remove any null bytes
    sanitized = sanitized.replace(/\0/g, "");

    return sanitized;
  }

  static validateUsername(username: string): string {
    const sanitized = this.sanitizeString(username, 50);

    // Only allow alphanumeric characters, underscore, and hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
      throw new Error(
        "Username can only contain alphanumeric characters, underscore, and hyphen"
      );
    }

    if (sanitized.length < 3) {
      throw new Error("Username must be at least 3 characters long");
    }

    return sanitized;
  }

  static validateInteger(value: any): number {
    const num = parseInt(value, 10);
    if (isNaN(num) || !Number.isInteger(num)) {
      throw new Error("Invalid integer value");
    }
    return num;
  }
}
