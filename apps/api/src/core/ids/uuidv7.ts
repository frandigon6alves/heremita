import { randomBytes } from 'node:crypto';

const TIMESTAMP_BYTES = 6;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;

/** RFC 9562 UUIDv7: 48-bit Unix milliseconds, then random bits. Node 24 has no built-in one. */
export function uuidv7(unixMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(unixMs, 0, TIMESTAMP_BYTES);
  bytes.writeUInt8((bytes.readUInt8(VERSION_BYTE) & 0x0f) | 0x70, VERSION_BYTE);
  bytes.writeUInt8((bytes.readUInt8(VARIANT_BYTE) & 0x3f) | 0x80, VARIANT_BYTE);
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
