import { posix } from 'node:path';
import type { IStore } from '@mrtdown/fs';
import * as fflate from 'fflate';

function normalizeZipPath(path: string): string {
  return posix.normalize(path.replaceAll('\\', '/'));
}

function normalizeArchivePath(path: string): string {
  const normalized = normalizeZipPath(path).replace(/^\/+/, '');
  if (normalized === '.') {
    return '';
  }
  return normalized.replace(/\/+$/, '');
}

const ZIP_DATA_ROOT = 'data';
const textDecoder = new TextDecoder();
// Workers are memory-constrained, so keep only a small window of inflated files.
const MAX_INFLATED_CACHE_BYTES = 8 * 1024 * 1024;

function toArchivePath(path: string): string {
  const normalized = normalizeArchivePath(path);
  if (normalized === '') {
    return ZIP_DATA_ROOT;
  }
  return `${ZIP_DATA_ROOT}/${normalized}`;
}

type ZipEntry = {
  name: string;
  isDirectory: boolean;
  size?: number;
  originalSize?: number;
  compression: number;
};

/**
 * Manages a zip archive using {@link https://github.com/101arrowz/fflate fflate}.
 */
class ZipManager {
  private readonly zipData: Buffer<ArrayBufferLike>;
  private entryIndex: Map<string, ZipEntry> | null = null;
  private readonly directoryIndex = new Map<string, Set<string>>();
  private readonly fileDataCache = new Map<string, Uint8Array>();
  private cachedInflatedBytes = 0;

  constructor(zipData: Buffer<ArrayBufferLike>) {
    this.zipData = zipData;
  }

  private ensureIndexed(): Map<string, ZipEntry> {
    if (this.entryIndex != null) {
      return this.entryIndex;
    }

    const entries = new Map<string, ZipEntry>();
    this.entryIndex = entries;
    fflate.unzipSync(this.zipData, {
      filter: (file) => {
        const name = normalizeArchivePath(file.name);
        if (name === '') {
          return false;
        }

        const isDirectory = file.name.endsWith('/');

        entries.set(name, {
          name,
          isDirectory,
          size: file.size,
          originalSize: file.originalSize,
          compression: file.compression,
        });
        this.indexAncestors(entries, name, isDirectory);
        return false;
      },
    });

    return entries;
  }

  private indexAncestors(
    entries: Map<string, ZipEntry>,
    path: string,
    isDirectory: boolean,
  ): void {
    const segments = path.split('/');
    let current = '';

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const parent = current;

      let children = this.directoryIndex.get(parent);
      if (children == null) {
        children = new Set<string>();
        this.directoryIndex.set(parent, children);
      }
      children.add(segment);

      current = current === '' ? segment : `${current}/${segment}`;

      if (i < segments.length - 1) {
        const existing = entries.get(current);
        if (existing == null) {
          entries.set(current, {
            name: current,
            isDirectory: true,
            compression: 0,
          });
        } else if (!existing.isDirectory) {
          existing.isDirectory = true;
        }
      }
    }

    const entry = entries.get(path);
    if ((isDirectory || entry?.isDirectory) && !this.directoryIndex.has(path)) {
      this.directoryIndex.set(path, new Set<string>());
    }
  }

  /**
   * Gets the data for an entry in the zip archive.
   * @param path - The path to the entry.
   * @returns The data for the entry, or null if the entry does not exist.
   */
  readEntry(path: string): Uint8Array | null {
    const normalizedPath = normalizeArchivePath(path);
    const cached = this.fileDataCache.get(normalizedPath);
    if (cached != null) {
      // Refresh insertion order so eviction behaves like a simple LRU.
      this.fileDataCache.delete(normalizedPath);
      this.fileDataCache.set(normalizedPath, cached);
      return cached;
    }

    const entry = this.getEntry(normalizedPath);
    if (entry == null || entry.isDirectory) {
      return null;
    }

    const result = fflate.unzipSync(this.zipData, {
      filter: (file) => normalizeArchivePath(file.name) === normalizedPath,
    });
    const data = result[normalizedPath] ?? null;

    if (data == null) {
      return null;
    }
    this.addToCache(normalizedPath, data);
    return data;
  }

  clearCache(): void {
    this.fileDataCache.clear();
    this.cachedInflatedBytes = 0;
  }

  private addToCache(path: string, data: Uint8Array): void {
    if (data.byteLength > MAX_INFLATED_CACHE_BYTES) {
      // Oversized entries are returned to the caller but never retained.
      this.clearCache();
      return;
    }

    const existing = this.fileDataCache.get(path);
    if (existing != null) {
      this.cachedInflatedBytes -= existing.byteLength;
      this.fileDataCache.delete(path);
    }

    this.fileDataCache.set(path, data);
    this.cachedInflatedBytes += data.byteLength;

    while (this.cachedInflatedBytes > MAX_INFLATED_CACHE_BYTES) {
      // Drop the oldest inflated entries first to cap peak memory.
      const oldest = this.fileDataCache.entries().next().value;
      if (oldest == null) {
        break;
      }

      const [oldestPath, oldestData] = oldest;
      this.fileDataCache.delete(oldestPath);
      this.cachedInflatedBytes -= oldestData.byteLength;
    }
  }

  getEntry(path: string): ZipEntry | null {
    return this.ensureIndexed().get(normalizeArchivePath(path)) ?? null;
  }

  hasPath(path: string): boolean {
    return this.getEntry(path) != null;
  }

  /**
   * Lists all entries in the zip archive.
   * @returns A list of entries.
   */
  listEntries(path = ''): ZipEntry[] {
    const normalizedPath = normalizeArchivePath(path);
    const prefix = normalizedPath === '' ? '' : `${normalizedPath}/`;

    return [...this.ensureIndexed().values()].filter((entry) => {
      if (normalizedPath === '') {
        return true;
      }
      return entry.name === normalizedPath || entry.name.startsWith(prefix);
    });
  }

  listDirectory(path: string): string[] {
    this.ensureIndexed();
    return Array.from(
      this.directoryIndex.get(normalizeArchivePath(path)) ?? [],
    ).sort();
  }
}

/**
 * Reads repository data directly from a ZIP archive.
 */
export class ZipStore implements IStore {
  private readonly zipManager: ZipManager;

  constructor(zipData: Buffer<ArrayBufferLike>) {
    this.zipManager = new ZipManager(zipData);
  }

  readText(path: string): string {
    const entry = this.zipManager.readEntry(toArchivePath(path));
    if (entry == null) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return entry.length > 0 ? textDecoder.decode(entry) : '';
  }

  readJson<T>(path: string): T {
    return JSON.parse(this.readText(path)) as T;
  }

  listDir(path: string): string[] {
    return this.zipManager.listDirectory(toArchivePath(path));
  }

  exists(path: string): boolean {
    return this.zipManager.hasPath(toArchivePath(path));
  }

  clearCache(): void {
    this.zipManager.clearCache();
  }
}
