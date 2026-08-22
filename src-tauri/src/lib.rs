use std::{fs, sync::Mutex};
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let workspace_dir = app_data_dir.join("workspace");
            fs::create_dir_all(&workspace_dir)?;
            let (mut receiver, child) = app
                .shell()
                .sidecar("atlas-backend")?
                .args(["--host", "127.0.0.1", "--port", "8000"])
                .env(
                    "ATLAS_WORKSPACE",
                    workspace_dir.to_string_lossy().into_owned(),
                )
                .env(
                    "ATLAS_MEMORY_DB",
                    app_data_dir
                        .join("memory.db")
                        .to_string_lossy()
                        .into_owned(),
                )
                .spawn()?;

            app.manage(BackendProcess(Mutex::new(Some(child))));
            tauri::async_runtime::spawn(async move {
                while let Some(event) = receiver.recv().await {
                    if let tauri_plugin_shell::process::CommandEvent::Error(error) = event {
                        eprintln!("Backend process error: {error}");
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Atlas")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(process) = app.try_state::<BackendProcess>() {
                    if let Some(child) = process.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
