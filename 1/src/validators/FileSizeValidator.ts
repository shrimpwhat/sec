import { SECURITY_CONFIG } from "../config/security";

/**
 * File size validator
 */
export class FileSizeValidator {
  static validateFileSize(
    size: number,
    maxSize: number = SECURITY_CONFIG.MAX_FILE_SIZE
  ): void {
    if (size > maxSize) {
      throw new Error(
        `File size (${size} bytes) exceeds maximum allowed size (${maxSize} bytes)`
      );
    }
    if (size < 0) {
      throw new Error("Invalid file size");
    }
  }

  static validateCompressionRatio(
    compressedSize: number,
    uncompressedSize: number
  ): void {
    if (compressedSize === 0) {
      throw new Error("Invalid compressed size");
    }

    const ratio = uncompressedSize / compressedSize;
    if (ratio > SECURITY_CONFIG.MAX_COMPRESSION_RATIO) {
      throw new Error(
        `Compression ratio (${ratio.toFixed(2)}) exceeds maximum allowed (${
          SECURITY_CONFIG.MAX_COMPRESSION_RATIO
        }). Possible ZIP bomb detected.`
      );
    }

    if (uncompressedSize > SECURITY_CONFIG.MAX_UNCOMPRESSED_SIZE) {
      throw new Error(
        `Uncompressed size (${uncompressedSize} bytes) exceeds maximum allowed (${SECURITY_CONFIG.MAX_UNCOMPRESSED_SIZE} bytes)`
      );
    }
  }
}
