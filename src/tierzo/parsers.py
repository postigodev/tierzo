from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Iterable

from openpyxl import load_workbook


SUPPORTED_INPUTS = {".csv", ".txt", ".xlsx"}


def normalize_text(value: object) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line).strip()


def parse_text_lines(raw_text: str) -> list[str]:
    return [line for line in (normalize_text(line) for line in raw_text.splitlines()) if line]


def parse_txt_file(path: Path) -> list[str]:
    return parse_text_lines(path.read_text(encoding="utf-8-sig"))


def parse_csv_file(path: Path) -> list[str]:
    values: list[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.reader(file)
        for row in reader:
            if not row:
                continue
            text = normalize_text(row[0])
            if text:
                values.append(text)
    return values


def parse_xlsx_file(path: Path) -> list[str]:
    workbook = load_workbook(path, data_only=True)
    sheet = workbook.worksheets[0]

    values: list[str] = []
    for row in sheet.iter_rows(min_col=1, max_col=1, values_only=True):
        text = normalize_text(row[0])
        if text:
            values.append(text)
    return values


def parse_input_file(path: Path) -> list[str]:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return parse_txt_file(path)
    if suffix == ".csv":
        return parse_csv_file(path)
    if suffix == ".xlsx":
        return parse_xlsx_file(path)

    supported = ", ".join(sorted(SUPPORTED_INPUTS))
    raise ValueError(f"Unsupported input file type '{suffix}'. Supported types: {supported}")


def iter_non_empty(values: Iterable[str]) -> list[str]:
    return [value for value in (normalize_text(value) for value in values) if value]
