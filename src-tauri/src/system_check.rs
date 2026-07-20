use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(target_os = "windows")]
use std::process::Command;
use sysinfo::{Disks, System};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCheckResult {
    pub operating_system: Option<String>,
    pub operating_system_version: Option<String>,
    pub architecture: String,
    pub cpu_name: Option<String>,
    pub logical_cpu_count: usize,
    pub total_memory_bytes: Option<u64>,
    pub available_memory_bytes: Option<u64>,
    pub gpu_names: Vec<String>,
    pub data_disk_available_bytes: Option<u64>,
    pub unavailable_fields: Vec<SystemCheckField>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SystemCheckField {
    OperatingSystem,
    OperatingSystemVersion,
    CpuName,
    TotalMemory,
    AvailableMemory,
    GpuInformation,
    DataDiskAvailable,
}

pub fn collect_system_check(data_path: &Path) -> Result<SystemCheckResult, String> {
    let mut system = System::new_all();
    system.refresh_all();

    let operating_system = System::name().map(clean_value);
    let operating_system_version = System::os_version().map(clean_value);
    let architecture = std::env::consts::ARCH.to_string();
    let cpu_name = system
        .cpus()
        .first()
        .map(|cpu| clean_value(cpu.brand().to_string()))
        .filter(|value| !value.is_empty());
    let logical_cpu_count = system.cpus().len();
    let total_memory_bytes = nonzero_bytes(system.total_memory());
    let available_memory_bytes = nonzero_bytes(system.available_memory());
    let gpu_names = detect_gpu_names();
    let data_disk_available_bytes = available_disk_space_for_path(data_path);

    let mut unavailable_fields = Vec::new();
    push_if_none(
        &mut unavailable_fields,
        SystemCheckField::OperatingSystem,
        &operating_system,
    );
    push_if_none(
        &mut unavailable_fields,
        SystemCheckField::OperatingSystemVersion,
        &operating_system_version,
    );
    push_if_none(
        &mut unavailable_fields,
        SystemCheckField::CpuName,
        &cpu_name,
    );
    push_if_none(
        &mut unavailable_fields,
        SystemCheckField::TotalMemory,
        &total_memory_bytes,
    );
    push_if_none(
        &mut unavailable_fields,
        SystemCheckField::AvailableMemory,
        &available_memory_bytes,
    );
    if gpu_names.is_empty() {
        unavailable_fields.push(SystemCheckField::GpuInformation);
    }
    push_if_none(
        &mut unavailable_fields,
        SystemCheckField::DataDiskAvailable,
        &data_disk_available_bytes,
    );

    Ok(SystemCheckResult {
        operating_system,
        operating_system_version,
        architecture,
        cpu_name,
        logical_cpu_count,
        total_memory_bytes,
        available_memory_bytes,
        gpu_names,
        data_disk_available_bytes,
        unavailable_fields,
    })
}

fn push_if_none<T>(fields: &mut Vec<SystemCheckField>, field: SystemCheckField, value: &Option<T>) {
    if value.is_none() {
        fields.push(field);
    }
}

fn nonzero_bytes(value: u64) -> Option<u64> {
    Some(value).filter(|bytes| *bytes > 0)
}

fn clean_value(value: String) -> String {
    value.trim().replace('\0', "")
}

fn available_disk_space_for_path(data_path: &Path) -> Option<u64> {
    let canonical_data_path = data_path
        .canonicalize()
        .unwrap_or_else(|_| data_path.to_path_buf());
    let disks = Disks::new_with_refreshed_list();

    disks
        .iter()
        .filter(|disk| canonical_data_path.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| disk.available_space())
}

#[cfg(target_os = "windows")]
fn detect_gpu_names() -> Vec<String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
        ])
        .output();

    match output {
        Ok(output) if output.status.success() => {
            parse_gpu_names(&String::from_utf8_lossy(&output.stdout))
        }
        _ => Vec::new(),
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_gpu_names() -> Vec<String> {
    Vec::new()
}

fn parse_gpu_names(output: &str) -> Vec<String> {
    output
        .lines()
        .map(|line| clean_value(line.to_string()))
        .filter(|line| !line.is_empty())
        .filter(|line| !contains_sensitive_identifier(line))
        .collect()
}

fn contains_sensitive_identifier(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "serial",
        "uuid",
        "mac address",
        "ip address",
        "device id",
        "pnpdeviceid",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_structured_system_check_result() {
        let result = SystemCheckResult {
            operating_system: Some("Windows".to_string()),
            operating_system_version: Some("11".to_string()),
            architecture: "x86_64".to_string(),
            cpu_name: Some("A very normal CPU".to_string()),
            logical_cpu_count: 16,
            total_memory_bytes: Some(32 * 1024 * 1024 * 1024),
            available_memory_bytes: Some(18 * 1024 * 1024 * 1024),
            gpu_names: vec!["Local GPU".to_string()],
            data_disk_available_bytes: Some(120 * 1024 * 1024 * 1024),
            unavailable_fields: Vec::new(),
        };

        let json = serde_json::to_string(&result).expect("serializes");

        assert!(json.contains("operatingSystem"));
        assert!(json.contains("logicalCpuCount"));
        assert!(!json.contains("serial"));
        assert!(!json.contains("macAddress"));
    }

    #[test]
    fn partial_result_can_mark_missing_gpu_information() {
        let result = SystemCheckResult {
            operating_system: Some("Windows".to_string()),
            operating_system_version: Some("11".to_string()),
            architecture: "x86_64".to_string(),
            cpu_name: Some("CPU".to_string()),
            logical_cpu_count: 8,
            total_memory_bytes: Some(16),
            available_memory_bytes: Some(8),
            gpu_names: Vec::new(),
            data_disk_available_bytes: Some(100),
            unavailable_fields: vec![SystemCheckField::GpuInformation],
        };

        assert!(result
            .unavailable_fields
            .contains(&SystemCheckField::GpuInformation));
    }

    #[test]
    fn gpu_parser_excludes_sensitive_identifiers() {
        let names = parse_gpu_names(
            "
            NVIDIA Example
            Device ID: PCI\\VEN_1234
            Serial Number: hidden
            AMD Example
            ",
        );

        assert_eq!(names, vec!["NVIDIA Example", "AMD Example"]);
    }

    #[test]
    fn collector_returns_local_contract_without_sensitive_identifiers() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let result = collect_system_check(temp_dir.path()).expect("system check succeeds");
        let json = serde_json::to_string(&result).expect("serializes");
        let lower = json.to_ascii_lowercase();

        assert!(!result.architecture.is_empty());
        assert!(!lower.contains("serial"));
        assert!(!lower.contains("mac address"));
        assert!(!lower.contains("ip address"));
        assert!(!lower.contains("device id"));
        assert!(!lower.contains("pnpdeviceid"));
    }
}
