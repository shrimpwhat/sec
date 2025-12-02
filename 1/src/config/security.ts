import path from "path";

/**
 * Security configuration constants
 */
export const SECURITY_CONFIG = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100 MB
  MAX_JSON_SIZE: 10 * 1024 * 1024, // 10 MB for JSON
  MAX_XML_SIZE: 10 * 1024 * 1024, // 10 MB for XML
  MAX_ZIP_SIZE: 50 * 1024 * 1024, // 50 MB for ZIP
  MAX_UNCOMPRESSED_SIZE: 500 * 1024 * 1024, // 500 MB uncompressed
  MAX_COMPRESSION_RATIO: 100, // Maximum compression ratio to prevent ZIP bombs
  ALLOWED_FILE_EXTENSIONS: [".txt", ".json", ".xml", ".zip", ".log"],
  BASE_DIRECTORY: path.resolve("storage"),
};
