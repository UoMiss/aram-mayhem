pub mod champ_select;
pub mod client;
pub mod connection;
pub mod discovery;
pub mod error;
pub mod gameflow;
pub mod gameflow_events;
pub mod gameflow_monitor;
pub mod history;
pub mod lobby;
pub mod models;
pub mod monitor;

pub use monitor::SystemLcuManager;

/// Tauri event name shared with the frontend.
pub const LCU_STATUS_EVENT: &str = "lcu://connection-status";
pub mod home;
pub mod participants;
pub mod settlement;
