//! Document parser — extracts text and structure from PDF, DOCX, HTML files.

use crate::indexer::{ParsedPage, Heading};
use anyhow::{Result, bail};

/// Parse a document file and return structured pages.
pub fn parse_document(file_path: &str) -> Result<Vec<ParsedPage>> {
    let ext = std::path::Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match ext.to_lowercase().as_str() {
        "pdf" => parse_pdf(file_path),
        "txt" | "md" => parse_text(file_path),
        _ => bail!("Unsupported file format: .{}", ext),
    }
}

/// Parse a PDF file using lopdf.
fn parse_pdf(file_path: &str) -> Result<Vec<ParsedPage>> {
    let doc = lopdf::Document::load(file_path)?;
    let mut pages = Vec::new();

    for (i, _page_id) in doc.page_iter().enumerate() {
        // TODO: Extract text from PDF page using lopdf or pdf-extract
        // For now, create a placeholder
        pages.push(ParsedPage {
            page_number: i + 1,
            text: String::new(), // TODO: actual text extraction
            headings: Vec::new(),
        });
    }

    Ok(pages)
}

/// Parse a plain text / markdown file.
fn parse_text(file_path: &str) -> Result<Vec<ParsedPage>> {
    let content = std::fs::read_to_string(file_path)?;
    let mut headings = Vec::new();

    // Extract markdown headings
    for line in content.lines() {
        if line.starts_with("# ") {
            headings.push(Heading { text: line[2..].to_string(), level: 1, page: 1 });
        } else if line.starts_with("## ") {
            headings.push(Heading { text: line[3..].to_string(), level: 2, page: 1 });
        } else if line.starts_with("### ") {
            headings.push(Heading { text: line[4..].to_string(), level: 3, page: 1 });
        }
    }

    Ok(vec![ParsedPage {
        page_number: 1,
        text: content,
        headings,
    }])
}
