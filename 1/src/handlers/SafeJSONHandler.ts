import { FileSizeValidator } from "../validators/FileSizeValidator";
import { SECURITY_CONFIG } from "../config/security";

/**
 * Safe JSON handler with size limits and validation
 */
export class SafeJSONHandler {
  /**
   * Safely parse JSON with size validation
   */
  static parse<T = any>(jsonString: string): T {
    // Validate size
    const size = Buffer.byteLength(jsonString, "utf-8");
    FileSizeValidator.validateFileSize(size, SECURITY_CONFIG.MAX_JSON_SIZE);

    try {
      // Use JSON.parse which is safe (doesn't execute code)
      const parsed = JSON.parse(jsonString);

      // Additional validation: check depth to prevent deeply nested objects
      this.validateDepth(parsed, 0, 10);

      return parsed;
    } catch (error) {
      throw new Error(
        `JSON parsing error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Safely stringify object to JSON
   */
  static stringify(obj: any, pretty: boolean = false): string {
    try {
      const jsonString = pretty
        ? JSON.stringify(obj, null, 2)
        : JSON.stringify(obj);

      // Validate result size
      const size = Buffer.byteLength(jsonString, "utf-8");
      FileSizeValidator.validateFileSize(size, SECURITY_CONFIG.MAX_JSON_SIZE);

      return jsonString;
    } catch (error) {
      throw new Error(
        `JSON stringification error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validates object depth to prevent stack overflow
   */
  private static validateDepth(
    obj: any,
    currentDepth: number,
    maxDepth: number
  ): void {
    if (currentDepth > maxDepth) {
      throw new Error(`Object nesting too deep (max: ${maxDepth})`);
    }

    if (obj && typeof obj === "object") {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          this.validateDepth(obj[key], currentDepth + 1, maxDepth);
        }
      }
    }
  }

  /**
   * Validates a parsed JSON object structure
   */
  static validate(obj: any, schema?: any): boolean {
    // Basic validation
    if (obj === null || obj === undefined) {
      throw new Error("Invalid JSON: null or undefined");
    }

    // If schema provided, validate against it (simple validation)
    if (schema) {
      return this.validateAgainstSchema(obj, schema);
    }

    return true;
  }

  /**
   * Simple schema validation
   */
  private static validateAgainstSchema(obj: any, schema: any): boolean {
    const objType = typeof obj;
    const schemaType = typeof schema;

    if (schema === String) {
      return typeof obj === "string";
    }
    if (schema === Number) {
      return typeof obj === "number";
    }
    if (schema === Boolean) {
      return typeof obj === "boolean";
    }
    if (Array.isArray(schema)) {
      return Array.isArray(obj);
    }
    if (schemaType === "object") {
      if (objType !== "object") return false;
      for (const key in schema) {
        if (schema.hasOwnProperty(key)) {
          if (!obj.hasOwnProperty(key)) return false;
          if (!this.validateAgainstSchema(obj[key], schema[key])) return false;
        }
      }
      return true;
    }

    return true;
  }
}
