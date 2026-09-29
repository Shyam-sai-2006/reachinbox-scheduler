import { describe, it, expect } from "vitest";
import { encryptText, decryptText } from "../../apps/api/src/utils/crypto.js";

describe("Unit Tests: AES-256-GCM Encryption", () => {
  it("encrypts and successfully decrypts sensitive strings", () => {
    const secret = "https://hooks.slack.com/services/T000/B000/XXXX";
    const encrypted = encryptText(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted.split(":")).toHaveLength(3); // iv:tag:data

    const decrypted = decryptText(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("generates unique ciphertexts for identical inputs due to random IV", () => {
    const text = "my-smtp-password";
    const enc1 = encryptText(text);
    const enc2 = encryptText(text);

    expect(enc1).not.toBe(enc2);
    expect(decryptText(enc1)).toBe(text);
    expect(decryptText(enc2)).toBe(text);
  });

  it("fails decryption cleanly if authentication tag or ciphertext is tampered", () => {
    const text = "secret-token";
    const encrypted = encryptText(text);
    const [iv, tag, data] = encrypted.split(":");

    // Tamper with tag
    const tamperedTag = tag.substring(0, tag.length - 2) + "00";
    const tampered = `${iv}:${tamperedTag}:${data}`;

    expect(() => decryptText(tampered)).toThrow();
  });
});
