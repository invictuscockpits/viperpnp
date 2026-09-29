use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};

/// The Java machine server this shell owns, if we spawned one. When a backend
/// is already listening on :8077 (a dev session), we attach to it instead and
/// never kill it.
struct Backend(Mutex<Option<Child>>);

/// Windows canonicalized paths carry a `\\?\` extended-length prefix that
/// Java's classpath wildcard (and some File handling) does not understand.
/// Strip it before handing paths to the JVM.
fn plain(p: &std::path::Path) -> String {
    let s = p.display().to_string();
    s.strip_prefix("\\\\?\\").unwrap_or(&s).to_string()
}

fn backend_listening() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:8077".parse().unwrap(),
        Duration::from_millis(400),
    )
    .is_ok()
}

/// Best-effort POST /api/config/save before shutdown — a restart must never
/// lose calibration (hard-learned rule). Hand-rolled HTTP to avoid a client
/// dependency.
fn save_config_best_effort() {
    if let Ok(mut s) = TcpStream::connect_timeout(
        &"127.0.0.1:8077".parse().unwrap(),
        Duration::from_millis(800),
    ) {
        let _ = s.set_write_timeout(Some(Duration::from_secs(2)));
        let _ = s.set_read_timeout(Some(Duration::from_secs(15)));
        let _ = s.write_all(
            b"POST /api/config/save HTTP/1.1\r\nHost: localhost:8077\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
        let mut buf = Vec::new();
        let _ = s.read_to_end(&mut buf);
    }
}

fn spawn_backend(app: &tauri::AppHandle) -> Option<Child> {
    if backend_listening() {
        // A backend (dev or a previous instance) is already up; use it.
        return None;
    }
    let res = app.path().resource_dir().ok()?;
    let base = res.join("resources");
    let java = base.join("jre").join("bin").join("javaw.exe");
    let backend = base.join("backend");
    let web = base.join("web");
    if !java.exists() || !backend.exists() {
        // Running unbundled (tauri dev without resources): nothing to spawn.
        return None;
    }

    let config = app.path().app_data_dir().ok()?.join("config");
    std::fs::create_dir_all(&config).ok()?;
    let logs = app.path().app_local_data_dir().ok()?.join("logs");
    let _ = std::fs::create_dir_all(&logs);
    let out = std::fs::File::create(logs.join("backend.log")).ok()?;
    let err = std::fs::File::create(logs.join("backend.err.log")).ok()?;

    let mut cmd = Command::new(plain(&java));
    cmd.arg("-cp")
        .arg(format!("{}\\*", plain(&backend)))
        .arg("-Dviper.port=8077")
        .arg("-Dviper.autoconnect=false")
        .arg("-Djava.awt.headless=true")
        .arg(format!("-Dviper.web={}", plain(&web)))
        .arg("--add-opens=java.base/java.lang=ALL-UNNAMED")
        .arg("--add-opens=java.desktop/java.awt=ALL-UNNAMED")
        .arg("--add-opens=java.desktop/java.awt.color=ALL-UNNAMED")
        .arg("org.openpnp.viper.ViperServer")
        .arg(plain(&config))
        .stdout(out)
        .stderr(err);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn().ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let child = spawn_backend(app.handle());
            *app.state::<Backend>().0.lock().unwrap() = child;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let state = app_handle.state::<Backend>();
            let mut guard = state.0.lock().unwrap();
            if let Some(mut child) = guard.take() {
                // Only shut down a backend WE started: save first, then stop.
                save_config_best_effort();
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
