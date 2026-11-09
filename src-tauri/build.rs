fn main() {
    println!("cargo:rerun-if-changed=src/notifications.m");
    println!("cargo:rerun-if-changed=src/voice.m");
    println!("cargo:rerun-if-env-changed=YOZI_BUILD_CHANNEL");
    let channel = std::env::var("YOZI_BUILD_CHANNEL").unwrap_or_default();
    let channel = if ["dev", "test"].contains(&channel.as_str()) {
        channel.as_str()
    } else {
        "production"
    };
    println!("cargo:rustc-env=YOZI_BUILD_CHANNEL={channel}");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR missing"));
        for bridge in ["notifications", "voice"] {
            let object = out.join(format!("yozi_{bridge}.o"));
            let library = out.join(format!("libyozi_{bridge}.a"));
            assert!(
                std::process::Command::new("xcrun")
                    .args(["clang", "-c", "-fobjc-arc", "-mmacosx-version-min=12.0"])
                    .arg(format!("src/{bridge}.m"))
                    .arg("-o")
                    .arg(&object)
                    .status()
                    .expect("Apple compiler unavailable")
                    .success(),
                "native bridge compilation failed"
            );
            assert!(
                std::process::Command::new("xcrun")
                    .args(["ar", "crs"])
                    .arg(&library)
                    .arg(&object)
                    .status()
                    .expect("Apple archive tool unavailable")
                    .success(),
                "native bridge archive failed"
            );
            println!("cargo:rustc-link-search=native={}", out.display());
            println!("cargo:rustc-link-lib=static=yozi_{bridge}");
        }
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
        println!("cargo:rustc-link-lib=framework=Speech");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "choose_learning_save",
            "share_learning_poster",
            "write_learning_selection",
            "discard_learning_selection",
            "read_learning_backup",
            "choose_learning_material",
            "read_learning_material",
            "discard_learning_material",
            "create_desktop_oauth_proof",
            "open_desktop_oauth",
            "focus_desktop_after_oauth",
            "begin_learning_notifications",
            "learning_notification_permission",
            "replace_learning_notifications",
            "take_learning_notification_actions",
            "test_learning_notification",
            "open_learning_notification_settings",
            "open_desktop_settings",
            "close_desktop_settings",
            "open_desktop_workspace",
            "complete_desktop_model_intake",
            "set_desktop_appearance",
            "request_settings_notification_refresh",
            "complete_settings_notification_refresh",
            "voice_capability",
            "voice_start",
            "voice_stop",
            "voice_cancel",
        ]),
    ))
    .expect("desktop build configuration failed");
}
