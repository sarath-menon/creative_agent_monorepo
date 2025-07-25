// mod sidecar;
// use sidecar::SidecarManager;

use objc2::runtime::Object;
use objc2_app_kit::{NSColor, NSWindow};

use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager, State, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// #[tauri::command]
// async fn start_sidecar(
//     app: AppHandle,
//     sidecar_manager: State<'_, Arc<SidecarManager>>,
// ) -> Result<(), String> {
//     sidecar_manager.start_sidecar(&app).await
// }

// #[tauri::command]
// async fn stop_sidecar(
//     app: AppHandle,
//     sidecar_manager: State<'_, Arc<SidecarManager>>,
// ) -> Result<(), String> {
//     sidecar_manager.stop_sidecar(&app).await
// }

// #[tauri::command]
// fn sidecar_status(sidecar_manager: State<'_, Arc<SidecarManager>>) -> bool {
//     sidecar_manager.is_running()
// }

// #[tauri::command]
// async fn sidecar_health(sidecar_manager: State<'_, Arc<SidecarManager>>) -> Result<String, String> {
//     sidecar_manager.health_check().await
// }

// #[tauri::command]
// fn sidecar_error(sidecar_manager: State<'_, Arc<SidecarManager>>) -> Option<String> {
//     sidecar_manager.get_error()
// }

// #[tauri::command]
// async fn send_prompt(
//     prompt: String,
//     sidecar_manager: State<'_, Arc<SidecarManager>>,
// ) -> Result<String, String> {
//     sidecar_manager.send_prompt(&prompt).await
// }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // let sidecar_manager = Arc::new(SidecarManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        // .manage(sidecar_manager.clone())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            // start_sidecar,
            // stop_sidecar,
            // sidecar_status,
            // sidecar_health,
            // sidecar_error,
            // send_prompt
        ])
        .setup(move |app| {
            // Create the main window programmatically
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("")
                .inner_size(500.0, 600.0)
                .max_inner_size(500.0, 700.0)
                .min_inner_size(500.0, 600.0);

            // set transparent title bar only when building for macOS
            #[cfg(target_os = "macos")]
            let win_builder = win_builder.title_bar_style(TitleBarStyle::Transparent);

            let window = win_builder.build().unwrap();

            // set background color only when building for macOS
            #[cfg(target_os = "macos")]
            {
                let ns_window = window.ns_window().unwrap();
                unsafe {
                    let bg_color = NSColor::colorWithRed_green_blue_alpha(41.0/ 255.0, 37.0/ 255.0, 36.0/ 255.0, 1.0);
                    let ns_window_ref = &*(ns_window as *const NSWindow);
                    ns_window_ref.setBackgroundColor(Some(&bg_color));
                }
            }

            let app_handle = app.handle().clone();
            // let manager = sidecar_manager.clone();

            // Clone for auto-start
            // let startup_manager = manager.clone();
            let startup_handle = app_handle.clone();

            // Auto-start sidecar on app launch
            // tauri::async_runtime::spawn(async move {
            //     if let Err(e) = startup_manager.start_sidecar(&startup_handle).await {
            //         eprintln!("Failed to auto-start sidecar: {}", e);
            //     }
            // });

            // Set up cleanup handler for app shutdown
            // let cleanup_manager = manager.clone();
            // let cleanup_handle = app_handle.clone();
            // app.listen("tauri://close-requested", move |_| {
            //     let manager = cleanup_manager.clone();
            //     let handle = cleanup_handle.clone();
            //     tauri::async_runtime::spawn(async move {
            //         if let Err(e) = manager.stop_sidecar(&handle).await {
            //             eprintln!("Failed to stop sidecar during cleanup: {}", e);
            //         }
            //     });
            // });

            // Create system tray
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            // let sidecar_status_item =
            //     MenuItem::with_id(app, "sidecar_status", "Sidecar Status", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                app,
                &[&show_item, &hide_item, &quit_item],
            )?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        println!("Quit menu item clicked");
                        app.exit(0);
                    }
                    "show" => {
                        println!("Show menu item clicked");
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        println!("Hide menu item clicked");
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    _ => {
                        println!("Unhandled menu item: {:?}", event.id);
                    }
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        println!("Left click on tray icon");
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => {
                        println!("Double click on tray icon");
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {
                        println!("Unhandled tray event: {:?}", event);
                    }
                })
                .build(app)?;

            // Register global shortcut for window toggle
            #[cfg(desktop)]
            {
                // Use Cmd+Shift+T on macOS, Ctrl+Shift+T on Windows/Linux
                #[cfg(target_os = "macos")]
                let toggle_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyT);
                
                #[cfg(not(target_os = "macos"))]
                let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyT);

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new().with_handler(move |_app, shortcut, event| {
                        if shortcut == &toggle_shortcut {
                            match event.state() {
                                ShortcutState::Pressed => {
                                    println!("Global shortcut pressed - toggling window visibility");
                                    if let Some(window) = _app.get_webview_window("main") {
                                        if window.is_visible().unwrap_or(false) {
                                            let _ = window.hide();
                                        } else {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                }
                                ShortcutState::Released => {
                                    // Handle release if needed
                                }
                            }
                        }
                    })
                    .build(),
                )?;

                app.global_shortcut().register(toggle_shortcut)?;
                println!("Global shortcut registered: Cmd+Shift+T (macOS) / Ctrl+Shift+T (Windows/Linux)");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
