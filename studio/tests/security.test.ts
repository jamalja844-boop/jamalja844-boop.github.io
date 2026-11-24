import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashPassword, signPath, verifyPassword, verifySignedPath } from "@/lib/server/crypto";
import { assertPublicUrl } from "@/lib/server/safeFetch";

describe("secrets at rest", () => {
  it("round-trips AES-256-GCM and uses a fresh IV", () => {
    const a = encrypt("sk-test-123");
    expect(a).not.toContain("sk-test");
    expect(decrypt(a)).toBe("sk-test-123");
    expect(encrypt("sk-test-123")).not.toBe(a);
  });
  it("rejects tampered ciphertext", () => {
    const parts = encrypt("hello").split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
});

describe("passwords and signed URLs", () => {
  it("verifies scrypt hashes", () => {
    const h = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
  it("accepts valid and rejects expired/forged signatures", () => {
    const exp = Date.now() + 60_000;
    expect(verifySignedPath("med_1", String(exp), signPath("med_1", exp))).toBe(true);
    expect(verifySignedPath("med_2", String(exp), signPath("med_1", exp))).toBe(false);
    const past = Date.now() - 1;
    expect(verifySignedPath("med_1", String(past), signPath("med_1", past))).toBe(false);
  });
});

describe("SSRF protection", () => {
  for (const u of ["http://localhost/x", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "file:///etc/passwd", "ftp://example.com", "http://user:pw@8.8.8.8/"]) {
    it(`blocks ${u}`, async () => {
      await expect(assertPublicUrl(u)).rejects.toThrow();
    });
  }
  it("allows public IPs", async () => {
    await expect(assertPublicUrl("https://8.8.8.8/")).resolves.toBeInstanceOf(URL);
  });
});
