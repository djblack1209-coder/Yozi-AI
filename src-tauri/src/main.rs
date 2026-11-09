#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
mod notifications;
mod voice;
use voice::{voice_capability, voice_start, voice_stop, voice_cancel};
mod workspace_windows;
use workspace_windows::*;
#[cfg(target_os = "macos")]
mod poster_share;
use notifications::{
    begin_learning_notifications, learning_notification_permission, replace_learning_notifications,
    take_learning_notification_actions, test_learning_notification, open_learning_notification_settings,
    LearningNotifications,
};

const MAX_BYTES: u64 = 48_000_000;
const MATERIAL_MAX_BYTES: u64 = 10 * 1024 * 1024;
const SELECTION_TTL: Duration = Duration::from_secs(300);

struct Selection {
    id: String,
    kind: String,
    path: PathBuf,
    created: Instant,
}
#[derive(Default)]
struct LearningFiles {
    selection: Mutex<Option<Selection>>,
    material: Mutex<Option<MaterialSelection>>,
    choosing: AtomicBool,
}
#[derive(PartialEq, Debug)]
struct MaterialIdentity {
    size: u64,
    modified: SystemTime,
    created: Option<SystemTime>,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
}
struct MaterialSelection {
    id: String,
    path: PathBuf,
    identity: MaterialIdentity,
    created: Instant,
}
#[derive(Serialize)]
struct MaterialReceipt {
    id: String,
    name: String,
    size: u64,
}
fn material_identity(meta: &fs::Metadata) -> Result<MaterialIdentity, String> {
    if !meta.is_file() || meta.len() == 0 || meta.len() > MATERIAL_MAX_BYTES {
        return Err("请选择 10 MB 以内的普通文件".into());
    }
    #[cfg(unix)]
    use std::os::unix::fs::MetadataExt;
    Ok(MaterialIdentity {
        size: meta.len(),
        modified: meta.modified().map_err(|_| "无法核对文件状态")?,
        created: meta.created().ok(),
        #[cfg(unix)]
        device: meta.dev(),
        #[cfg(unix)]
        inode: meta.ino(),
    })
}
fn material_path_identity(path: &PathBuf) -> Result<MaterialIdentity, String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "无法核对所选文件")?;
    if meta.file_type().is_symlink() {
        return Err("请选择普通文件，不能读取链接".into());
    }
    material_identity(&meta)
}
fn material_name(path: &PathBuf) -> Result<String, String> {
    let name = path
        .file_name()
        .and_then(|x| x.to_str())
        .ok_or("文件名称不支持")?;
    if name.chars().count() > 200
        || name.chars().any(|x| {
            x.is_control()
                || matches!(x, '\u{2028}'..='\u{202e}' | '\u{2066}'..='\u{2069}' | '/' | '\\')
        })
        || !path.extension().and_then(|x| x.to_str()).is_some_and(|x| {
            ["pdf", "png", "jpg", "jpeg"].contains(&x.to_ascii_lowercase().as_str())
        })
    {
        return Err("请选择 PDF 或 PNG/JPEG 图片".into());
    }
    Ok(name.to_string())
}
fn take_material_selection(
    files: &LearningFiles,
    id: &str,
    consent: bool,
) -> Result<MaterialSelection, String> {
    if !consent {
        return Err("请先确认解析资料；所选正文未读取".into());
    }
    let mut entry = files.material.lock().map_err(|_| "文件选择状态不可用")?;
    if !entry
        .as_ref()
        .is_some_and(|s| s.id == id && s.created.elapsed() <= SELECTION_TTL)
    {
        return Err("文件选择已过期或不匹配，请重新选择".into());
    }
    Ok(entry.take().expect("validated material selection"))
}
fn read_material_selection(selected: MaterialSelection) -> Result<Vec<u8>, String> {
    material_name(&selected.path)?;
    if material_path_identity(&selected.path)? != selected.identity {
        return Err("所选文件已变化，请重新选择".into());
    }
    let mut file = File::open(&selected.path).map_err(|_| "无法读取所选文件")?;
    if material_identity(&file.metadata().map_err(|_| "无法核对文件状态")?)? != selected.identity
    {
        return Err("所选文件已变化，请重新选择".into());
    }
    let mut bytes = Vec::with_capacity(selected.identity.size as usize);
    (&mut file)
        .take(MATERIAL_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "文件读取失败，请重新选择")?;
    if bytes.len() as u64 != selected.identity.size
        || material_identity(&file.metadata().map_err(|_| "无法核对文件状态")?)?
            != selected.identity
        || material_path_identity(&selected.path)? != selected.identity
    {
        return Err("所选文件在读取中变化，请重新选择".into());
    }
    let extension = selected
        .path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let valid = match extension.as_str() {
        "pdf" => bytes.starts_with(b"%PDF-"),
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        _ => false,
    };
    if !valid {
        return Err("文件正文与类型不符，请重新选择".into());
    }
    Ok(bytes)
}
#[tauri::command]
async fn choose_learning_material(
    app: AppHandle,
    files: State<'_, LearningFiles>,
) -> Result<Option<MaterialReceipt>, String> {
    if files.choosing.swap(true, Ordering::SeqCst) {
        return Err("请先完成当前文件选择".into());
    }
    let _lease = DialogLease(&files.choosing);
    *files.material.lock().map_err(|_| "文件选择状态不可用")? = None;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("选择Yozi AI学习资料")
            .add_filter("PDF / PNG / JPEG", &["pdf", "png", "jpg", "jpeg"])
            .blocking_pick_file()
    })
    .await
    .map_err(|_| "文件选择失败")?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|_| "文件路径不支持")?;
    let name = material_name(&path)?;
    let identity = material_path_identity(&path)?;
    let id = uuid::Uuid::new_v4().to_string();
    let receipt = MaterialReceipt {
        id: id.clone(),
        name,
        size: identity.size,
    };
    *files.material.lock().map_err(|_| "文件选择状态不可用")? = Some(MaterialSelection {
        id,
        path,
        identity,
        created: Instant::now(),
    });
    Ok(Some(receipt))
}
#[tauri::command]
async fn read_learning_material(
    files: State<'_, LearningFiles>,
    selection: String,
    consent: bool,
) -> Result<tauri::ipc::Response, String> {
    let selected = take_material_selection(&files, &selection, consent)?;
    tauri::async_runtime::spawn_blocking(move || {
        read_material_selection(selected).map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|_| "资料读取失败")?
}
#[tauri::command]
fn discard_learning_material(files: State<'_, LearningFiles>, selection: String) {
    if let Ok(mut current) = files.material.lock() {
        if current.as_ref().is_some_and(|s| s.id == selection) {
            *current = None;
        }
    }
}
#[derive(Serialize)]
struct SelectionReceipt {
    id: String,
    name: String,
}
struct DialogLease<'a>(&'a AtomicBool);
impl Drop for DialogLease<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
fn filename(kind: &str) -> Result<&'static str, String> {
    match kind {
        "records" => Ok("learning-records.json"),
        "records-conflict-local" => Ok("learning-conflict-local.json"),
        "records-conflict-remote" => Ok("learning-conflict-remote.json"),
        "locator" => Ok("wenli-upload-locator.json"),
        "poster" => Ok("Yozi-AI-study.png"),
        _ => Err("不支持此文件类型".into()),
    }
}
fn check_keys(value: &Value, depth: usize) -> Result<(), String> {
    if depth > 32 {
        return Err("JSON 嵌套过深".into());
    }
    match value {
        Value::Object(fields) => {
            for (key, item) in fields {
                if [
                    "__proto__",
                    "prototype",
                    "constructor",
                    "apikey",
                    "api_key",
                    "accesstoken",
                    "refreshtoken",
                    "authorization",
                    "password",
                    "secret",
                    "vaultkey",
                ]
                .contains(&key.to_lowercase().as_str())
                {
                    return Err("学习文件包含敏感配置或不安全字段".into());
                }
                check_keys(item, depth + 1)?;
            }
        }
        Value::Array(items) => {
            for item in items {
                check_keys(item, depth + 1)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn validate_content(kind: &str, content: &str) -> Result<(), String> {
    filename(kind)?;
    if content.len() as u64 > MAX_BYTES || content.chars().count() > 12_000_000 {
        return Err("学习文件超过容量上限".into());
    }
    let value: Value = serde_json::from_str(content).map_err(|_| "文件不是有效 JSON")?;
    if kind == "poster" { return poster_bytes(&value).map(|_| ()); }
    check_keys(&value, 0)?;
    let valid = if kind == "locator" {
        value["format"] == "wenli-upload-locator-v1"
            && value["owner"].is_string()
            && value["entry"].is_object()
    } else {
        (value["version"] == 1 && value["owner"].is_string() && value["events"].is_array())
            || (value["format"] == "learning-history-v1"
                && value["owner"].is_string()
                && value["pages"].is_array())
    };
    if !valid {
        return Err("文件不是受支持的学习记录或定位登记".into());
    }
    Ok(())
}
fn poster_bytes(value: &Value) -> Result<Vec<u8>, String> {
    let fields = value.as_object().ok_or("图片数据无效")?;
    if fields.len() != 2 || value["format"] != "yozi-learning-poster-v1" { return Err("图片格式无效".into()); }
    let raw = value["png"].as_array().ok_or("图片数据无效")?;
    if raw.len() < 33 || raw.len() > 2_000_000 { return Err("图片大小超过上限".into()); }
    let bytes: Vec<u8> = raw.iter().map(|item| item.as_u64().filter(|n| *n <= 255).map(|n| n as u8).ok_or("图片数据无效".to_string())).collect::<Result<_, _>>()?;
    if bytes[..8] != [137, 80, 78, 71, 13, 10, 26, 10] || bytes[8..16] != [0, 0, 0, 13, 73, 72, 68, 82] { return Err("图片不是 PNG".into()); }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    if width != 1080 || height != 1440 || !bytes.ends_with(&[0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]) { return Err("图片尺寸或结尾无效".into()); }
    Ok(bytes)
}
#[tauri::command]
async fn share_learning_poster(window: tauri::WebviewWindow, content: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        if window.label() != "main" || content.len() as u64 > MAX_BYTES {
            return Err("无法分享学习图片".into());
        }
        let value = serde_json::from_str(&content).map_err(|_| "图片数据无效")?;
        poster_share::share(window, poster_bytes(&value)?).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, content);
        Err("此桌面系统请先保存图片".into())
    }
}
fn take_selection(files: &LearningFiles, id: &str, kind: &str) -> Result<Selection, String> {
    let mut entry = files.selection.lock().map_err(|_| "文件选择状态不可用")?;
    let valid = entry
        .as_ref()
        .is_some_and(|s| s.id == id && s.kind == kind && s.created.elapsed() <= SELECTION_TTL);
    if !valid {
        return Err("文件选择已过期或不匹配，请重新选择".into());
    }
    Ok(entry.take().expect("validated selection"))
}

#[tauri::command]
async fn choose_learning_save(
    app: AppHandle,
    files: State<'_, LearningFiles>,
    kind: String,
) -> Result<Option<SelectionReceipt>, String> {
    let name = filename(&kind)?;
    let extension = if kind == "poster" { "png" } else { "json" };
    if files.choosing.swap(true, Ordering::SeqCst) {
        return Err("请先完成当前文件选择".into());
    }
    let _lease = DialogLease(&files.choosing);
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("保存Yozi AI学习文件")
            .set_file_name(name)
            .add_filter(if extension == "png" { "PNG" } else { "JSON" }, &[extension])
            .blocking_save_file()
    })
    .await
    .map_err(|_| "文件选择失败")?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|_| "文件路径不支持")?;
    if path
        .extension()
        .and_then(|x| x.to_str())
        .map(|x| x.eq_ignore_ascii_case(extension))
        != Some(true)
    {
        return Err(format!("请使用 .{extension} 文件扩展名"));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let receipt = SelectionReceipt {
        id: id.clone(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
    };
    *files.selection.lock().map_err(|_| "文件选择状态不可用")? = Some(Selection {
        id,
        kind,
        path,
        created: Instant::now(),
    });
    Ok(Some(receipt))
}

#[tauri::command]
async fn write_learning_selection(
    files: State<'_, LearningFiles>,
    selection: String,
    kind: String,
    content: String,
) -> Result<(), String> {
    validate_content(&kind, &content)?;
    let bytes = if kind == "poster" { poster_bytes(&serde_json::from_str::<Value>(&content).map_err(|_| "图片数据无效")?)? } else { content.into_bytes() };
    let chosen = take_selection(&files, &selection, &kind)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(meta) = fs::symlink_metadata(&chosen.path) {
            if meta.file_type().is_symlink() || !meta.is_file() {
                return Err("不能覆盖链接或非普通文件".into());
            }
        }
        let parent = chosen.path.parent().ok_or("保存目录无效")?;
        let mut temporary =
            tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建保存文件")?;
        temporary
            .write_all(&bytes)
            .map_err(|_| "学习文件写入失败")?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|_| "学习文件保存未确认")?;
        temporary
            .persist(chosen.path)
            .map_err(|_| "学习文件替换失败，原文件保留")?;
        Ok(())
    })
    .await
    .map_err(|_| "学习文件保存失败")?
}

#[tauri::command]
fn discard_learning_selection(files: State<'_, LearningFiles>, selection: String) {
    if let Ok(mut current) = files.selection.lock() {
        if current.as_ref().is_some_and(|s| s.id == selection) {
            *current = None;
        }
    }
}

#[tauri::command]
async fn read_learning_backup(
    app: AppHandle,
    files: State<'_, LearningFiles>,
) -> Result<Option<String>, String> {
    if files.choosing.swap(true, Ordering::SeqCst) {
        return Err("请先完成当前文件选择".into());
    }
    let _lease = DialogLease(&files.choosing);
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("选择Yozi AI学习备份")
            .add_filter("学习记录 JSON", &["json"])
            .blocking_pick_file()
    })
    .await
    .map_err(|_| "文件选择失败")?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|_| "文件路径不支持")?;
    tauri::async_runtime::spawn_blocking(move || {
        if path
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| x.eq_ignore_ascii_case("json"))
            != Some(true)
        {
            return Err("请选择 JSON 学习记录".into());
        }
        let file = File::open(&path).map_err(|_| "无法读取所选文件")?;
        let meta = file.metadata().map_err(|_| "无法核对文件容量")?;
        if !meta.is_file() || meta.len() > MAX_BYTES {
            return Err("所选文件类型或容量不支持".into());
        }
        let mut content = String::new();
        file.take(MAX_BYTES + 1)
            .read_to_string(&mut content)
            .map_err(|_| "文件不是 UTF-8 文本")?;
        validate_content("records", &content)?;
        Ok(Some(content))
    })
    .await
    .map_err(|_| "学习备份读取失败")?
}

fn trusted_navigation(url: &tauri::Url) -> bool {
    url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (["http", "https"].contains(&url.scheme())
                && url.host_str() == Some("tauri.localhost")))
}

#[derive(Serialize)]
struct DesktopOAuthProof {
    verifier: String,
    challenge: String,
}

#[tauri::command]
fn create_desktop_oauth_proof() -> Result<DesktopOAuthProof, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "当前环境不支持安全授权，请使用邮箱登录")?;
    let verifier: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    let challenge = format!("{:x}", Sha256::digest(verifier.as_bytes()));
    Ok(DesktopOAuthProof {
        verifier,
        challenge,
    })
}

fn valid_desktop_oauth_url(provider: &str, raw: &str) -> bool {
    if raw.len() > 4096 {
        return false;
    }
    let Ok(url) = tauri::Url::parse(raw) else {
        return false;
    };
    let (host, path, app_key, scope) = match provider {
        "wechat" => (
            "open.weixin.qq.com",
            "/connect/qrconnect",
            "appid",
            "snsapi_login",
        ),
        _ => return false,
    };
    if url.scheme() != "https"
        || url.host_str() != Some(host)
        || url.path() != path
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || (provider == "wechat" && url.fragment() != Some("wechat_redirect"))
    {
        return false;
    }
    let mut params = std::collections::HashMap::new();
    for (key, value) in url.query_pairs() {
        if ![app_key, "response_type", "redirect_uri", "state", "scope"].contains(&key.as_ref())
            || params
                .insert(key.into_owned(), value.into_owned())
                .is_some()
        {
            return false;
        }
    }
    if params.len() != 5
        || params.get("response_type").map(String::as_str) != Some("code")
        || params.get("scope").map(String::as_str) != Some(scope)
    {
        return false;
    }
    let Some(app_id) = params.get(app_key) else {
        return false;
    };
    if app_id.is_empty()
        || app_id.len() > 128
        || !app_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return false;
    }
    let Some(state) = params.get("state") else {
        return false;
    };
    if state.len() != 72
        || !state.starts_with("desktop_")
        || !state.as_bytes()[8..]
            .iter()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
    {
        return false;
    }
    let Some(redirect) = params
        .get("redirect_uri")
        .and_then(|value| tauri::Url::parse(value).ok())
    else {
        return false;
    };
    let callback = format!("/oauth/{provider}.html");
    redirect.scheme() == "https"
        && redirect.port().is_none()
        && redirect.username().is_empty()
        && redirect.password().is_none()
        && redirect.path() == callback
        && redirect.query().is_none()
        && redirect.fragment().is_none()
        && redirect.host_str().is_some_and(|host| {
            host.contains('.')
                && host.parse::<std::net::IpAddr>().is_err()
                && !host.ends_with(".localhost")
        })
}

#[tauri::command]
fn open_desktop_oauth(app: AppHandle, provider: String, url: String) -> Result<(), String> {
    if !valid_desktop_oauth_url(&provider, &url) {
        return Err("桌面授权地址无效，请重新登录".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "无法打开系统浏览器，请重新登录".into())
}

#[tauri::command]
fn focus_desktop_after_oauth(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("桌面窗口已关闭")?;
    window.unminimize().map_err(|_| "无法返回桌面窗口")?;
    window.set_focus().map_err(|_| "无法返回桌面窗口".into())
}

fn support_feedback_url(note: &str) -> String {
    let mut url = tauri::Url::parse("mailto:yozi@245334.xyz").expect("valid support address");
    url.query_pairs_mut()
        .append_pair("subject", "Yozi AI feedback")
        .append_pair("body", note);
    url.as_str().replace('+', "%20")
}

#[tauri::command]
async fn open_support_feedback(app: AppHandle, note: String) -> Result<(), String> {
    app.opener()
        .open_url(support_feedback_url(&note), None::<&str>)
        .map_err(|_| "无法打开系统邮件应用".into())
}

fn main() {
    // 通知可能在系统启动应用时到达，代理必须先于 Tauri 的就绪回调安装。
    notifications::bootstrap();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if matches!(event, tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed) {
                    voice::cancel_all();
                }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if window.app_handle().get_webview_window("settings").is_some() {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && payload.event() == tauri::webview::PageLoadEvent::Started {
                voice::cancel_all();
            }
        })
        .manage(LearningFiles::default())
        .manage(LearningNotifications::default())
        .manage(SettingsRefresh::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            install_chinese_menu(app.handle())?;
            notifications::initialize(app.handle().clone());
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .ok_or("main window configuration missing")?;
            let builder = tauri::WebviewWindowBuilder::from_config(app, config)?;
            #[cfg(target_os = "macos")]
            let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
            #[cfg(target_os = "macos")]
            let builder = if app.config().identifier == "cn.wangshiliang.wenli.localqa93d5ef76c442" {
                // 日常入口沿用既有资料域，主窗和设置窗必须一致。
                builder.data_store_identifier([
                    0x93, 0xd5, 0xef, 0x76, 0xc4, 0x42, 0x47, 0x05, 0x81, 0xc9, 0x5c, 0x9a, 0xd9,
                    0x2f, 0x1d, 0xfe,
                ])
            } else if app.config().identifier == "cn.wangshiliang.wenli.qa.journey" {
                // 仅受限本机候选标识采用独立WebKit资料域；正式入口和用户资料域不变。
                builder.data_store_identifier([
                    0x51, 0x92, 0x20, 0x26, 0x10, 0x10, 0x42, 0x72, 0x91, 0x29, 0x35, 0x73, 0x88,
                    0x91, 0x13, 0x07,
                ])
            } else {
                builder
            };
            builder
                .on_navigation(trusted_navigation)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            choose_learning_save,
            share_learning_poster,
            write_learning_selection,
            discard_learning_selection,
            read_learning_backup,
            choose_learning_material,
            read_learning_material,
            discard_learning_material,
            create_desktop_oauth_proof,
            open_desktop_oauth,
            open_support_feedback,
            focus_desktop_after_oauth,
            begin_learning_notifications,
            learning_notification_permission,
            replace_learning_notifications,
            take_learning_notification_actions,
            test_learning_notification,
            open_learning_notification_settings,
            open_desktop_settings,
            close_desktop_settings,
            open_desktop_workspace,
            complete_desktop_model_intake,
            set_desktop_appearance,
            request_settings_notification_refresh,
            complete_settings_notification_refresh,
            voice_capability,
            voice_start,
            voice_stop,
            voice_cancel
        ])
        .build(tauri::generate_context!())
        .expect("Yozi AI desktop could not start")
        .run(|_, event| {
            if matches!(event, tauri::RunEvent::Exit) { voice::cancel_all(); }
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn support_feedback_encodes_the_note_in_a_draft_to_the_fixed_recipient() {
        let note = "建议 + test\r\n&bcc=other@example.test";
        let raw = super::support_feedback_url(note);
        let parsed = tauri::Url::parse(&raw).unwrap();
        assert_eq!(parsed.scheme(), "mailto");
        assert_eq!(parsed.path(), "yozi@245334.xyz");
        assert_eq!(
            parsed.query_pairs().into_owned().collect::<Vec<_>>(),
            vec![
                ("subject".to_owned(), "Yozi AI feedback".to_owned()),
                ("body".to_owned(), note.to_owned())
            ]
        );
        assert!(raw.contains("Yozi%20AI%20feedback"));
    }

    #[test]
    fn conflict_exports_keep_distinct_names_and_record_guards() {
        let local = filename("records-conflict-local").unwrap();
        let remote = filename("records-conflict-remote").unwrap();
        assert_eq!(local, "learning-conflict-local.json");
        assert_eq!(remote, "learning-conflict-remote.json");
        assert_ne!(local, remote);
        assert_ne!(local, filename("records").unwrap());
        assert_ne!(remote, filename("records").unwrap());
        for kind in ["records-conflict-local", "records-conflict-remote"] {
            assert!(validate_content(kind, r#"{"version":1,"owner":"test","events":[]}"#).is_ok());
            assert!(validate_content(kind, r#"{"message":"unrelated"}"#).is_err());
            assert!(validate_content(kind, r#"{"version":1,"owner":"test","events":[],"api_key":"test-only"}"#).is_err());
        }
        assert!(filename("../learning-conflict-local.json").is_err());
        assert!(filename("records-conflict-unknown").is_err());
    }
    #[test]
    fn poster_export_is_bounded_png_and_keeps_record_validation() {
        assert_eq!(filename("poster").unwrap(), "Yozi-AI-study.png");
        assert!(validate_content("poster", "{\"format\":\"yozi-learning-poster-v1\",\"png\":[1,2,3]}").is_err());
        assert!(validate_content("poster", "{\"version\":1,\"owner\":\"owner\",\"events\":[]}").is_err());
        let mut bytes = vec![137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
        bytes.extend(1080u32.to_be_bytes()); bytes.extend(1440u32.to_be_bytes());
        bytes.extend([8, 6, 0, 0, 0, 0, 0, 0, 0]);
        bytes.extend([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
        assert!(poster_bytes(&serde_json::json!({"format":"yozi-learning-poster-v1","png":bytes})).is_ok());
        bytes[16] = 1;
        assert!(poster_bytes(&serde_json::json!({"format":"yozi-learning-poster-v1","png":bytes})).is_err());
        assert!(validate_content("records", "{\"format\":\"yozi-learning-poster-v1\",\"png\":[]}").is_err());
    }
    #[test]
    fn material_consent_expiry_and_one_use_are_required() {
        let files = LearningFiles::default();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("original.pdf");
        fs::write(&path, b"%PDF-1.7 synthetic").unwrap();
        *files.material.lock().unwrap() = Some(MaterialSelection {
            id: "selected".into(),
            identity: material_path_identity(&path).unwrap(),
            path: path.clone(),
            created: Instant::now(),
        });
        assert!(take_material_selection(&files, "selected", false).is_err());
        assert!(take_material_selection(&files, "other", true).is_err());
        let selected = take_material_selection(&files, "selected", true).unwrap();
        assert_eq!(
            read_material_selection(selected).unwrap(),
            b"%PDF-1.7 synthetic"
        );
        assert!(take_material_selection(&files, "selected", true).is_err());
        *files.material.lock().unwrap() = Some(MaterialSelection {
            id: "expired".into(),
            identity: material_path_identity(&path).unwrap(),
            path,
            created: Instant::now() - Duration::from_secs(301),
        });
        assert!(take_material_selection(&files, "expired", true).is_err());
    }
    #[test]
    fn material_changed_replaced_or_false_type_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("original.png");
        fs::write(&path, b"\x89PNG\r\n\x1a\nsynthetic").unwrap();
        let chosen = MaterialSelection {
            id: "selected".into(),
            identity: material_path_identity(&path).unwrap(),
            path: path.clone(),
            created: Instant::now(),
        };
        fs::write(&path, b"changed").unwrap();
        assert!(read_material_selection(chosen).is_err());
        let chosen = MaterialSelection {
            id: "selected".into(),
            identity: material_path_identity(&path).unwrap(),
            path: path.clone(),
            created: Instant::now(),
        };
        assert!(read_material_selection(chosen).is_err());
        fs::write(&path, b"\x89PNG\r\n\x1a\nsynthetic").unwrap();
        let chosen = MaterialSelection {
            id: "selected".into(),
            identity: material_path_identity(&path).unwrap(),
            path: path.clone(),
            created: Instant::now(),
        };
        let replacement = dir.path().join("replacement.png");
        fs::write(&replacement, b"\x89PNG\r\n\x1a\nsynthetic").unwrap();
        fs::rename(replacement, path).unwrap();
        assert!(read_material_selection(chosen).is_err());
    }
    #[test]
    fn material_capacity_names_and_links_are_bounded() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("original.pdf");
        let file = File::create(&path).unwrap();
        assert!(material_path_identity(&path).is_err());
        file.set_len(MATERIAL_MAX_BYTES + 1).unwrap();
        assert!(material_path_identity(&path).is_err());
        assert!(material_name(&dir.path().join("record.json")).is_err());
        assert!(material_name(&dir.path().join("misleading\u{202e}.png")).is_err());
        assert!(material_name(&dir.path().join("ORIGINAL.JPEG")).is_ok());
        #[cfg(unix)]
        {
            let link = dir.path().join("link.pdf");
            std::os::unix::fs::symlink(path, &link).unwrap();
            assert!(material_path_identity(&link).is_err());
        }
    }
    use super::*;
    #[test]
    fn desktop_proof_is_fresh_and_bound_to_the_verifier() {
        let first = create_desktop_oauth_proof().unwrap();
        let second = create_desktop_oauth_proof().unwrap();
        assert_eq!(first.verifier.len(), 64);
        assert!(first
            .verifier
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        assert_eq!(
            first.challenge,
            format!("{:x}", Sha256::digest(first.verifier.as_bytes()))
        );
        assert_ne!(first.verifier, second.verifier);
        assert_ne!(first.challenge, second.challenge);
    }
    #[test]
    fn desktop_browser_opener_accepts_only_bound_provider_urls() {
        let state = format!("desktop_{}", "ab".repeat(32));
        let wx = format!("https://open.weixin.qq.com/connect/qrconnect?appid=test_app&response_type=code&redirect_uri=https%3A%2F%2Flearning.example.com%2Foauth%2Fwechat.html&state={state}&scope=snsapi_login#wechat_redirect");
        for bad in [
            wx.replace("open.weixin.qq.com", "open.weixin.qq.com.evil"),
            wx.replace("https://open.weixin.qq.com", "http://open.weixin.qq.com"),
            wx.replace("snsapi_login", "unknown"),
            wx.replace("desktop_", "web_"),
            wx.replace("learning.example.com", "127.0.0.1"),
            wx.replace(
                "#wechat_redirect",
                &format!("&state={state}#wechat_redirect"),
            ),
            wx.replace("#wechat_redirect", "&extra=1#wechat_redirect"),
            "file:///tmp/test.html".into(),
        ] {
            assert!(!valid_desktop_oauth_url("wechat", &bad));
        }
        assert!(!valid_desktop_oauth_url("qq", &wx));
        assert!(valid_desktop_oauth_url("wechat", &wx));
        assert!(!valid_desktop_oauth_url(
            "wechat",
            &wx.replace("#wechat_redirect", "")
        ));
    }
    #[test]
    fn privileged_window_cannot_navigate_to_remote_or_file_content() {
        for url in [
            "tauri://localhost/index.html#/pages/learning/index",
            "http://tauri.localhost/",
            "https://tauri.localhost/",
        ] {
            assert!(trusted_navigation(&url.parse().unwrap()));
        }
        for url in [
            "https://example.com/",
            "file:///tmp/a.html",
            "tauri://evil/index.html",
            "http://tauri.localhost.evil/",
            "http://tauri.localhost:5000/",
            "https://user@tauri.localhost/",
        ] {
            assert!(!trusted_navigation(&url.parse().unwrap()));
        }
    }
    #[test]
    fn file_payloads_cannot_carry_credentials_or_unrelated_json() {
        assert!(
            validate_content("records", r#"{"version":1,"owner":"guest","events":[]}"#).is_ok()
        );
        assert!(validate_content(
            "records",
            r#"{"version":1,"owner":"guest","events":[{"apiKey":"secret"}]}"#
        )
        .is_err());
        assert!(validate_content(
            "records",
            r#"{"version":1,"owner":"guest","events":[{"__proto__":{}}]}"#
        )
        .is_err());
        assert!(validate_content("records", r#"{"message":"unrelated"}"#).is_err());
        assert!(validate_content("shell", "{}").is_err());
    }
    #[test]
    fn selection_is_bound_to_kind_token_and_expiry_and_is_consumed_once() {
        let files = LearningFiles::default();
        *files.selection.lock().unwrap() = Some(Selection {
            id: "selected".into(),
            kind: "records".into(),
            path: PathBuf::from("selected.json"),
            created: Instant::now(),
        });
        assert!(take_selection(&files, "other", "records").is_err());
        assert!(take_selection(&files, "selected", "locator").is_err());
        assert!(take_selection(&files, "selected", "records").is_ok());
        assert!(take_selection(&files, "selected", "records").is_err());
        *files.selection.lock().unwrap() = Some(Selection {
            id: "expired".into(),
            kind: "records".into(),
            path: PathBuf::from("expired.json"),
            created: Instant::now() - Duration::from_secs(301),
        });
        assert!(take_selection(&files, "expired", "records").is_err());
    }
}
