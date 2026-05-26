"""
Handles downloading files from Supabase Storage and
extracting text content from them for AI processing.

Currently supports:
  - PDF files (via pypdf)
  - Text files

Image files (screenshots, portfolio images) cannot have
text extracted — they are noted but skipped for now.
OCR support can be added later if needed.
"""
import io
import logging
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)


def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    """
    Extracts all text from a PDF file given its raw bytes.
    Uses pypdf which handles most standard PDF formats.

    Returns empty string if the PDF has no extractable text
    (e.g. a scanned image PDF with no OCR layer).
    """
    try:
        from pypdf import PdfReader  # import here to isolate the dependency
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                pages_text.append(page_text.strip())
        return "\n\n".join(pages_text)
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        return ""


def download_and_extract_text(file_url: str, file_type: str) -> str | None:
    """
    Downloads a file from Supabase Storage and extracts its text.

    Args:
        file_url:  The storage path (e.g. "user-id/resume/file.pdf")
        file_type: The document type from our VALID_FILE_TYPES set

    Returns:
        Extracted text string, or None if extraction is not possible
        for this file type (e.g. images).
    """
    # Images cannot have text extracted without OCR
    image_types = {"screenshot", "portfolio_image"}
    if file_type in image_types:
        logger.info(f"Skipping text extraction for image type: {file_type}")
        return None

    logger.info(f"Downloading file from Storage: {file_url}")

    try:
        # The service role key gives full storage access
        file_bytes = supabase.storage.from_("documents").download(file_url)
    except Exception as e:
        logger.error(f"Failed to download file '{file_url}': {e}")
        raise ValueError(f"Could not download the file. Please try again.")

    if not file_bytes:
        raise ValueError("Downloaded file is empty.")

    # Determine file format from path extension
    lower_url = file_url.lower()

    if lower_url.endswith(".pdf"):
        text = extract_text_from_pdf_bytes(file_bytes)
        if not text.strip():
            # Common with scanned PDFs
            logger.warning(f"No text extracted from PDF: {file_url}")
            return "[PDF appears to be a scanned image — no text layer found]"
        return text

    # Plain text files
    if lower_url.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore")

    # Unknown format — return a placeholder
    logger.warning(f"Unknown file format for text extraction: {file_url}")
    return None


def extract_and_store_text(document_id: str, file_url: str, file_type: str) -> str | None:
    """
    Extracts text from a document and saves it to documents.extracted_text.

    This is the main function called by the extraction pipeline.
    After calling this, the document's extracted_text column is populated
    and all subsequent AI calls can read from the database instead of
    re-downloading the file.

    Returns the extracted text, or None for image files.
    """
    text = download_and_extract_text(file_url, file_type)

    if text is not None:
        supabase.table("documents").update(
            {"extracted_text": text}
        ).eq("id", document_id).execute()

        logger.info(
            f"Extracted {len(text)} characters from document {document_id}"
        )

    return text