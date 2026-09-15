use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;

const MAX_DOWNLOAD_BYTES: usize = 32 * 1024 * 1024;
const MAX_FIRMWARE_BYTES: usize = 8 * 1024 * 1024;
const UF2_BLOCK_BYTES: usize = 512;
const UF2_MAGIC_START0: u32 = 0x0a32_4655;
const UF2_MAGIC_START1: u32 = 0x9e5d_5157;
const UF2_MAGIC_END: u32 = 0x0ab1_6f30;
const UF2_FLAG_FAMILY_ID: u32 = 0x0000_2000;

#[derive(Clone)]
struct PreparedFirmware {
    file_name: String,
    bytes: Vec<u8>,
}

#[derive(Default)]
pub struct FirmwareState {
    prepared: Mutex<HashMap<String, PreparedFirmware>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareRequest {
    url: String,
    file_name: String,
    sha256: String,
    family_id: u32,
    expected_size: usize,
    archive_entry_pattern: Option<String>,
}

#[derive(Serialize)]
pub struct PrepareResult {
    token: String,
    size: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRequest {
    token: String,
    volume_labels: Vec<String>,
    timeout_ms: u64,
}

fn read_u32(block: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(
        block[offset..offset + 4]
            .try_into()
            .expect("four-byte field"),
    )
}

fn validate_uf2(bytes: &[u8], expected_family: u32) -> Result<(), String> {
    if bytes.is_empty() || !bytes.len().is_multiple_of(UF2_BLOCK_BYTES) {
        return Err("Downloaded image is not a complete UF2 file".into());
    }
    let block_count = bytes.len() / UF2_BLOCK_BYTES;
    for (index, block) in bytes.chunks_exact(UF2_BLOCK_BYTES).enumerate() {
        if read_u32(block, 0) != UF2_MAGIC_START0
            || read_u32(block, 4) != UF2_MAGIC_START1
            || read_u32(block, 508) != UF2_MAGIC_END
        {
            return Err(format!("UF2 block {index} has invalid framing"));
        }
        if read_u32(block, 8) & UF2_FLAG_FAMILY_ID == 0 {
            return Err(format!("UF2 block {index} does not declare a family ID"));
        }
        let family = read_u32(block, 28);
        if family != expected_family {
            return Err(format!(
                "UF2 family mismatch in block {index}: expected {expected_family:#010x}, got {family:#010x}"
            ));
        }
        if read_u32(block, 20) as usize != index || read_u32(block, 24) as usize != block_count {
            return Err(format!("UF2 block {index} has an inconsistent block index"));
        }
    }
    Ok(())
}

fn valid_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name.ends_with(".uf2")
        && !name.contains(['/', '\\'])
        && Path::new(name).file_name().is_some_and(|part| part == name)
}

fn valid_asset_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && !name.contains(['/', '\\'])
        && Path::new(name).file_name().is_some_and(|part| part == name)
}

fn extract_archive_entry(bytes: Vec<u8>, pattern: &str) -> Result<(String, Vec<u8>), String> {
    let pattern = regex::Regex::new(pattern)
        .map_err(|error| format!("Invalid firmware archive entry pattern: {error}"))?;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("Firmware asset is not a readable ZIP archive: {error}"))?;
    let matches: Vec<usize> = (0..archive.len())
        .filter(|index| {
            archive
                .by_index(*index)
                .is_ok_and(|entry| !entry.is_dir() && pattern.is_match(entry.name()))
        })
        .collect();
    if matches.len() != 1 {
        return Err(format!(
            "Firmware archive has {} matching entries; expected one",
            matches.len()
        ));
    }
    let mut entry = archive
        .by_index(matches[0])
        .map_err(|error| format!("Could not open firmware archive entry: {error}"))?;
    if entry.size() > MAX_FIRMWARE_BYTES as u64 {
        return Err("Firmware archive entry exceeds the size limit".into());
    }
    let file_name = Path::new(entry.name())
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Firmware archive entry has an invalid file name".to_string())?
        .to_string();
    if !valid_file_name(&file_name) {
        return Err("Firmware archive entry has an unsafe file name".into());
    }
    let mut firmware = Vec::with_capacity(entry.size() as usize);
    entry
        .by_ref()
        .take(MAX_FIRMWARE_BYTES as u64 + 1)
        .read_to_end(&mut firmware)
        .map_err(|error| format!("Could not read firmware archive entry: {error}"))?;
    if firmware.len() > MAX_FIRMWARE_BYTES {
        return Err("Firmware archive entry exceeds the size limit".into());
    }
    Ok((file_name, firmware))
}

fn valid_volume_label(label: &str) -> bool {
    !label.is_empty()
        && label.len() <= 32
        && label
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[tauri::command(async)]
pub async fn firmware_prepare(
    state: State<'_, FirmwareState>,
    request: PrepareRequest,
) -> Result<PrepareResult, String> {
    if !valid_asset_name(&request.file_name) {
        return Err("Firmware release asset has an unsafe file name".into());
    }
    if request.archive_entry_pattern.is_none() && !valid_file_name(&request.file_name) {
        return Err("Firmware asset is not a UF2 file".into());
    }
    if request.expected_size == 0 || request.expected_size > MAX_DOWNLOAD_BYTES {
        return Err("Firmware asset size is outside the supported range".into());
    }
    if !request.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) || request.sha256.len() != 64 {
        return Err("Firmware asset has an invalid SHA-256 digest".into());
    }
    let url = reqwest::Url::parse(&request.url)
        .map_err(|error| format!("Invalid firmware download URL: {error}"))?;
    if url.scheme() != "https" {
        return Err("Firmware downloads must use HTTPS".into());
    }

    let mut response = reqwest::get(url)
        .await
        .map_err(|error| format!("Firmware download failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Firmware download failed: {error}"))?;
    if response
        .content_length()
        .is_some_and(|size| size > MAX_DOWNLOAD_BYTES as u64)
    {
        return Err("Firmware download exceeds the size limit".into());
    }
    let mut bytes = Vec::with_capacity(request.expected_size);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Firmware download failed: {error}"))?
    {
        if bytes.len() + chunk.len() > MAX_DOWNLOAD_BYTES {
            return Err("Firmware download exceeds the size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.len() != request.expected_size {
        return Err(format!(
            "Firmware size mismatch: expected {}, downloaded {} bytes",
            request.expected_size,
            bytes.len()
        ));
    }

    let actual = format!("{:x}", Sha256::digest(&bytes));
    if actual != request.sha256.to_ascii_lowercase() {
        return Err("Firmware SHA-256 digest does not match the release metadata".into());
    }
    let (file_name, bytes) = match request.archive_entry_pattern {
        Some(pattern) => extract_archive_entry(bytes, &pattern)?,
        None => (request.file_name, bytes),
    };
    validate_uf2(&bytes, request.family_id)?;

    let token = actual;
    state
        .prepared
        .lock()
        .map_err(|_| "Firmware staging lock is poisoned".to_string())?
        .insert(token.clone(), PreparedFirmware { file_name, bytes });
    Ok(PrepareResult {
        token,
        size: request.expected_size,
    })
}

fn volume_candidates(label: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(user) = std::env::var("USER") {
        paths.push(PathBuf::from("/run/media").join(&user).join(label));
        paths.push(PathBuf::from("/media").join(&user).join(label));
    }
    paths.push(PathBuf::from("/media").join(label));
    paths.push(PathBuf::from("/Volumes").join(label));
    paths
}

fn mounted_volume(labels: &[String]) -> Option<PathBuf> {
    labels
        .iter()
        .flat_map(|label| volume_candidates(label))
        .find(|path| path.join("INFO_UF2.TXT").is_file())
}

fn write_firmware(volume: &Path, firmware: &PreparedFirmware) -> Result<(), String> {
    let destination = volume.join(&firmware.file_name);
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&destination)
        .map_err(|error| format!("Could not open {}: {error}", destination.display()))?;
    file.write_all(&firmware.bytes)
        .map_err(|error| format!("Could not write {}: {error}", destination.display()))?;
    file.sync_all().map_err(|error| {
        format!(
            "Could not finish writing {}: {error}",
            destination.display()
        )
    })?;
    Ok(())
}

#[tauri::command(async)]
pub async fn firmware_install(
    state: State<'_, FirmwareState>,
    request: InstallRequest,
) -> Result<(), String> {
    if request.volume_labels.is_empty()
        || !request
            .volume_labels
            .iter()
            .all(|label| valid_volume_label(label))
    {
        return Err("Firmware target has invalid boot-volume labels".into());
    }
    let firmware = state
        .prepared
        .lock()
        .map_err(|_| "Firmware staging lock is poisoned".to_string())?
        .get(&request.token)
        .cloned()
        .ok_or_else(|| "Prepared firmware is no longer available".to_string())?;

    let deadline = Instant::now() + Duration::from_millis(request.timeout_ms.clamp(1_000, 120_000));
    let volume = loop {
        if let Some(volume) = mounted_volume(&request.volume_labels) {
            break volume;
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "Timed out waiting for UF2 volume {}",
                request.volume_labels.join(" or ")
            ));
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    };

    write_firmware(&volume, &firmware)?;
    state
        .prepared
        .lock()
        .map_err(|_| "Firmware staging lock is poisoned".to_string())?
        .remove(&request.token);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uf2(family: u32, blocks: u32) -> Vec<u8> {
        let mut bytes = vec![0; blocks as usize * UF2_BLOCK_BYTES];
        for index in 0..blocks {
            let block = &mut bytes[index as usize * UF2_BLOCK_BYTES..][..UF2_BLOCK_BYTES];
            block[0..4].copy_from_slice(&UF2_MAGIC_START0.to_le_bytes());
            block[4..8].copy_from_slice(&UF2_MAGIC_START1.to_le_bytes());
            block[8..12].copy_from_slice(&UF2_FLAG_FAMILY_ID.to_le_bytes());
            block[20..24].copy_from_slice(&index.to_le_bytes());
            block[24..28].copy_from_slice(&blocks.to_le_bytes());
            block[28..32].copy_from_slice(&family.to_le_bytes());
            block[508..512].copy_from_slice(&UF2_MAGIC_END.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn accepts_well_formed_expected_family() {
        assert!(validate_uf2(&uf2(0x9807_b007, 2), 0x9807_b007).is_ok());
    }

    #[test]
    fn rejects_wrong_family_and_block_sequence() {
        assert!(validate_uf2(&uf2(0x9808_b007, 1), 0x9807_b007)
            .unwrap_err()
            .contains("family mismatch"));
        let mut bytes = uf2(0x9807_b007, 2);
        bytes[20..24].copy_from_slice(&1_u32.to_le_bytes());
        assert!(validate_uf2(&bytes, 0x9807_b007)
            .unwrap_err()
            .contains("block index"));
    }

    #[test]
    fn constrains_file_names_and_volume_labels() {
        assert!(valid_file_name("board-lh.uf2"));
        assert!(!valid_file_name("../board.uf2"));
        assert!(valid_volume_label("BOARD_LH-BOOT"));
        assert!(!valid_volume_label("../../media"));
    }

    #[test]
    fn extracts_one_safe_archive_entry() {
        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        writer
            .start_file("board-lh.uf2", zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(&uf2(0x9807_b007, 1)).unwrap();
        let bytes = writer.finish().unwrap().into_inner();
        let (name, image) = extract_archive_entry(bytes, "^board-lh\\.uf2$").unwrap();
        assert_eq!(name, "board-lh.uf2");
        assert!(validate_uf2(&image, 0x9807_b007).is_ok());
    }
}
