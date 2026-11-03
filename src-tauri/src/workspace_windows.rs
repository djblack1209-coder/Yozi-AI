use serde_json::{json, Value};
use std::{collections::HashMap, sync::{mpsc, Mutex}, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[cfg(target_os = "macos")]
pub fn install_chinese_menu(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItemKind};
    fn translated(text: &str) -> Option<String> {
        let text = text.replace('&', "");
        let label = match text.as_str() {
            "File" => "文件",
            "Edit" => "编辑",
            "View" => "显示",
            "Window" => "窗口",
            "Help" => "帮助",
            "Undo" => "撤销",
            "Redo" => "重做",
            "Cut" => "剪切",
            "Copy" => "复制",
            "Paste" => "粘贴",
            "Select All" => "全选",
            "Close Window" | "Close" => "关闭窗口",
            "Minimize" => "最小化",
            "Zoom" | "Maximize" => "缩放",
            "Toggle Full Screen" => "切换全屏",
            "Hide Others" => "隐藏其他应用",
            "Show All" => "显示全部",
            "Services" => "服务",
            _ => {
                for (prefix, chinese) in [("About ", "关于 "), ("Hide ", "隐藏 "), ("Quit ", "退出 ")] {
                    if let Some(name) = text.strip_prefix(prefix) {
                        return Some(format!("{chinese}{name}"));
                    }
                }
                return None;
            }
        };
        Some(label.into())
    }
    fn localize(items: Vec<MenuItemKind<tauri::Wry>>) -> tauri::Result<()> {
        for item in items {
            match item {
                MenuItemKind::Submenu(menu) => {
                    if let Some(label) = translated(&menu.text()?) { menu.set_text(label)?; }
                    localize(menu.items()?)?;
                }
                MenuItemKind::Predefined(item) => {
                    if let Some(label) = translated(&item.text()?) { item.set_text(label)?; }
                }
                _ => {}
            }
        }
        Ok(())
    }
    let menu = Menu::default(app)?;
    localize(menu.items()?)?;
    app.set_menu(menu)?;
    Ok(())
}

#[derive(Default)]
pub struct SettingsRefresh(Mutex<HashMap<String, mpsc::Sender<Value>>>, Mutex<()>);

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) } else { Err("此操作仅限主窗口".into()) }
}
fn settings_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "settings" { Ok(()) } else { Err("此操作仅限设置窗口".into()) }
}
fn workspace_route(route: &str) -> bool {
    ["/pages/learning/index", "/pages/learning/index?panel=data", "/pages/archive/index", "/pages/archive/index?view=plan", "/pages/archive/index?view=materials", "/pages/mistake/index", "/pages/favorite/index",
        "/pages/login/index", "/pages/index/index", "/pages/profile/index?panel=reset", "/pages/settings/privacy", "/pages/settings/terms"].contains(&route)
}

// Muse 2 实现参数: native/main.swift:1759 (independent settings window).
const SETTINGS_SIZE: (f64, f64) = (520.0, 680.0);

#[tauri::command]
pub async fn open_desktop_settings(app: AppHandle, window: WebviewWindow, state: State<'_, SettingsRefresh>, panel: String) -> Result<(), String> {
    main_only(&window)?;
    if !["settings", "connectors", "profile"].contains(&panel.as_str()) { return Err("设置分组不合法".into()); }
    // Serialize the lookup and build: two rapid invokes must share one native webview.
    let _opening = state.1.lock().map_err(|_| "设置窗口正在打开")?;
    if let Some(settings) = app.get_webview_window("settings") {
        settings.emit("desktop-settings-panel", &panel).map_err(|_| "设置窗口暂不可用")?;
        settings.unminimize().map_err(|_| "设置窗口暂不可用")?;
        settings.show().map_err(|_| "设置窗口暂不可用")?;
        return settings.set_focus().map_err(|_| "无法打开设置窗口".into());
    }
    let route = format!("/pages/profile/index?panel={panel}");
    let builder = tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::App(format!("index.html#{route}").into()))
        .title("Yozi AI 设置").inner_size(SETTINGS_SIZE.0, SETTINGS_SIZE.1).min_inner_size(SETTINGS_SIZE.0, SETTINGS_SIZE.1).center()
        .theme(window.theme().ok());
    #[cfg(target_os = "macos")]
    let builder = {
        let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
        if app.config().identifier == "cn.wangshiliang.wenli.localqa93d5ef76c442" {
            builder.data_store_identifier([0x93,0xd5,0xef,0x76,0xc4,0x42,0x47,0x05,0x81,0xc9,0x5c,0x9a,0xd9,0x2f,0x1d,0xfe])
        } else if app.config().identifier == "cn.wangshiliang.wenli.qa.journey" {
            builder.data_store_identifier([0x51,0x92,0x20,0x26,0x10,0x10,0x42,0x72,0x91,0x29,0x35,0x73,0x88,0x91,0x13,0x07])
        } else { builder }
    };
    let parent = app.clone();
    let settings = builder.on_navigation(super::trusted_navigation)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build().map_err(|_| "无法创建设置窗口")?;
    settings.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Some(main) = parent.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
                let _ = main.emit("desktop-settings-closed", ());
            }
        }
    });
    settings.show().map_err(|_| "设置窗口暂不可用")?;
    settings.set_focus().map_err(|_| "无法打开设置窗口".into())
}

#[tauri::command]
pub fn close_desktop_settings(window: WebviewWindow) -> Result<(), String> {
    settings_only(&window)?;
    window.close().map_err(|_| "无法关闭设置窗口".into())
}

#[tauri::command]
pub async fn open_desktop_workspace(app: AppHandle, window: WebviewWindow, state: State<'_, SettingsRefresh>, route: String, model_id: Option<String>, owner: Option<String>, selection_only: Option<bool>) -> Result<(), String> {
    settings_only(&window)?;
    if !workspace_route(&route) { return Err("工作区页面不合法".into()); }
    let main = app.get_webview_window("main").ok_or("主窗口暂不可用")?;
    if let Some(model_id) = model_id {
        if route != "/pages/learning/index" || model_id.is_empty() || model_id.len() > 60 ||
            !model_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-') ||
            !owner.as_ref().is_some_and(|value| !value.is_empty() && value.len() <= 160) {
            return Err("模型建档请求不合法".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let (sender, receiver) = mpsc::channel();
        {
            let mut pending = state.0.lock().map_err(|_| "模型连接繁忙")?;
            if pending.len() >= 4 { return Err("请等待当前连接完成".into()); }
            pending.insert(id.clone(), sender);
        }
        let result = if main.emit("desktop-model-intake", json!({"id":id, "modelId":model_id, "owner":owner, "selectionOnly":selection_only.unwrap_or(false)})).is_err() {
            Err("主窗口暂不可用".to_string())
        } else {
            tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(90)))
                .await.map_err(|_| "未收到模型连接回执".to_string())?
                .map_err(|_| "模型连接结果未确认，请返回主窗口核对，勿重复连接".to_string())
        };
        state.0.lock().map_err(|_| "模型连接繁忙")?.remove(&id);
        let receipt = result?;
        if receipt.get("success").and_then(Value::as_bool) != Some(true) {
            return Err("模型尚未启用，请在主窗口查看错误后重试；连接配置已保留".into());
        }
    } else {
        main.emit("desktop-workspace-route", route).map_err(|_| "无法返回工作区")?;
    }
    main.show().map_err(|_| "无法返回工作区")?;
    main.unminimize().map_err(|_| "无法返回工作区")?;
    main.set_focus().map_err(|_| "无法返回工作区")?;
    window.close().map_err(|_| "无法关闭设置窗口".into())
}

#[tauri::command]
pub fn complete_desktop_model_intake(window: WebviewWindow, state: State<'_, SettingsRefresh>, id: String, success: bool) -> Result<(), String> {
    main_only(&window)?;
    if let Some(sender) = state.0.lock().map_err(|_| "模型连接繁忙")?.remove(&id) {
        let _ = sender.send(json!({"success": success}));
    }
    Ok(())
}

#[tauri::command]
pub fn set_desktop_appearance(app: AppHandle, window: WebviewWindow, dark: bool) -> Result<(), String> {
    if !["main", "settings"].contains(&window.label()) { return Err("窗口不合法".into()); }
    for label in ["main", "settings"] {
        if let Some(view) = app.get_webview_window(label) {
            view.set_theme(Some(if dark { tauri::Theme::Dark } else { tauri::Theme::Light })).map_err(|_| "外观尚未同步")?;
            view.set_background_color(Some(tauri::window::Color(if dark { 22 } else { 252 }, if dark { 22 } else { 252 }, if dark { 23 } else { 252 }, 255)))
                .map_err(|_| "窗口颜色尚未同步")?;
            if view.label() != window.label() { let _ = view.emit("desktop-preferences-changed", ()); }
        }
    }
    Ok(())
}

// Only the main window owns the native scheduler token. Settings requests a
// refresh, then displays its bounded receipt; it cannot replace queued jobs.
#[tauri::command]
pub async fn request_settings_notification_refresh(app: AppHandle, window: WebviewWindow, state: State<'_, SettingsRefresh>) -> Result<Value, String> {
    settings_only(&window)?;
    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = mpsc::channel();
    {
        let mut pending = state.0.lock().map_err(|_| "提醒状态繁忙")?;
        if pending.len() >= 4 { return Err("请等待当前提醒更新".into()); }
        pending.insert(id.clone(), sender);
    }
    let result = if let Some(main) = app.get_webview_window("main") {
        if main.emit("desktop-notifications-refresh", &id).is_err() { Err("主窗口暂不可用".into()) }
        else { tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(8)))
            .await.map_err(|_| "提醒回执未收到".to_string())?
            .map_err(|_| "提醒回执未收到，请返回主窗口核对".to_string()) }
    } else { Err("主窗口暂不可用".into()) };
    state.0.lock().map_err(|_| "提醒状态繁忙")?.remove(&id);
    result
}

#[tauri::command]
pub fn complete_settings_notification_refresh(window: WebviewWindow, state: State<'_, SettingsRefresh>, id: String, receipt: Value) -> Result<(), String> {
    main_only(&window)?;
    if receipt.get("channel").and_then(Value::as_str) != Some("macos") ||
        !["saved", "scheduled", "partial-scheduled", "failed"].contains(&receipt.get("status").and_then(Value::as_str).unwrap_or("")) {
        return Err("提醒回执不合法".into());
    }
    let count = receipt.get("count").and_then(Value::as_u64).filter(|n| *n <= 64).ok_or("提醒回执不合法")?;
    let total = receipt.get("total").and_then(Value::as_u64).filter(|n| *n <= 100000).ok_or("提醒回执不合法")?;
    if let Some(sender) = state.0.lock().map_err(|_| "提醒状态繁忙")?.remove(&id) {
        let _ = sender.send(json!({"channel":"macos", "status":receipt["status"], "count":count, "total":total}));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_routes_are_closed_to_remote_and_arbitrary_paths() {
        assert!(workspace_route("/pages/learning/index"));
        assert!(workspace_route("/pages/archive/index?view=plan"));
        assert!(workspace_route("/pages/learning/index?panel=data"));
        assert!(!workspace_route("/pages/learning/index?panel=other"));
        assert!(workspace_route("/pages/archive/index?view=materials"));
        assert!(!workspace_route("/pages/archive/index?view=other"));
        assert!(!workspace_route("https://example.com"));
        assert!(!workspace_route("/pages/learning/index?redirect=https://example.com"));
        assert!(!workspace_route("../../private"));
    }
    #[test]
    fn settings_keep_the_compact_desktop_size() {
        assert_eq!(SETTINGS_SIZE, (520.0, 680.0));
    }
}
