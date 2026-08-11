from __future__ import annotations

import csv
import os
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import UploadFile
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import BaseModel

from tierzo.parsers import InputLimitError, parse_input_file


MAX_INTAKE_FILE_BYTES = int(os.getenv("MAX_INTAKE_FILE_BYTES", str(5 * 1024 * 1024)))
MAX_XLSX_ARCHIVE_MEMBERS = int(os.getenv("MAX_XLSX_ARCHIVE_MEMBERS", "1000"))
MAX_XLSX_UNCOMPRESSED_BYTES = int(
    os.getenv("MAX_XLSX_UNCOMPRESSED_BYTES", str(25 * 1024 * 1024))
)
READ_CHUNK_BYTES = 64 * 1024

FileFormat = Literal["txt", "csv", "xlsx"]

INTERPRETATIONS: dict[FileFormat, str] = {
    "txt": "Imported non-empty lines; the first value was preserved.",
    "csv": (
        "Imported the first column; internal whitespace was collapsed and "
        "the first value was preserved."
    ),
    "xlsx": (
        "Imported the first worksheet's first column; internal whitespace was "
        "collapsed and the first value was preserved."
    ),
}


class FileIntakeResponse(BaseModel):
    schema_version: Literal["tierzo.file-intake.v1"] = "tierzo.file-intake.v1"
    filename: str
    format: FileFormat
    items: list[str]
    item_count: int
    interpretation: str


class FileIntakeErrorDetail(BaseModel):
    code: str
    message: str
    limit: int | None = None
    item_index: int | None = None


class FileIntakeException(Exception):
    def __init__(self, status_code: int, detail: FileIntakeErrorDetail) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail.message)


def intake_error(
    status_code: int,
    code: str,
    message: str,
    *,
    limit: int | None = None,
    item_index: int | None = None,
) -> FileIntakeException:
    return FileIntakeException(
        status_code,
        FileIntakeErrorDetail(
            code=code,
            message=message,
            limit=limit,
            item_index=item_index,
        ),
    )


def sanitize_filename(filename: str | None) -> str:
    candidate = (filename or "").replace("\x00", "").strip()
    return Path(candidate).name if candidate else "upload"


def resolve_format(filename: str) -> tuple[str, FileFormat]:
    suffix = Path(filename).suffix.lower()
    formats: dict[str, FileFormat] = {
        ".txt": "txt",
        ".csv": "csv",
        ".xlsx": "xlsx",
    }
    file_format = formats.get(suffix)
    if file_format is None:
        raise intake_error(
            415,
            "unsupported_file_type",
            "Unsupported file type; choose a .txt, .csv, or .xlsx file.",
        )
    return suffix, file_format


async def read_bounded(upload: UploadFile, limit: int) -> bytes:
    content = bytearray()
    while True:
        chunk = await upload.read(min(READ_CHUNK_BYTES, limit + 1 - len(content)))
        if not chunk:
            return bytes(content)
        content.extend(chunk)
        if len(content) > limit:
            raise intake_error(
                413,
                "file_too_large",
                f"File is too large; maximum is {limit} bytes.",
                limit=limit,
            )


def validate_xlsx_archive(content: bytes) -> None:
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            members = archive.infolist()
            if len(members) > MAX_XLSX_ARCHIVE_MEMBERS:
                raise intake_error(
                    422,
                    "unsafe_xlsx_archive",
                    "XLSX archive contains too many entries.",
                    limit=MAX_XLSX_ARCHIVE_MEMBERS,
                )
            if any(member.flag_bits & 0x1 for member in members):
                raise intake_error(
                    422,
                    "unsafe_xlsx_archive",
                    "Encrypted XLSX archive entries are not supported.",
                )
            uncompressed_size = sum(member.file_size for member in members)
            if uncompressed_size > MAX_XLSX_UNCOMPRESSED_BYTES:
                raise intake_error(
                    422,
                    "unsafe_xlsx_archive",
                    "XLSX archive expands beyond the safe limit.",
                    limit=MAX_XLSX_UNCOMPRESSED_BYTES,
                )
    except zipfile.BadZipFile as error:
        raise intake_error(
            422,
            "malformed_file",
            "The XLSX file is not a valid workbook archive.",
        ) from error


def map_parser_error(error: Exception) -> FileIntakeException:
    if isinstance(error, InputLimitError):
        if error.kind == "too_many_items":
            return intake_error(
                413,
                "too_many_items",
                f"File contains too many items; maximum is {error.limit}.",
                limit=error.limit,
            )
        return intake_error(
            422,
            "item_too_long",
            f"Item {error.item_index} is too long; maximum is {error.limit} characters.",
            limit=error.limit,
            item_index=error.item_index,
        )
    if isinstance(error, UnicodeError):
        return intake_error(
            422,
            "invalid_text_encoding",
            "Text files must use UTF-8 encoding.",
        )
    return intake_error(
        422,
        "malformed_file",
        "The file could not be parsed with the selected format.",
    )


async def parse_uploaded_file(
    upload: UploadFile,
    *,
    max_items: int,
    max_item_length: int,
) -> FileIntakeResponse:
    temporary_path: Path | None = None
    try:
        filename = sanitize_filename(upload.filename)
        suffix, file_format = resolve_format(filename)
        content = await read_bounded(upload, MAX_INTAKE_FILE_BYTES)
        if file_format == "xlsx":
            validate_xlsx_archive(content)

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary_file:
            temporary_file.write(content)
            temporary_path = Path(temporary_file.name)

        try:
            items = parse_input_file(
                temporary_path,
                max_items=max_items,
                max_item_length=max_item_length,
            )
        except (
            InputLimitError,
            UnicodeError,
            csv.Error,
            InvalidFileException,
            KeyError,
            IndexError,
            OSError,
            ValueError,
        ) as error:
            raise map_parser_error(error) from error

        if not items:
            raise intake_error(
                422,
                "empty_intake",
                "The file did not contain any importable items.",
            )

        return FileIntakeResponse(
            filename=filename,
            format=file_format,
            items=items,
            item_count=len(items),
            interpretation=INTERPRETATIONS[file_format],
        )
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        await upload.close()
