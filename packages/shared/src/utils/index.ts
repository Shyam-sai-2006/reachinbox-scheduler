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

  // Split by line breaks and commas/semicolons
  const lines = rawContent.split(/\r?\n/);
  const candidateTokens: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Handle CSV quoting / comma separation
    const cells = trimmedLine
      .split(/[,;\t]/)
      .map((c) => c.replace(/^["']|["']$/g, "").trim());
    for (const cell of cells) {
      if (cell) {
        candidateTokens.push(cell);
      }
    }
  }

  const seen = new Set<string>();
  const validEmails: string[] = [];
  const invalidItems: string[] = [];
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const token of candidateTokens) {
    // If the token matches header words like 'email', 'e-mail', 'mail', 'name', ignore
    const lower = token.toLowerCase();
    if (
      lower === "email" ||
      lower === "e-mail" ||
      lower === "emails" ||
      lower === "recipient"
    ) {
      continue;
    }

    if (isValidEmail(token)) {
      const normalized = normalizeEmail(token);
      if (seen.has(normalized)) {
        duplicateCount++;
      } else {
        seen.add(normalized);
        validEmails.push(normalized);
      }
    } else {
      // If it looks like someone typed an email-like attempt or invalid string
      if (token.includes("@") || token.includes(".")) {
        invalidCount++;
        invalidItems.push(token);
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
