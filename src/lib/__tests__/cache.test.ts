import { describe, it, expect, afterEach } from "vitest";
import { readCache, writeCache } from "@/lib/cache";
import fs from "fs/promises";
import path from "path";

const TEST_CACHE_PATH = path.resolve(process.cwd(), "data/test_cache.json");

describe("cache", () => {
  afterEach(async () => {
    try {
      await fs.unlink(TEST_CACHE_PATH);
    } catch {}
  });

  it("returns null when cache file does not exist", async () => {
    const result = await readCache<{ foo: string }>("test_nonexistent.json");
    expect(result).toBeNull();
  });

  it("writes and reads cache correctly", async () => {
    const data = { foo: "bar", count: 42 };
    await writeCache("test_cache.json", data);
    const result = await readCache<typeof data>("test_cache.json");
    expect(result).toEqual(data);
  });
});
