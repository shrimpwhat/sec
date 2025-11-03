import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { FileSizeValidator } from "../validators/FileSizeValidator";
import { SECURITY_CONFIG } from "../config/security";

/**
 * Safe XML handler with size limits and validation
 */
export class SafeXMLHandler {
  private parser: XMLParser;
  private builder: XMLBuilder;

  constructor() {
    // Configure parser with security options
    this.parser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
      trimValues: true,
      // Security: limit size of processed data
      processEntities: false, // Prevent XXE attacks
      allowBooleanAttributes: true,
    });

    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      suppressEmptyNode: true,
    });
  }

  /**
   * Safely parse XML with size validation
   */
  parse<T = any>(xmlString: string): T {
    // Validate size
    const size = Buffer.byteLength(xmlString, "utf-8");
    FileSizeValidator.validateFileSize(size, SECURITY_CONFIG.MAX_XML_SIZE);

    // Check for potential XXE attack patterns
    this.validateXMLSecurity(xmlString);

    try {
      const parsed = this.parser.parse(xmlString);
      return parsed as T;
    } catch (error) {
      throw new Error(
        `XML parsing error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Build XML from object
   */
  build(obj: any): string {
    try {
      const xmlString = this.builder.build(obj);

      // Validate result size
      const size = Buffer.byteLength(xmlString, "utf-8");
      FileSizeValidator.validateFileSize(size, SECURITY_CONFIG.MAX_XML_SIZE);

      return xmlString;
    } catch (error) {
      throw new Error(
        `XML building error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate XML for security issues (XXE, etc.)
   */
  private validateXMLSecurity(xmlString: string): void {
    // Check for DOCTYPE declarations (potential XXE)
    if (xmlString.includes("<!DOCTYPE") || xmlString.includes("<!ENTITY")) {
      throw new Error(
        "XML contains DOCTYPE or ENTITY declarations - potential XXE attack"
      );
    }

    // Check for external entity references
    if (xmlString.includes("SYSTEM") || xmlString.includes("PUBLIC")) {
      throw new Error(
        "XML contains external entity references - potential XXE attack"
      );
    }

    // Check for processing instructions that might be dangerous
    if (xmlString.match(/<\?.*?\?>/g)) {
      const pis = xmlString.match(/<\?.*?\?>/g);
      if (pis && pis.some((pi) => !pi.startsWith("<?xml"))) {
        console.warn("Warning: XML contains processing instructions");
      }
    }
  }

  /**
   * Sanitize XML content
   */
  static sanitize(xmlString: string): string {
    // Remove potentially dangerous elements
    return xmlString
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<!ENTITY[^>]*>/gi, "")
      .replace(/<!\[CDATA\[/gi, "")
      .replace(/\]\]>/gi, "");
  }
}
