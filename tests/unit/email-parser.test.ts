import { describe, it, expect } from "vitest";
import {
  parseEmailsFromText,
  isValidEmail,
  normalizeEmail,
} from "@reachinbox/shared";

describe("Unit Tests: Email Parser & Validator", () => {
  it("correctly validates well-formed emails", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
    expect(isValidEmail("user.name+tag@sub.domain.co.uk")).toBe(true);
    expect(isValidEmail("jane_doe-123@reachinbox.ai")).toBe(true);
  });

  it("rejects malformed email strings", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@nodomain.com")).toBe(false);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
    expect(isValidEmail("spaces in@email.com")).toBe(false);
    expect(isValidEmail("a".repeat(250) + "@example.com")).toBe(false); // exceeds RFC limit
  });

  it("normalizes emails to lowercase and trims whitespace", () => {
    expect(normalizeEmail("  Alice@Example.COM  ")).toBe("alice@example.com");
  });

  it("handles empty input safely", () => {
    const res = parseEmailsFromText("");
    expect(res.validEmails).toEqual([]);
    expect(res.totalDetected).toBe(0);
    expect(res.duplicateCount).toBe(0);
    expect(res.invalidCount).toBe(0);
  });

  it("parses standard CSV with headers and quoted fields", () => {
    const csv = `name,email,role
"John Doe","john.doe@example.com","Admin"
"Jane Smith","jane.smith@example.com","User"
"Bob","bob@reachinbox.ai","Manager"`;

    const res = parseEmailsFromText(csv);
    expect(res.validEmails).toHaveLength(3);
    expect(res.validEmails).toContain("john.doe@example.com");
    expect(res.validEmails).toContain("jane.smith@example.com");
    expect(res.validEmails).toContain("bob@reachinbox.ai");
    expect(res.duplicateCount).toBe(0);
  });

  it("deduplicates emails case-insensitively", () => {
    const raw = `test@example.com
TEST@EXAMPLE.COM
Test@Example.Com
other@example.com`;

    const res = parseEmailsFromText(raw);
    expect(res.validEmails).toEqual(["test@example.com", "other@example.com"]);
    expect(res.duplicateCount).toBe(2);
    expect(res.totalDetected).toBe(4);
  });

  it("detects invalid format items without failing the valid ones", () => {
    const raw = `valid1@example.com
not-an-email@
valid2@example.com
broken@@domain..com`;

    const res = parseEmailsFromText(raw);
    expect(res.validEmails).toEqual([
      "valid1@example.com",
      "valid2@example.com",
    ]);
    expect(res.invalidCount).toBeGreaterThanOrEqual(1);
    expect(res.invalidItems.length).toBeGreaterThanOrEqual(1);
  });
});
