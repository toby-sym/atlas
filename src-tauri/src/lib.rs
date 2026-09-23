use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use uuid::Uuid;

struct BackendProcess(Mutex<Option<CommandChild>>);

#[derive(Clone, Serialize)]
struct BackendConnection {
    base_url: String,
    token: String,
}

fn free_loopback_port() -> Result<u16, std::io::Error> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

fn backend_answers_with_token(port: u16, token: &str) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}")
            .parse()
            .expect("valid socket address"),
        Duration::from_millis(250),
    ) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let request = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Atlas-Token: {token}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.starts_with("HTTP/1.1 200")
        && response.contains("\"status\":\"ok\"")
}

#[tauri::command]
fn get_backend_connection(connection: State<BackendConnection>) -> BackendConnection {
    connection.inner().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_backend_connection])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let workspace_dir = app_data_dir.join("workspace");
            fs::create_dir_all(&workspace_dir)?;
            let memory_db = app_data_dir.join("memory.db");
            let conversations_db = app_data_dir.join("conversations.db");

            let mut connected = None;
            for _attempt in 0..5 {
                let port = free_loopback_port()?;
                let port_argument = port.to_string();
                let token = Uuid::new_v4().simple().to_string();
                let (receiver, child) = app
                    .shell()
                    .sidecar("atlas-backend")?
                    .args(["--host", "127.0.0.1", "--port", &port_argument])
                    .env(
                        "ATLAS_WORKSPACE",
                        workspace_dir.to_string_lossy().into_owned(),
                    )
                    .env("ATLAS_MEMORY_DB", memory_db.to_string_lossy().into_owned())
                    .env(
                        "ATLAS_CONVERSATIONS_DB",
                        conversations_db.to_string_lossy().into_owned(),
                    )
                    .env("ATLAS_API_TOKEN", &token)
                    .spawn()?;

                let mut receiver = Some(receiver);
                let mut child = Some(child);
                let deadline = Instant::now() + Duration::from_secs(8);
                while Instant::now() < deadline {
                    if backend_answers_with_token(port, &token) {
                        let mut event_receiver = receiver.take().expect("receiver available");
                        let backend_child = child.take().expect("backend child available");
                        tauri::async_runtime::spawn(async move {
                            while let Some(event) = event_receiver.recv().await {
                                if let tauri_plugin_shell::process::CommandEvent::Error(error) =
                                    event
                                {
                                    eprintln!("Backend process error: {error}");
                                }
                            }
                        });
                        connected = Some((port, token, backend_child));
                        break;
                    }
                    thread::sleep(Duration::from_millis(150));
                }
                if connected.is_some() {
                    break;
                }
                if let Some(backend_child) = child {
                    let _ = backend_child.kill();
                }
            }

            let (port, token, child) = connected.ok_or_else(|| {
                std::io::Error::other("Atlas backend did not start after five port attempts")
            })?;
            app.manage(BackendProcess(Mutex::new(Some(child))));
            app.manage(BackendConnection {
                base_url: format!("http://127.0.0.1:{port}"),
                token,
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

#[cfg(test)]
mod tests {
    use super::free_loopback_port;
    use std::net::TcpListener;

    #[test]
    fn chooses_an_available_loopback_port_while_default_port_is_occupied() {
        let Ok(_occupied_default_port) = TcpListener::bind(("127.0.0.1", 8000)) else {
            // Another local service already owns 8000; dynamic selection remains valid.
            let port = free_loopback_port().expect("an ephemeral loopback port is available");
            assert!(TcpListener::bind(("127.0.0.1", port)).is_ok());
            return;
        };

        let port = free_loopback_port().expect("an ephemeral loopback port is available");
        assert_ne!(port, 8000);
        assert!(TcpListener::bind(("127.0.0.1", port)).is_ok());
    }
}
