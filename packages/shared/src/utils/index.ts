const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface EmailParseResult {
  validEmails: string[];
  totalDetected: number;
  duplicateCount: number;
  invalidCount: number;
  invalidItems: string[];
}

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses raw text or CSV content and extracts unique, valid email addresses.
 * Fully supports real emails with subdomains, plus-addresses, angle-brackets (e.g. John <john@mail.com>),
 * commas, newlines, tabs, and space separators.
 */
export function parseEmailsFromText(rawContent: string): EmailParseResult {
  if (!rawContent || !rawContent.trim()) {
    return {
      validEmails: [],
      totalDetected: 0,
      duplicateCount: 0,
      invalidCount: 0,
      invalidItems: [],
    };
  }

  // Split by line breaks, commas, semicolons, tabs, and spaces
  const lines = rawContent.split(/\r?\n/);
  const candidateTokens: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // First check if there are angle bracket emails: "John <email@domain.com>"
    const angleMatches = trimmedLine.match(/<([^>]+)>/g);
    if (angleMatches && angleMatches.length > 0) {
      for (const m of angleMatches) {
        const emailInside = m.replace(/[<>]/g, "").trim();
        if (emailInside) {
          candidateTokens.push(emailInside);
        }
      }
      // Also continue to process other items in the line if any
    }

    // Split line by commas, semicolons, tabs, or spaces
    const parts = trimmedLine
      .split(/[,;\t\s]+/)
      .map((c) => c.replace(/^[<"'(]+|[>"'),.:]+$/g, "").trim());
    for (const part of parts) {
      if (part && !part.startsWith("<") && !part.endsWith(">")) {
        candidateTokens.push(part);
      }
    }
  }

  const seen = new Set<string>();
  const validEmails: string[] = [];
  const invalidItems: string[] = [];
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const token of candidateTokens) {
    const cleaned = token.replace(/^[<"'(]+|[>"'),.:]+$/g, "").trim();
    if (!cleaned) continue;

    const lower = cleaned.toLowerCase();
    // Ignore header words commonly present in CSVs or paste headers
    if (
      lower === "email" ||
      lower === "e-mail" ||
      lower === "emails" ||
      lower === "recipient" ||
      lower === "recipients" ||
      lower === "to" ||
      lower === "name"
    ) {
      continue;
    }

    if (isValidEmail(cleaned)) {
      const normalized = normalizeEmail(cleaned);
      if (seen.has(normalized)) {
        duplicateCount++;
      } else {
        seen.add(normalized);
        validEmails.push(normalized);
      }
    } else {
      // If it looks like an attempted email address
      if (cleaned.includes("@") || cleaned.includes(".")) {
        invalidCount++;
        invalidItems.push(cleaned);
      }
    }
  }

  return {
    validEmails,
    totalDetected: validEmails.length + duplicateCount,
    duplicateCount,
    invalidCount,
    invalidItems,
  };
}

/**
 * Calculates scheduledAt for each email in sequence given a startTime and delayMs
 */
export function calculateScheduleTimes(
  startTime: Date | string,
  count: number,
  delayMs: number,
): Date[] {
  const baseTime =
    typeof startTime === "string"
      ? new Date(startTime).getTime()
      : startTime.getTime();
  const times: Date[] = [];
  for (let i = 0; i < count; i++) {
    times.push(new Date(baseTime + i * delayMs));
  }
  return times;
}

/**
 * Deterministic sender assignment (round robin)
 */
export function assignSendersRoundRobin(
  emailCount: number,
  senderIds: string[],
): string[] {
  if (!senderIds || senderIds.length === 0) {
    throw new Error(
      "At least one sender is required for round-robin assignment",
    );
  }
  const assignments: string[] = [];
  for (let i = 0; i < emailCount; i++) {
    assignments.push(senderIds[i % senderIds.length]);
  }
  return assignments;
}
