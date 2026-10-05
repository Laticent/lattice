//! Lattice Studio desktop: the Studio from the docs site in a native window.
//!
//! This crate is deliberately thin. The Studio is the same static build the website
//! ships (`docs/dist`), so everything inside the window is the Studio's own UI. Rust
//! owns only the jobs a web page cannot do, one command per seam. The JavaScript
//! half of every seam lives in `docs/src/lib/platform.js`; keep the two in step.
//! Why the split is drawn here: engineering/decisions/2026-09-24-lattice-studio-desktop.md.

use std::path::PathBuf;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_dialog::DialogExt;

/// The header `platform.js` puts the suggested file name in. A raw IPC body carries
/// only bytes, so the name rides alongside, URI-encoded (a header value is ASCII).
const FILENAME_HEADER: &str = "x-lattice-filename";

/// Save bytes the Studio produced (a PDF, a PPTX, a deck's Markdown, a backup zip)
/// to a file the user picks in the OS save dialog.
///
/// Returns `true` when the file was written and `false` when the user dismissed the
/// dialog. The body is the RAW bytes, not JSON: a 20MB PDF encoded as a JSON number
/// array is roughly 70MB of text to build, send and parse.
///
/// `async` so Tauri runs it off the main thread. The dialog call below blocks until
/// the user answers, and blocking the main thread would freeze the event loop that
/// has to draw that very dialog.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, request: Request<'_>) -> Result<bool, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("save_file expects a raw byte body".into());
    };
    let name = request
        .headers()
        .get(FILENAME_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode_str(v).decode_utf8_lossy().into_owned())
        .unwrap_or_else(|| "untitled".into());

    let mut dialog = app.dialog().file().set_file_name(safe_file_name(&name));
    if let Some(ext) = extension_of(&name) {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext.as_str()]);
    }
    let Some(picked) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let path: PathBuf = picked.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("could not write {}: {e}", path.display()))?;
    Ok(true)
}

/// The dialog's suggested name, reduced to a bare file name that every OS accepts. The
/// Studio builds names from deck titles and upload names, and either can hold a `/` (the
/// dialog would read it as a folder) or a character Windows refuses in a name
/// (`<>:"|?*`, control characters, a trailing dot or space). Cleaned on every platform,
/// so a file saved on Linux keeps a name that opens on Windows.
fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || matches!(c, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*') { '-' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches(['.', ' ']);
    if trimmed.is_empty() { "untitled".into() } else { trimmed.into() }
}

fn extension_of(name: &str) -> Option<String> {
    let (_, ext) = name.rsplit_once('.')?;
    (!ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric())).then(|| ext.to_ascii_lowercase())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file])
        .run(tauri::generate_context!())
        .expect("Lattice Studio failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_slash_in_a_deck_title_cannot_become_a_folder() {
        assert_eq!(safe_file_name("Q3 / Q4 review.pdf"), "Q3 - Q4 review.pdf");
        assert_eq!(safe_file_name("  "), "untitled");
    }

    #[test]
    fn a_name_windows_refuses_is_cleaned_on_every_platform() {
        assert_eq!(safe_file_name("Q3: plan?.pdf"), "Q3- plan-.pdf");
        assert_eq!(safe_file_name("a<b>c\"d|e*f.md"), "a-b-c-d-e-f.md");
        assert_eq!(safe_file_name("notes.txt. "), "notes.txt");
        assert_eq!(safe_file_name("tab\there.pdf"), "tab-here.pdf");
        assert_eq!(safe_file_name("..."), "untitled");
    }

    #[test]
    fn the_filter_comes_from_a_plain_extension_only() {
        assert_eq!(extension_of("deck.PDF").as_deref(), Some("pdf"));
        assert_eq!(extension_of("lattice-assets.zip").as_deref(), Some("zip"));
        assert_eq!(extension_of("no-extension"), None);
        assert_eq!(extension_of("weird.tar gz"), None);
    }
}
