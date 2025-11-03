import { SafeJSONHandler } from "./SafeJSONHandler";
import { SafeXMLHandler } from "./SafeXMLHandler";

/**
 * Generic data handler that can work with both JSON and XML
 */
export class DataHandler {
  private jsonHandler: SafeJSONHandler;
  private xmlHandler: SafeXMLHandler;

  constructor() {
    this.jsonHandler = new SafeJSONHandler();
    this.xmlHandler = new SafeXMLHandler();
  }

  /**
   * Parse data based on format
   */
  parse(data: string, format: "json" | "xml"): any {
    switch (format) {
      case "json":
        return SafeJSONHandler.parse(data);
      case "xml":
        return this.xmlHandler.parse(data);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Serialize data to specified format
   */
  serialize(obj: any, format: "json" | "xml", pretty: boolean = false): string {
    switch (format) {
      case "json":
        return SafeJSONHandler.stringify(obj, pretty);
      case "xml":
        return this.xmlHandler.build(obj);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Convert between formats
   */
  convert(
    data: string,
    fromFormat: "json" | "xml",
    toFormat: "json" | "xml"
  ): string {
    const obj = this.parse(data, fromFormat);
    return this.serialize(obj, toFormat);
  }
}
