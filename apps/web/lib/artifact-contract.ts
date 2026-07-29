export function isNullableAbsoluteHttpUrl(
  value: unknown,
): value is string | null {
  if (value === null) {
    return true;
  }
  if (
    typeof value !== "string" ||
    !/^https?:\/\//i.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export function sanitizeSourceUrl(value: string | null): string | null {
  return isNullableAbsoluteHttpUrl(value) ? value : null;
}
