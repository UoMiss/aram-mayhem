pub mod client;
pub mod connection;
pub mod discovery;
pub mod error;
pub mod models;
pub mod monitor;

pub use monitor::SystemLcuManager;

/// Tauri event name shared with the frontend.
pub const LCU_STATUS_EVENT: &str = "lcu://connection-status";
