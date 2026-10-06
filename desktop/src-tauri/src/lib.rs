//! Lattice Studio desktop: the Studio from the docs site in a native window.
//!
//! This crate is deliberately thin. The Studio is the same static build the website
//! ships (`docs/dist`), so everything inside the window is the Studio's own UI. Rust
//! owns only the jobs a web page cannot do, one command per seam. The JavaScript
//! half of every seam lives in `docs/src/lib/platform.js`; keep the two in step.
//! Why the split is drawn here: engineering/decisions/2026-09-24-lattice-studio-desktop.md.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::webview::NewWindowResponse;
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

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

// THE STUDIO IS THE WHOLE APP (engineering/decisions/2026-09-24-lattice-studio-desktop.md,
// "The owner's direction"). The user should never meet the browser engine underneath: no
// Edge find bar, no Back to a page that is not the Studio, no browser shortcuts. So the
// main window only ever shows the app's own pages, everything outside opens in the default
// browser, and the one external site the app must show (OpenRouter sign-in) gets its own
// window that closes itself.

/// Is `url` one of the app's own pages, or a frame the Studio builds itself? The app is
/// served as `tauri://localhost` (Linux, macOS) or `http://tauri.localhost` (Windows);
/// previews and exports use `about:srcdoc`, `blob:` and `data:` frames. Slides cannot carry
/// iframes (the sanitizer forbids them), so no third-party frame needs a pass here.
fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    match url.scheme() {
        "tauri" | "about" | "blob" | "data" => true,
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost")
                || dev_url.is_some_and(|d| d.origin() == url.origin())
        }
        _ => false,
    }
}

/// A web address the default browser should open instead of the app.
fn is_external_web(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

/// Sign in to an external service (today, OpenRouter's OAuth) in a separate window.
///
/// The Studio passes the sign-in URL and the `callback` it registered with the service.
/// When the service sends the window to `callback`, the window stops that navigation,
/// closes, and this returns the full callback URL (the Studio reads `?code=` from it).
/// Closing the window first returns `None`. The callback address is never loaded, so
/// nothing has to listen on it.
#[tauri::command]
async fn sign_in(app: tauri::AppHandle, url: String, callback: String) -> Result<Option<String>, String> {
    let start = Url::parse(&url).map_err(|e| e.to_string())?;
    if start.scheme() != "https" {
        return Err("sign-in must start on an https page".into());
    }
    let callback_url = Url::parse(&callback).map_err(|e| e.to_string())?;
    if !is_loopback_callback(&callback_url) {
        return Err("the sign-in callback must be an http://localhost address".into());
    }
    // One sign-in at a time. A second Connect click while the window is open brings it to
    // the front; the first call is still waiting and answers when it closes. (Destroying it
    // and building a new one fails: destroy only queues the close, so the label is still
    // taken when the new window is built.)
    if let Some(open) = app.get_webview_window(SIGN_IN_LABEL) {
        let _ = open.unminimize();
        let _ = open.set_focus();
        return Ok(None);
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let send = {
        let tx = tx.clone();
        move |value: Option<String>| {
            if let Some(tx) = tx.lock().ok().and_then(|mut t| t.take()) {
                let _ = tx.send(value);
            }
        }
    };

    let on_nav_send = send.clone();
    let on_nav_app = app.clone();
    let popup_app = app.clone();
    let window = WebviewWindowBuilder::new(&app, SIGN_IN_LABEL, WebviewUrl::External(start))
        .title("Sign in - Lattice Studio")
        .inner_size(520.0, 720.0)
        .center()
        .on_navigation(move |nav| {
            if is_callback(nav, &callback_url) {
                on_nav_send(Some(nav.to_string()));
                if let Some(w) = on_nav_app.get_webview_window(SIGN_IN_LABEL) {
                    let _ = w.close();
                }
                return false;
            }
            // Providers move between their own https pages (OpenRouter, then Google or
            // GitHub). Anything that is not https stays out of this window.
            nav.scheme() == "https"
        })
        .on_new_window(move |url, _features| {
            // A provider's popup ("Sign in with Google" through window.open) opens in this
            // same window rather than as a bare engine window. Redirect-based sign-in, which
            // OpenRouter uses, never takes this path.
            if url.scheme() == "https" {
                if let Some(w) = popup_app.get_webview_window(SIGN_IN_LABEL) {
                    let _ = w.navigate(url);
                }
            }
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| e.to_string())?;
    let close_send = send.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            close_send(None);
        }
    });

    rx.await.map_err(|e| e.to_string())
}

const SIGN_IN_LABEL: &str = "sign-in";

fn is_loopback_callback(url: &Url) -> bool {
    url.scheme() == "http" && matches!(url.host_str(), Some("localhost") | Some("127.0.0.1"))
}

/// Does this navigation land on the registered callback? Same origin and path; the
/// service adds its own query (`?code=...`).
fn is_callback(nav: &Url, callback: &Url) -> bool {
    nav.origin() == callback.origin() && nav.path() == callback.path()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_file, sign_in])
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("tauri.conf.json has no main window")?;
            let dev_url = if cfg!(debug_assertions) { app.config().build.dev_url.clone() } else { None };
            let nav_app = app.handle().clone();
            let popup_app = app.handle().clone();
            let window = WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_navigation(move |url| {
                    if is_app_url(url, dev_url.as_ref()) {
                        return true;
                    }
                    // Never leave the Studio. A link to the web opens in the browser;
                    // anything else (a file:, a custom scheme) goes nowhere.
                    if is_external_web(url) {
                        let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .on_new_window(move |url, _features| {
                    // window.open and target=_blank: the default browser, never a second
                    // engine window.
                    if is_external_web(&url) {
                        let _ = popup_app.opener().open_url(url.as_str(), None::<&str>);
                    }
                    NewWindowResponse::Deny
                })
                .build()?;
            hide_the_engine(&window);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Lattice Studio failed to start");
}

/// The right-click menu keeps only the editing actions: cut, copy, paste, select all,
/// undo, redo and spelling. Everything that belongs to a browser (Back, Reload, Save as,
/// Print, Inspect) goes, and a menu with nothing left does not open at all. Done in the
/// engine, not in the page, because a page's `contextmenu` listener cannot reach inside
/// the Studio's preview frames.
const MENU_KEEP_WEBVIEW2: &[&str] = &[
    "cut", "copy", "paste", "pasteAndMatchStyle", "selectAll", "undo", "redo", "emoji", "spellCheck",
];

/// WebView2 (Windows) answers Ctrl+F, Ctrl+P, F5, Ctrl+R and friends with Edge's own UI.
/// The Studio owns those keys, so the engine's are switched off, and the right-click menu
/// is trimmed (see `MENU_KEEP_WEBVIEW2`). WebKitGTK binds none of those keys.
#[cfg(windows)]
fn hide_the_engine(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| unsafe {
        use webview2_com::ContextMenuRequestedEventHandler;
        use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Settings3, ICoreWebView2_11};
        use windows::core::{Interface, PWSTR};
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        if let Ok(settings) = core.Settings() {
            if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
                let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        }
        let Ok(core11) = core.cast::<ICoreWebView2_11>() else { return };
        let handler = ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else { return Ok(()) };
            let items = args.MenuItems()?;
            let mut count = 0u32;
            items.Count(&mut count)?;
            for i in (0..count).rev() {
                let item = items.GetValueAtIndex(i)?;
                let mut name = PWSTR::null();
                item.Name(&mut name)?;
                let name = webview2_com::take_pwstr(name);
                if !MENU_KEEP_WEBVIEW2.contains(&name.as_str()) {
                    items.RemoveValueAtIndex(i)?;
                }
            }
            items.Count(&mut count)?;
            if count == 0 {
                args.SetHandled(true)?;
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core11.add_ContextMenuRequested(&handler, &mut token);
    });
}

/// WebKitGTK (Linux): the same right-click trim. It binds no browser shortcuts.
#[cfg(target_os = "linux")]
fn hide_the_engine(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| {
        use webkit2gtk::{ContextMenuAction, ContextMenuExt, ContextMenuItemExt, WebViewExt};
        const KEEP: &[ContextMenuAction] = &[
            ContextMenuAction::Cut,
            ContextMenuAction::Copy,
            ContextMenuAction::Paste,
            ContextMenuAction::PasteAsPlainText,
            ContextMenuAction::Delete,
            ContextMenuAction::SelectAll,
            ContextMenuAction::InputMethods,
            ContextMenuAction::Unicode,
            ContextMenuAction::SpellingGuess,
            ContextMenuAction::NoGuessesFound,
            ContextMenuAction::IgnoreSpelling,
            ContextMenuAction::LearnSpelling,
        ];
        webview.inner().connect_context_menu(|_, menu, _, _| {
            for item in menu.items() {
                if !KEEP.contains(&item.stock_action()) {
                    menu.remove(&item);
                }
            }
            // `true` = handled: an empty menu is not shown at all.
            menu.n_items() == 0
        });
    });
}

#[cfg(not(any(windows, target_os = "linux")))]
fn hide_the_engine(_window: &tauri::WebviewWindow) {}

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
    fn the_main_window_keeps_only_the_app_s_own_pages() {
        let ok = |u: &str| is_app_url(&Url::parse(u).unwrap(), None);
        assert!(ok("tauri://localhost/studio/"));
        assert!(ok("http://tauri.localhost/studio/?deck=1"));
        assert!(ok("about:srcdoc"));
        assert!(ok("blob:http://tauri.localhost/1f2e"));
        assert!(!ok("https://openrouter.ai/auth?callback_url=x"));
        assert!(!ok("http://localhost:4321/studio/"));
        assert!(!ok("file:///etc/passwd"));
        let dev = Url::parse("http://localhost:4321/studio/").unwrap();
        assert!(is_app_url(&Url::parse("http://localhost:4321/other").unwrap(), Some(&dev)));
    }

    #[test]
    fn the_sign_in_window_stops_only_at_its_own_callback() {
        let cb = Url::parse("http://localhost:3000/lattice-studio/oauth").unwrap();
        assert!(is_loopback_callback(&cb));
        assert!(!is_loopback_callback(&Url::parse("https://evil.example/cb").unwrap()));
        assert!(is_callback(&Url::parse("http://localhost:3000/lattice-studio/oauth?code=abc").unwrap(), &cb));
        assert!(!is_callback(&Url::parse("http://localhost:3001/lattice-studio/oauth?code=abc").unwrap(), &cb));
        assert!(!is_callback(&Url::parse("http://localhost:3000/other?code=abc").unwrap(), &cb));
    }

    #[test]
    fn the_filter_comes_from_a_plain_extension_only() {
        assert_eq!(extension_of("deck.PDF").as_deref(), Some("pdf"));
        assert_eq!(extension_of("lattice-assets.zip").as_deref(), Some("zip"));
        assert_eq!(extension_of("no-extension"), None);
        assert_eq!(extension_of("weird.tar gz"), None);
    }
}
