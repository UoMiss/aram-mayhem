use crate::lcu::error::LcuError;
use std::fmt;
use std::path::PathBuf;

/// Parsed League Client lockfile. The password is never serialized or printed.
#[allow(dead_code)]
#[derive(Clone, PartialEq, Eq)]
pub struct LcuLockfile {
    pub name: String,
    pub pid: u32,
    pub port: u16,
    pub password: String,
    pub protocol: String,
}

impl fmt::Debug for LcuLockfile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LcuLockfile")
            .field("name", &self.name)
            .field("pid", &self.pid)
            .field("port", &self.port)
            .field("protocol", &self.protocol)
            .field("password", &"[REDACTED]")
            .finish()
    }
}

#[allow(dead_code)]
impl LcuLockfile {
    /// lockfile format: name:pid:port:password:protocol
    pub fn parse(raw: &str) -> Result<Self, LcuError> {
        let mut parts = raw.trim().splitn(5, ':');
        let name = parts.next().unwrap_or_default().trim();
        let pid_raw = parts.next().unwrap_or_default().trim();
        let port_raw = parts.next().unwrap_or_default().trim();
        let password = parts.next().unwrap_or_default().trim();
        let protocol = parts.next().unwrap_or_default().trim();

        if name.is_empty() {
            return Err(LcuError::invalid_lockfile("lockfile name is empty"));
        }
        if password.is_empty() {
            return Err(LcuError::invalid_lockfile("lockfile password is empty"));
        }
        if protocol != "https" {
            return Err(LcuError::invalid_lockfile(
                "lockfile protocol must be https",
            ));
        }

        let pid = pid_raw
            .parse::<u32>()
            .map_err(|_| LcuError::invalid_lockfile("lockfile pid is invalid"))?;
        let port = port_raw
            .parse::<u16>()
            .map_err(|_| LcuError::invalid_lockfile("lockfile port is invalid"))?;

        if pid == 0 {
            return Err(LcuError::invalid_lockfile("lockfile pid is zero"));
        }
        if port == 0 {
            return Err(LcuError::invalid_lockfile("lockfile port is zero"));
        }

        Ok(Self {
            name: name.to_string(),
            pid,
            port,
            password: password.to_string(),
            protocol: protocol.to_string(),
        })
    }

    pub fn validate_process(&self, process_pid: u32) -> Result<(), LcuError> {
        if self.pid != process_pid {
            return Err(LcuError::invalid_lockfile(
                "lockfile does not match the League client process",
            ));
        }
        Ok(())
    }
}

/// Credentials parsed from a single League client process command line.
/// The token is intentionally not Debug/Serialize; errors never include it.
#[allow(dead_code)]
#[derive(Clone, PartialEq, Eq)]
pub struct LcuProcessCredentials {
    pub port: u16,
    pub password: String,
    pub install_dir: Option<PathBuf>,
}

impl fmt::Debug for LcuProcessCredentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LcuProcessCredentials")
            .field("port", &self.port)
            .field("install_dir", &self.install_dir)
            .field("password", &"[REDACTED]")
            .finish()
    }
}

#[allow(dead_code)]
impl LcuProcessCredentials {
    /// Parse only a pair from the same command line. Missing/partial credentials are rejected.
    pub fn parse(args: &[std::ffi::OsString]) -> Option<Self> {
        let mut port = None;
        let mut token = None;
        let mut install_dir = None;
        let mut index = 0;
        while index < args.len() {
            let arg = args[index].to_string_lossy();
            let (key, inline) = match arg.split_once('=') {
                Some((key, value)) => (key, Some(value.to_string())),
                None => (arg.as_ref(), None),
            };
            let value = if let Some(value) = inline {
                Some(value)
            } else if index + 1 < args.len() && !args[index + 1].to_string_lossy().starts_with("--")
            {
                index += 1;
                Some(args[index].to_string_lossy().into_owned())
            } else {
                None
            };
            match key {
                "--app-port" => port = value.and_then(|value| value.parse::<u16>().ok()),
                "--remoting-auth-token" => token = value,
                "--install-directory" => {
                    install_dir = value
                        .filter(|value| !value.trim().is_empty())
                        .map(PathBuf::from)
                }
                _ => {}
            }
            index += 1;
        }

        let port = port?;
        let password = token?;
        if port == 0
            || password.is_empty()
            || password
                .chars()
                .any(|value| value.is_control() || value.is_whitespace())
        {
            return None;
        }
        Some(Self {
            port,
            password,
            install_dir,
        })
    }
}

/// A validated, loopback-only LCU endpoint. Never derives Serialize/Debug with credentials.
#[derive(Clone, PartialEq, Eq)]
pub struct LcuClient {
    pub name: String,
    pub pid: u32,
    pub port: u16,
    password: String,
}

impl fmt::Debug for LcuClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LcuClient")
            .field("name", &self.name)
            .field("pid", &self.pid)
            .field("port", &self.port)
            .field("password", &"[REDACTED]")
            .finish()
    }
}

impl LcuClient {
    #[allow(dead_code)]
    pub fn from_lockfile(lockfile: LcuLockfile) -> Result<Self, LcuError> {
        if lockfile.protocol != "https" {
            return Err(LcuError::invalid_lockfile(
                "only the loopback HTTPS LCU endpoint is supported",
            ));
        }
        if lockfile.port == 0 {
            return Err(LcuError::invalid_lockfile("LCU port is zero"));
        }
        if lockfile.password.is_empty() {
            return Err(LcuError::invalid_lockfile("LCU password is empty"));
        }

        Ok(Self {
            name: lockfile.name,
            pid: lockfile.pid,
            port: lockfile.port,
            password: lockfile.password,
        })
    }

    /// Build a client from credentials that were parsed from this exact process.
    #[allow(dead_code)]
    pub fn from_process(
        name: impl Into<String>,
        pid: u32,
        credentials: LcuProcessCredentials,
    ) -> Result<Self, LcuError> {
        if pid == 0 {
            return Err(LcuError::discovery_failed("League client pid is zero"));
        }
        if credentials.port == 0 {
            return Err(LcuError::invalid_lockfile("LCU port is zero"));
        }
        if credentials.password.is_empty() {
            return Err(LcuError::invalid_lockfile("LCU password is empty"));
        }
        Ok(Self {
            name: name.into(),
            pid,
            port: credentials.port,
            password: credentials.password,
        })
    }

    /// Always loopback; never take a hostname from an untrusted lockfile.
    pub fn endpoint(&self) -> String {
        format!("https://127.0.0.1:{}", self.port)
    }

    pub(crate) fn password(&self) -> &str {
        &self.password
    }

    /// Safe identity for reconnect detection; excludes credentials.
    pub fn fingerprint(&self) -> String {
        format!("{}:{}:{}", self.pid, self.port, self.name)
    }
}

/// Discover the local League client. Non-Windows platforms are explicitly unsupported.
pub fn discover() -> Result<Option<LcuClient>, LcuError> {
    #[cfg(windows)]
    {
        discover_windows()
    }
    #[cfg(not(windows))]
    {
        Err(LcuError::unsupported_platform())
    }
}

#[cfg(windows)]
fn discover_windows() -> Result<Option<LcuClient>, LcuError> {
    use sysinfo::{ProcessesToUpdate, System};

    let mut system = System::new_all().map_err(|_| {
        LcuError::discovery_failed("failed to initialize Windows process discovery")
    })?;
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut ux_processes = Vec::new();
    let mut client_processes = Vec::new();
    for process in system.processes().values() {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        if name.starts_with("leagueclientux") {
            ux_processes.push(process);
        } else if name.starts_with("leagueclient") {
            client_processes.push(process);
        }
    }

    // Process command lines are preferred. Credentials are accepted only as a pair
    // from the same process, and the PID/name recorded on the client is that process.
    if let Some(client) = discover_from_args(&ux_processes)? {
        return Ok(Some(client));
    }
    if let Some(client) = discover_from_args(&client_processes)? {
        return Ok(Some(client));
    }

    // Lockfile is only a fallback. Shared-read handles the client's active writer;
    // empty/contended content is never treated as a valid credential pair.
    if let Some(client) = discover_from_lockfiles(&ux_processes)? {
        return Ok(Some(client));
    }
    if let Some(client) = discover_from_lockfiles(&client_processes)? {
        return Ok(Some(client));
    }

    if ux_processes.is_empty() && client_processes.is_empty() {
        Ok(None)
    } else {
        Err(LcuError::discovery_failed(
            "League client is running but LCU credentials were not found",
        ))
    }
}

#[cfg(windows)]
fn discover_from_args(processes: &[&sysinfo::Process]) -> Result<Option<LcuClient>, LcuError> {
    let mut candidates = Vec::new();
    for process in processes {
        let Some(credentials) = LcuProcessCredentials::parse(process.cmd()) else {
            continue;
        };
        let name = process.name().to_string_lossy().to_string();
        let pid = process.pid().as_u32();
        println!(
            "[lcu_discovery] source=args pid={} process={} port_present=true token_present=true",
            pid, name
        );
        candidates.push(LcuClient::from_process(name, pid, credentials)?);
    }

    match candidates.len() {
        0 => Ok(None),
        1 => Ok(candidates.pop()),
        _ => Err(LcuError::discovery_failed(
            "multiple League client instances expose LCU credentials",
        )),
    }
}

#[cfg(windows)]
fn discover_from_lockfiles(processes: &[&sysinfo::Process]) -> Result<Option<LcuClient>, LcuError> {
    use std::collections::HashSet;

    let mut seen_dirs = HashSet::new();
    let mut candidates = Vec::new();
    for process in processes {
        let Some(install_dir) = install_directory(process) else {
            continue;
        };
        // LeagueClient.exe and LeagueClientUx.exe normally share one install directory.
        // Do not read the same lockfile twice and turn one instance into two candidates.
        if !seen_dirs.insert(install_dir.clone()) {
            continue;
        }
        let lock_path = install_dir.join("lockfile");
        let raw = match read_lockfile_shared(&lock_path) {
            Ok(raw) => raw,
            Err(error) => {
                println!(
                    "[lcu_discovery] source=lockfile pid={} result={}",
                    process.pid().as_u32(),
                    error.code
                );
                continue;
            }
        };
        let lockfile = match LcuLockfile::parse(&raw) {
            Ok(lockfile) => lockfile,
            Err(error) => {
                println!(
                    "[lcu_discovery] source=lockfile pid={} result={}",
                    process.pid().as_u32(),
                    error.code
                );
                continue;
            }
        };
        if let Err(error) = lockfile.validate_process(process.pid().as_u32()) {
            println!(
                "[lcu_discovery] source=lockfile pid={} result={}",
                process.pid().as_u32(),
                error.code
            );
            continue;
        }
        println!(
            "[lcu_discovery] source=lockfile pid={} port_present=true token_present=true",
            process.pid().as_u32()
        );
        candidates.push(LcuClient::from_lockfile(lockfile)?);
    }

    match candidates.len() {
        0 => Ok(None),
        1 => Ok(candidates.pop()),
        _ => Err(LcuError::discovery_failed(
            "multiple League client instances are running",
        )),
    }
}

#[cfg(windows)]
fn read_lockfile_shared(path: &std::path::Path) -> Result<String, LcuError> {
    use std::io::Read;
    use std::os::windows::fs::OpenOptionsExt;
    use std::time::Duration;

    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;
    const FILE_SHARE_DELETE: u32 = 0x0000_0004;

    let mut last_error = None;
    for attempt in 0..3 {
        let file = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .open(path);
        match file {
            Ok(mut file) => {
                let mut raw = String::new();
                if let Err(error) = file.read_to_string(&mut raw) {
                    last_error = Some(error.kind());
                } else if raw.trim().is_empty() {
                    last_error = None;
                } else {
                    return Ok(raw);
                }
            }
            Err(error) => last_error = Some(error.kind()),
        }
        if attempt < 2 {
            std::thread::sleep(Duration::from_millis(25));
        }
    }
    Err(LcuError::discovery_failed(match last_error {
        Some(_) => "League client lockfile is unreadable or empty",
        None => "League client lockfile is empty",
    }))
}

#[cfg(windows)]
fn install_directory(process: &sysinfo::Process) -> Option<PathBuf> {
    if let Some(dir) = process.exe().and_then(|exe| exe.parent()) {
        return Some(dir.to_path_buf());
    }

    let args = process.cmd();
    for (index, argument) in args.iter().enumerate() {
        let argument = argument.to_string_lossy();
        let value = if let Some(value) = argument.strip_prefix("--install-directory=") {
            Some(value.to_string())
        } else if argument == "--install-directory" {
            args.get(index + 1)
                .map(|next| next.to_string_lossy().into_owned())
        } else {
            None
        };
        if let Some(value) = value {
            let value = value.trim_matches('"');
            if !value.is_empty() {
                return Some(PathBuf::from(value));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::error::LcuErrorCode;

    fn valid_lockfile(port: u16, password: &str) -> String {
        format!("LeagueClientUx:4242:{port}:{password}:https")
    }

    #[test]
    fn parses_valid_lockfile_and_builds_loopback_endpoint() {
        let lockfile =
            LcuLockfile::parse(&valid_lockfile(54321, "s3cret")).expect("valid lockfile");
        assert_eq!(lockfile.name, "LeagueClientUx");
        assert_eq!(lockfile.pid, 4242);
        assert_eq!(lockfile.port, 54321);
        assert_eq!(lockfile.protocol, "https");

        let client = LcuClient::from_lockfile(lockfile).expect("valid client");
        assert_eq!(client.endpoint(), "https://127.0.0.1:54321");
        assert_eq!(client.password(), "s3cret");
        assert_eq!(client.fingerprint(), "4242:54321:LeagueClientUx");
    }

    #[test]
    fn debug_output_redacts_the_password() {
        let lockfile =
            LcuLockfile::parse(&valid_lockfile(54321, "s3cret")).expect("valid lockfile");
        let debug = format!("{lockfile:?}");
        assert!(!debug.contains("s3cret"));
        assert!(debug.contains("[REDACTED]"));

        let client = LcuClient::from_lockfile(lockfile).expect("valid client");
        let client_debug = format!("{client:?}");
        assert!(!client_debug.contains("s3cret"));
    }

    #[test]
    fn rejects_invalid_lockfile_fields() {
        for invalid in [
            "",
            "LeagueClientUx:abc:54321:pw:https",
            "LeagueClientUx:4242:0:pw:https",
            "LeagueClientUx:4242:54321::https",
            "LeagueClientUx:4242:54321:pw:http",
            ":4242:54321:pw:https",
        ] {
            assert!(LcuLockfile::parse(invalid).is_err(), "accepted {invalid:?}");
        }
    }

    #[test]
    fn rejects_pid_mismatch() {
        let lockfile = LcuLockfile::parse(&valid_lockfile(54321, "pw")).expect("valid lockfile");
        assert!(lockfile.validate_process(9999).is_err());
        assert!(lockfile.validate_process(4242).is_ok());
    }

    fn args(values: &[&str]) -> Vec<std::ffi::OsString> {
        values.iter().map(std::ffi::OsString::from).collect()
    }

    #[test]
    fn parses_process_args_in_both_value_forms() {
        let equals = LcuProcessCredentials::parse(&args(&[
            "LeagueClientUx.exe",
            "--app-port=54321",
            "--remoting-auth-token=secret-token",
            "--install-directory=C:\\Riot Games\\League of Legends",
        ]))
        .expect("equals form");
        assert_eq!(equals.port, 54321);
        assert_eq!(equals.password, "secret-token");
        assert_eq!(
            equals.install_dir.as_deref(),
            Some(std::path::Path::new("C:\\Riot Games\\League of Legends"))
        );

        let separate = LcuProcessCredentials::parse(&args(&[
            "LeagueClientUx.exe",
            "--app-port",
            "54321",
            "--remoting-auth-token",
            "secret-token",
        ]))
        .expect("separate form");
        assert_eq!(separate.port, 54321);
        assert_eq!(separate.password, "secret-token");
    }

    #[test]
    fn accepts_base64_padding_in_token_but_rejects_bad_pairs() {
        let padded = LcuProcessCredentials::parse(&args(&[
            "--app-port=12345",
            "--remoting-auth-token=abc-_==",
        ]))
        .expect("padded token");
        assert_eq!(padded.password, "abc-_==");

        for invalid in [
            vec!["--app-port=12345"],
            vec!["--remoting-auth-token=token"],
            vec!["--app-port=0", "--remoting-auth-token=token"],
            vec!["--app-port=70000", "--remoting-auth-token=token"],
            vec!["--app-port=12345", "--remoting-auth-token="],
            vec!["--app-port=12345", "--remoting-auth-token=a b"],
            vec!["--app-port=12345", "--remoting-auth-token=a\u{0007}b"],
        ] {
            assert!(
                LcuProcessCredentials::parse(&args(&invalid)).is_none(),
                "accepted {invalid:?}"
            );
        }
    }

    #[test]
    fn process_credentials_are_redacted_and_bound_to_pid_and_port() {
        let credentials = LcuProcessCredentials::parse(&args(&[
            "--app-port=54321",
            "--remoting-auth-token=s3cret",
        ]))
        .expect("credentials");
        let first = LcuClient::from_process("LeagueClientUx.exe", 4242, credentials.clone())
            .expect("client");
        let other_pid = LcuClient::from_process("LeagueClientUx.exe", 4243, credentials.clone())
            .expect("client");
        let other_port = LcuClient::from_process(
            "LeagueClientUx.exe",
            4242,
            LcuProcessCredentials::parse(&args(&[
                "--app-port=54322",
                "--remoting-auth-token=s3cret",
            ]))
            .expect("credentials"),
        )
        .expect("client");

        assert_eq!(first.fingerprint(), "4242:54321:LeagueClientUx.exe");
        assert_ne!(first.fingerprint(), other_pid.fingerprint());
        assert_ne!(first.fingerprint(), other_port.fingerprint());
        assert!(!format!("{credentials:?}").contains("s3cret"));
        assert!(!format!("{first:?}").contains("s3cret"));
        assert_eq!(first.password(), "s3cret");
    }

    #[cfg(windows)]
    #[test]
    fn shared_lockfile_read_handles_empty_and_contended_file() {
        use std::os::windows::fs::OpenOptionsExt;
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "aram-lcu-lock-{}-{unique}.lock",
            std::process::id()
        ));

        std::fs::write(&path, "").expect("empty lockfile");
        assert!(read_lockfile_shared(&path).is_err());

        std::fs::write(&path, valid_lockfile(54321, "pw")).expect("lockfile");
        let held = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&path)
            .expect("hold lockfile");
        assert!(read_lockfile_shared(&path).is_err());
        drop(held);

        let raw = read_lockfile_shared(&path).expect("shared read");
        assert!(raw.starts_with("LeagueClientUx:"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn non_windows_discovery_is_explicitly_unsupported() {
        if cfg!(not(windows)) {
            let error = discover().expect_err("must be unsupported on macOS");
            assert_eq!(error.code, LcuErrorCode::UnsupportedPlatform.as_str());
            assert!(!error.message.contains("password"));
        }
    }
}
