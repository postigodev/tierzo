export type FileIntakeFormat = "txt" | "csv" | "xlsx";

export type FileIntakeResponse = {
  schema_version: "tierzo.file-intake.v1";
  filename: string;
  format: FileIntakeFormat;
  items: string[];
  item_count: number;
  interpretation: string;
};

export type ImportRequest = {
  token: number;
  signal: AbortSignal;
};

const FORMATS = new Set<FileIntakeFormat>(["txt", "csv", "xlsx"]);

export class LatestImportCoordinator {
  private controller: AbortController | null = null;
  private token = 0;

  start(): ImportRequest {
    this.controller?.abort();
    this.token += 1;
    this.controller = new AbortController();
    return { token: this.token, signal: this.controller.signal };
  }

  isCurrent(token: number): boolean {
    return (
      token === this.token &&
      this.controller !== null &&
      !this.controller.signal.aborted
    );
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.token += 1;
  }
}

export function parseFileIntakeResponse(value: unknown): FileIntakeResponse {
  if (
    !isRecord(value) ||
    value.schema_version !== "tierzo.file-intake.v1" ||
    typeof value.filename !== "string" ||
    !value.filename.trim() ||
    typeof value.format !== "string" ||
    !FORMATS.has(value.format as FileIntakeFormat) ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    !value.items.every(
      (item) => typeof item === "string" && item.trim() === item && Boolean(item),
    ) ||
    typeof value.item_count !== "number" ||
    !Number.isInteger(value.item_count) ||
    value.item_count !== value.items.length ||
    typeof value.interpretation !== "string" ||
    !value.interpretation.trim()
  ) {
    throw new Error("Tierzo received an invalid file intake response.");
  }
  return value as FileIntakeResponse;
}

export function parseFileIntakeError(
  value: unknown,
  fallback: string,
): string {
  if (!isRecord(value)) {
    return fallback;
  }
  if (typeof value.detail === "string" && value.detail.trim()) {
    return value.detail;
  }
  if (
    isRecord(value.detail) &&
    typeof value.detail.message === "string" &&
    value.detail.message.trim()
  ) {
    return value.detail.message;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
