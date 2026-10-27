import { countryBoxes, places } from "../../contracts/src/identity.js";
import type { CountryCode, PlaceId } from "../../contracts/src/identity.js";

/** Reads the GPS position from a JPEG's EXIF block. Returns null when absent or malformed. */
export function jpegGps(bytes: Buffer): { lat: number; lon: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) return null;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xe1 && bytes.toString("latin1", offset + 4, offset + 10) === "Exif\0\0") {
      try {
        return readTiff(bytes.subarray(offset + 10, offset + 2 + length));
      } catch {
        return null;
      }
    }
    offset += 2 + length;
  }
  return null;
}

function readTiff(tiff: Buffer) {
  const little = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const entries = (ifd: number) => {
    const count = u16(ifd);
    if (count > 200) throw new Error("IFD too large");
    return Array.from({ length: count }, (_, i) => {
      const at = ifd + 2 + i * 12;
      return { tag: u16(at), type: u16(at + 2), count: u32(at + 4), value: at + 8 };
    });
  };
  const gpsPointer = entries(u32(4)).find((e) => e.tag === 0x8825);
  if (!gpsPointer) return null;
  const gps = entries(u32(gpsPointer.value));
  const ascii = (tag: number) => {
    const e = gps.find((x) => x.tag === tag);
    return e ? tiff.toString("latin1", e.value, e.value + 1) : undefined;
  };
  const degrees = (tag: number) => {
    const e = gps.find((x) => x.tag === tag && x.type === 5 && x.count === 3);
    if (!e) return undefined;
    const base = u32(e.value);
    const part = (i: number) => {
      const denominator = u32(base + i * 8 + 4);
      return denominator === 0 ? 0 : u32(base + i * 8) / denominator;
    };
    return part(0) + part(1) / 60 + part(2) / 3600;
  };
  const lat = degrees(2),
    lon = degrees(4);
  if (lat === undefined || lon === undefined || lat > 90 || lon > 180) return null;
  return { lat: ascii(1) === "S" ? -lat : lat, lon: ascii(3) === "W" ? -lon : lon };
}

export function countryAt(lat: number, lon: number): CountryCode | null {
  const area = ([s, w, n, e]: number[]) => (n! - s!) * (e! - w!);
  const match = (Object.entries(countryBoxes) as [CountryCode, number[]][])
    .sort((a, b) => area(a[1]) - area(b[1]))
    .find(([, [s, w, n, e]]) => lat >= s! && lat <= n! && lon >= w! && lon <= e!);
  return match ? match[0] : null;
}

/** The provable place (such as Bali) at a position, if any. Coarse boxes, like countries. */
export function placeAt(lat: number, lon: number): PlaceId | null {
  const match = (Object.entries(places) as [PlaceId, (typeof places)[PlaceId]][]).find(([, p]) =>
    p.boxes.some(([s, w, n, e]) => lat >= s! && lat <= n! && lon >= w! && lon <= e!),
  );
  return match ? match[0] : null;
}

/**
 * When a photo was taken, as the camera's local time "YYYY-MM-DDTHH:MM", from an EXIF block (as
 * an image library hands it, starting "Exif\0\0", or the bare TIFF). Cameras write the time at
 * the place without a zone, which is what a rundown at the venue is written in. Null when absent.
 */
export function exifTakenAt(exif: Buffer): string | null {
  const tiff = exif.toString("latin1", 0, 6) === "Exif\0\0" ? exif.subarray(6) : exif;
  try {
    const little = tiff.toString("latin1", 0, 2) === "II";
    const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
    const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
    const find = (ifd: number, tag: number) => {
      const count = u16(ifd);
      if (count > 200) return undefined;
      for (let i = 0; i < count; i++) {
        const at = ifd + 2 + i * 12;
        if (u16(at) === tag) return { type: u16(at + 2), count: u32(at + 4), value: at + 8 };
      }
      return undefined;
    };
    const pointer = find(u32(4), 0x8769);
    if (!pointer) return null;
    // DateTimeOriginal, an ASCII "YYYY:MM:DD HH:MM:SS" with its terminator: 20 bytes.
    const original = find(u32(pointer.value), 0x9003);
    if (!original || original.type !== 2 || original.count !== 20) return null;
    const text = tiff.toString("latin1", u32(original.value), u32(original.value) + 19);
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):\d{2}$/.exec(text);
    if (!m || Number(m[4]) > 23 || Number(m[5]) > 59) return null;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  } catch {
    return null;
  }
}
