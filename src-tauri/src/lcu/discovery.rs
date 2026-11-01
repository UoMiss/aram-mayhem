use crate::lcu::error::LcuError;
use std::fmt;
#[cfg(windows)]
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
    use std::fs;
    use sysinfo::{ProcessesToUpdate, System};

    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut candidates = Vec::new();
    for process in system.processes().values() {
        let name = process.name().to_string_lossy();
        if !name.eq_ignore_ascii_case("LeagueClientUx.exe")
            && !name.eq_ignore_ascii_case("LeagueClientUx")
        {
            continue;
        }

        let Some(install_dir) = install_directory(process) else {
            continue;
        };
        let lock_path = install_dir.join("lockfile");
        let raw = fs::read_to_string(&lock_path)
            .map_err(|_| LcuError::discovery_failed("League client lockfile is unreadable"))?;
        let lockfile = LcuLockfile::parse(&raw)?;
        lockfile.validate_process(process.pid().as_u32())?;
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
fn install_directory(process: &sysinfo::Process) -> Option<PathBuf> {
    if let Some(dir) = process.exe().and_then(|exe| exe.parent()) {
        return Some(dir.to_path_buf());
    }

    for argument in process.cmd() {
        let argument = argument.to_string_lossy();
        if let Some(value) = argument.strip_prefix("--install-directory=") {
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

    #[test]
    fn non_windows_discovery_is_explicitly_unsupported() {
        if cfg!(not(windows)) {
            let error = discover().expect_err("must be unsupported on macOS");
            assert_eq!(error.code, LcuErrorCode::UnsupportedPlatform.as_str());
            assert!(!error.message.contains("password"));
        }
    }
}
