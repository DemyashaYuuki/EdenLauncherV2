//! Client for the EdenWorld skin bridge (the Eden Skin Bridge server plugin).
//!
//! The launcher pairs with one in-game player through a short code that the player confirms while
//! authenticated on the server; the user then confirms the shown player name in the launcher and
//! the server issues a scoped token. The token is stored only in the launcher settings directory,
//! is bound to the endpoint that issued it and is never returned to the frontend. Only HTTPS
//! endpoints are accepted (plain HTTP to a loopback address only in explicit development mode),
//! redirects are not followed and response sizes are limited.

use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures::StreamExt;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use url::Url;
use uuid::Uuid;

use crate::{ErrorKind, State};

const CONFIG_FILE: &str = "bridge.json";
const MAX_RESPONSE_BYTES: usize = 64 * 1024;
const MAX_SKIN_BYTES: usize = 512 * 1024;
const ALLOW_HTTP_ENV: &str = "EDEN_SKIN_BRIDGE_ALLOW_HTTP_LOOPBACK";

#[derive(Serialize, Deserialize, Default, Clone)]
struct BridgeConfig {
    endpoint: Option<String>,
    link: Option<StoredLink>,
}

#[derive(Serialize, Deserialize, Clone)]
struct StoredLink {
    endpoint: String,
    token: String,
    player_uuid: Uuid,
    player_name: String,
    linked_ms: u64,
}

#[derive(Serialize, Debug, Clone)]
pub struct BridgeLink {
    pub player_uuid: Uuid,
    pub player_name: String,
    pub linked_ms: u64,
}

#[derive(Serialize, Debug, Clone)]
pub struct BridgeStatus {
    pub endpoint: Option<String>,
    pub link: Option<BridgeLink>,
    pub pairing: bool,
}

#[derive(Serialize, Debug, Clone, Default)]
pub struct BridgeHealth {
    pub reachable: bool,
    pub service: Option<String>,
    pub version: Option<String>,
    pub auth_adapter: Option<String>,
    pub auth_ready: bool,
    pub skins_ready: bool,
    pub generator_ready: bool,
    pub looks: u32,
    pub message: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct PairStart {
    pub code: String,
    pub expires_in_secs: u64,
    pub command: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PairPhase {
    Pending,
    AwaitingLauncher,
    Confirmed,
    Expired,
    Rejected,
    Cancelled,
}

#[derive(Serialize, Debug, Clone)]
pub struct PairState {
    pub status: PairPhase,
    pub player_uuid: Option<Uuid>,
    pub player_name: Option<String>,
    pub expires_in_secs: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BridgeJobStatus {
    Queued,
    Generating,
    Applying,
    Applied,
    SavedOffline,
    Failed,
    Cancelled,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BridgeJob {
    pub job_id: String,
    pub status: BridgeJobStatus,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub error_code: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BridgeLook {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub has_cape: bool,
}

struct PendingPair {
    endpoint: Url,
    pairing_id: String,
    poll_secret: String,
    expires_at: Instant,
    player: Option<(Uuid, String)>,
}

static PENDING: LazyLock<Mutex<Option<PendingPair>>> =
    LazyLock::new(|| Mutex::new(None));
static CONFIG_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

fn input_error(message: impl Into<String>) -> crate::Error {
    ErrorKind::InputError(message.into()).into()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn allow_http_loopback() -> bool {
    cfg!(debug_assertions)
        || std::env::var(ALLOW_HTTP_ENV).is_ok_and(|value| value == "1")
}

fn is_loopback_host(host: &str) -> bool {
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    bare.eq_ignore_ascii_case("localhost")
        || bare
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback())
}

/// Validates and normalizes a bridge endpoint (always ends with `/`).
pub fn parse_endpoint(raw: &str, allow_http: bool) -> crate::Result<Url> {
    let mut url = Url::parse(raw.trim())
        .map_err(|_| input_error("Invalid bridge address"))?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(input_error(
            "The bridge address must not contain credentials, a query or a fragment",
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| input_error("Invalid bridge address"))?
        .to_string();
    match url.scheme() {
        "https" => {}
        "http" if allow_http && is_loopback_host(&host) => {}
        _ => return Err(input_error("The bridge address must use HTTPS")),
    }
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path());
        url.set_path(&path);
    }
    Ok(url)
}

async fn config_path() -> crate::Result<PathBuf> {
    let state = State::get().await?;
    let dir = state.directories.settings_dir.join("skin-studio");
    tokio::fs::create_dir_all(&dir).await?;
    Ok(dir.join(CONFIG_FILE))
}

async fn load_config() -> crate::Result<BridgeConfig> {
    let path = config_path().await?;
    match tokio::fs::read(&path).await {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(BridgeConfig::default())
        }
        Err(error) => Err(error.into()),
    }
}

async fn save_config(config: &BridgeConfig) -> crate::Result<()> {
    let path = config_path().await?;
    let bytes = serde_json::to_vec_pretty(config)?;
    let target = path.clone();
    tokio::task::spawn_blocking(move || -> crate::Result<()> {
        super::skin_studio::atomic_write(&target, &bytes, true)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                &target,
                std::fs::Permissions::from_mode(0o600),
            )?;
        }
        Ok(())
    })
    .await??;
    Ok(())
}

fn public_status(config: &BridgeConfig, pairing: bool) -> BridgeStatus {
    BridgeStatus {
        endpoint: config.endpoint.clone(),
        link: config
            .link
            .as_ref()
            .filter(|link| Some(&link.endpoint) == config.endpoint.as_ref())
            .map(|link| BridgeLink {
                player_uuid: link.player_uuid,
                player_name: link.player_name.clone(),
                linked_ms: link.linked_ms,
            }),
        pairing,
    }
}

fn client(endpoint: &Url) -> crate::Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .https_only(endpoint.scheme() == "https")
        .user_agent("EdenLauncher-SkinStudio")
        .build()?)
}

fn sanitize(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control())
        .take(200)
        .collect()
}

async fn read_limited(response: reqwest::Response) -> crate::Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(input_error("The bridge response is too large"));
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(input_error("The bridge response is too large"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

#[derive(Deserialize)]
struct ErrorBody {
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    message: Option<String>,
}

enum Auth<'a> {
    None,
    Bearer(&'a str),
}

async fn call<T: DeserializeOwned>(
    endpoint: &Url,
    method: reqwest::Method,
    path: &str,
    auth: Auth<'_>,
    body: Option<serde_json::Value>,
) -> crate::Result<T> {
    let url = endpoint
        .join(path)
        .map_err(|_| input_error("Invalid bridge path"))?;
    if url.origin() != endpoint.origin() {
        return Err(input_error("Invalid bridge path"));
    }
    let mut request = client(endpoint)?
        .request(method, url)
        .header("Accept", "application/json");
    if let Auth::Bearer(token) = auth {
        request = request.bearer_auth(token);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request.send().await?;
    let status = response.status();
    let bytes = read_limited(response).await?;
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(ErrorKind::InputError("bridge-unauthorized".into()).into());
    }
    if !status.is_success() {
        let detail = serde_json::from_slice::<ErrorBody>(&bytes).ok();
        let code = detail
            .as_ref()
            .and_then(|d| d.error.clone())
            .unwrap_or_else(|| status.as_u16().to_string());
        let message = detail.and_then(|d| d.message).unwrap_or_default();
        return Err(input_error(format!(
            "{}: {}",
            sanitize(&code),
            sanitize(&message)
        )));
    }
    if bytes.is_empty() {
        return serde_json::from_slice(b"null").map_err(Into::into);
    }
    Ok(serde_json::from_slice(&bytes)?)
}

fn is_unauthorized(error: &crate::Error) -> bool {
    matches!(&*error.raw, ErrorKind::InputError(message) if message == "bridge-unauthorized")
}

fn valid_path_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

struct Linked {
    endpoint: Url,
    token: String,
}

async fn linked() -> crate::Result<Linked> {
    let config = load_config().await?;
    let endpoint = config
        .endpoint
        .as_deref()
        .ok_or_else(|| input_error("The skin bridge is not configured"))?;
    let link = config
        .link
        .filter(|link| link.endpoint == endpoint)
        .ok_or_else(|| input_error("No player is linked"))?;
    Ok(Linked {
        endpoint: parse_endpoint(endpoint, allow_http_loopback())?,
        token: link.token,
    })
}

async fn forget_link() -> crate::Result<()> {
    let _guard = CONFIG_LOCK.lock().await;
    let mut config = load_config().await?;
    config.link = None;
    save_config(&config).await
}

async fn linked_call<T: DeserializeOwned>(
    method: reqwest::Method,
    path: &str,
    body: Option<serde_json::Value>,
) -> crate::Result<T> {
    let link = linked().await?;
    let result = call(
        &link.endpoint,
        method,
        path,
        Auth::Bearer(&link.token),
        body,
    )
    .await;
    if let Err(error) = &result
        && is_unauthorized(error)
    {
        forget_link().await?;
        return Err(input_error(
            "The server revoked this link. Link the player again.",
        ));
    }
    result
}

pub async fn status() -> crate::Result<BridgeStatus> {
    let config = load_config().await?;
    let pairing = PENDING.lock().await.is_some();
    Ok(public_status(&config, pairing))
}

/// Sets (or clears) the bridge endpoint. Changing it drops any link issued by another endpoint.
pub async fn set_endpoint(url: Option<String>) -> crate::Result<BridgeStatus> {
    let endpoint = match url.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(raw) => {
            Some(parse_endpoint(raw, allow_http_loopback())?.to_string())
        }
    };
    *PENDING.lock().await = None;
    let _guard = CONFIG_LOCK.lock().await;
    let mut config = load_config().await?;
    if config.endpoint != endpoint {
        config.link = None;
    }
    config.endpoint = endpoint;
    save_config(&config).await?;
    Ok(public_status(&config, false))
}

#[derive(Deserialize, Default)]
struct HealthAuth {
    #[serde(default)]
    adapter: Option<String>,
    #[serde(default)]
    ready: bool,
    #[serde(default)]
    detail: Option<String>,
}

#[derive(Deserialize, Default)]
struct HealthReady {
    #[serde(default)]
    ready: bool,
    #[serde(default)]
    detail: Option<String>,
}

#[derive(Deserialize)]
struct HealthBody {
    service: String,
    version: String,
    #[serde(default)]
    auth: HealthAuth,
    #[serde(default)]
    skins: HealthReady,
    #[serde(default)]
    generator: HealthReady,
    #[serde(default)]
    looks: u32,
}

pub async fn health() -> crate::Result<BridgeHealth> {
    let config = load_config().await?;
    let Some(endpoint) = config.endpoint else {
        return Ok(BridgeHealth {
            message: Some("not-configured".into()),
            ..BridgeHealth::default()
        });
    };
    let endpoint = parse_endpoint(&endpoint, allow_http_loopback())?;
    match call::<HealthBody>(
        &endpoint,
        reqwest::Method::GET,
        "v1/health",
        Auth::None,
        None,
    )
    .await
    {
        Ok(body) if body.service == "eden-skin-bridge" => {
            let message = [
                body.auth.detail.clone(),
                body.skins.detail.clone(),
                body.generator.detail.clone(),
            ]
            .into_iter()
            .flatten()
            .map(|d| sanitize(&d))
            .collect::<Vec<_>>()
            .join("; ");
            Ok(BridgeHealth {
                reachable: true,
                service: Some(sanitize(&body.service)),
                version: Some(sanitize(&body.version)),
                auth_adapter: body.auth.adapter.map(|a| sanitize(&a)),
                auth_ready: body.auth.ready,
                skins_ready: body.skins.ready,
                generator_ready: body.generator.ready,
                looks: body.looks,
                message: (!message.is_empty()).then_some(message),
            })
        }
        Ok(_) => Ok(BridgeHealth {
            message: Some("The address does not point to an Eden skin bridge".into()),
            ..BridgeHealth::default()
        }),
        Err(error) => Ok(BridgeHealth {
            message: Some(sanitize(&error.to_string())),
            ..BridgeHealth::default()
        }),
    }
}

#[derive(Deserialize)]
struct StartBody {
    pairing_id: String,
    code: String,
    poll_secret: String,
    expires_in: u64,
    command: String,
}

/// Requests a new one-time pairing code. The poll secret stays in memory in the backend.
pub async fn pair_start() -> crate::Result<PairStart> {
    let config = load_config().await?;
    let endpoint = config
        .endpoint
        .ok_or_else(|| input_error("The skin bridge is not configured"))?;
    let endpoint = parse_endpoint(&endpoint, allow_http_loopback())?;
    let body: StartBody = call(
        &endpoint,
        reqwest::Method::POST,
        "v1/pair/start",
        Auth::None,
        Some(serde_json::json!({ "client": "EdenLauncher" })),
    )
    .await?;
    if !valid_path_id(&body.pairing_id)
        || body.code.len() > 16
        || body.poll_secret.len() < 32
        || body.poll_secret.len() > 256
        || body.expires_in == 0
        || body.expires_in > 900
    {
        return Err(input_error("Invalid pairing response"));
    }
    let code = sanitize(&body.code);
    let command = sanitize(&body.command);
    *PENDING.lock().await = Some(PendingPair {
        endpoint,
        pairing_id: body.pairing_id,
        poll_secret: body.poll_secret,
        expires_at: Instant::now() + Duration::from_secs(body.expires_in),
        player: None,
    });
    Ok(PairStart {
        code,
        expires_in_secs: body.expires_in,
        command,
    })
}

#[derive(Deserialize)]
struct PlayerBody {
    uuid: Uuid,
    name: String,
}

#[derive(Deserialize)]
struct PollBody {
    status: PairPhase,
    #[serde(default)]
    player: Option<PlayerBody>,
}

pub async fn pair_poll() -> crate::Result<PairState> {
    let (endpoint, pairing_id, poll_secret, expires_at) = {
        let pending = PENDING.lock().await;
        let pending = pending
            .as_ref()
            .ok_or_else(|| input_error("No pairing in progress"))?;
        (
            pending.endpoint.clone(),
            pending.pairing_id.clone(),
            pending.poll_secret.clone(),
            pending.expires_at,
        )
    };
    let remaining = expires_at.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        *PENDING.lock().await = None;
        return Ok(PairState {
            status: PairPhase::Expired,
            player_uuid: None,
            player_name: None,
            expires_in_secs: 0,
        });
    }
    let body: PollBody = call(
        &endpoint,
        reqwest::Method::POST,
        "v1/pair/status",
        Auth::None,
        Some(serde_json::json!({ "pairing_id": pairing_id, "poll_secret": poll_secret })),
    )
    .await?;
    let player = body.player.map(|p| (p.uuid, sanitize(&p.name)));
    let terminal = matches!(
        body.status,
        PairPhase::Expired | PairPhase::Rejected | PairPhase::Cancelled
    );
    {
        let mut pending = PENDING.lock().await;
        let same = pending
            .as_ref()
            .is_some_and(|entry| entry.pairing_id == pairing_id);
        if same && terminal {
            *pending = None;
        } else if same
            && player.is_some()
            && let Some(entry) = pending.as_mut()
        {
            entry.player = player.clone();
        }
    }
    Ok(PairState {
        status: body.status,
        player_uuid: player.as_ref().map(|p| p.0),
        player_name: player.map(|p| p.1),
        expires_in_secs: remaining.as_secs(),
    })
}

#[derive(Deserialize)]
struct FinalizeBody {
    token: String,
    player: PlayerBody,
}

/// Completes pairing after the user confirmed the shown player in the launcher. The returned token
/// must belong to the same player the server reported while polling.
pub async fn pair_finalize() -> crate::Result<BridgeStatus> {
    let pending = PENDING
        .lock()
        .await
        .take()
        .ok_or_else(|| input_error("No pairing in progress"))?;
    let expected = pending
        .player
        .clone()
        .ok_or_else(|| input_error("The player has not confirmed in game yet"))?;
    let body: FinalizeBody = call(
        &pending.endpoint,
        reqwest::Method::POST,
        "v1/pair/finalize",
        Auth::None,
        Some(serde_json::json!({
            "pairing_id": pending.pairing_id,
            "poll_secret": pending.poll_secret,
        })),
    )
    .await?;
    if body.player.uuid != expected.0 {
        return Err(input_error("The server returned a different player"));
    }
    if body.token.len() < 32 || body.token.len() > 512 {
        return Err(input_error("Invalid link token"));
    }
    let _guard = CONFIG_LOCK.lock().await;
    let mut config = load_config().await?;
    let endpoint = pending.endpoint.to_string();
    if config.endpoint.as_deref() != Some(endpoint.as_str()) {
        return Err(input_error("The bridge address changed during pairing"));
    }
    config.link = Some(StoredLink {
        endpoint,
        token: body.token,
        player_uuid: body.player.uuid,
        player_name: sanitize(&body.player.name),
        linked_ms: now_ms(),
    });
    save_config(&config).await?;
    Ok(public_status(&config, false))
}

pub async fn pair_cancel() -> crate::Result<()> {
    let Some(pending) = PENDING.lock().await.take() else {
        return Ok(());
    };
    let _ = call::<serde_json::Value>(
        &pending.endpoint,
        reqwest::Method::POST,
        "v1/pair/cancel",
        Auth::None,
        Some(serde_json::json!({
            "pairing_id": pending.pairing_id,
            "poll_secret": pending.poll_secret,
        })),
    )
    .await;
    Ok(())
}

/// Revokes the link on the server (best effort) and always forgets it locally.
pub async fn unlink() -> crate::Result<BridgeStatus> {
    if let Ok(link) = linked().await {
        let _ = call::<serde_json::Value>(
            &link.endpoint,
            reqwest::Method::DELETE,
            "v1/link",
            Auth::Bearer(&link.token),
            None,
        )
        .await;
    }
    forget_link().await?;
    status().await
}

fn validate_job(job: BridgeJob) -> crate::Result<BridgeJob> {
    if !valid_path_id(&job.job_id) {
        return Err(input_error("Invalid job id from bridge"));
    }
    Ok(BridgeJob {
        message: job.message.map(|m| sanitize(&m)),
        error_code: job.error_code.map(|m| sanitize(&m)),
        ..job
    })
}

fn valid_idempotency_key(key: &str) -> bool {
    key.len() >= 8 && key.len() <= 64 && valid_path_id(key)
}

/// Sends a standard skin to the server for the linked player. Returns the server job; generation
/// may be queued, which is not yet applied in game.
pub async fn apply_skin(
    data: String,
    variant: String,
    idempotency_key: String,
) -> crate::Result<BridgeJob> {
    if variant != "classic" && variant != "slim" {
        return Err(input_error("Invalid skin model"));
    }
    if !valid_idempotency_key(&idempotency_key) {
        return Err(input_error("Invalid request key"));
    }
    if data.len() > MAX_SKIN_BYTES / 3 * 4 + 4 {
        return Err(input_error("Skin file is too large"));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|_| input_error("Invalid skin payload"))?;
    let clean = super::minecraft_skins::reencode_skin_png(&bytes)?;
    let payload = base64::engine::general_purpose::STANDARD.encode(&clean);
    let job: BridgeJob = linked_call(
        reqwest::Method::POST,
        "v1/skin",
        Some(serde_json::json!({
            "variant": variant,
            "png_base64": payload,
            "idempotency_key": idempotency_key,
        })),
    )
    .await?;
    validate_job(job)
}

pub async fn job(job_id: String) -> crate::Result<BridgeJob> {
    if !valid_path_id(&job_id) {
        return Err(input_error("Invalid job id"));
    }
    let job: BridgeJob =
        linked_call(reqwest::Method::GET, &format!("v1/jobs/{job_id}"), None)
            .await?;
    validate_job(job)
}

pub async fn cancel_job(job_id: String) -> crate::Result<BridgeJob> {
    if !valid_path_id(&job_id) {
        return Err(input_error("Invalid job id"));
    }
    let job: BridgeJob = linked_call(
        reqwest::Method::POST,
        &format!("v1/jobs/{job_id}/cancel"),
        None,
    )
    .await?;
    validate_job(job)
}

#[derive(Deserialize)]
struct LooksBody {
    looks: Vec<BridgeLook>,
}

pub async fn looks() -> crate::Result<Vec<BridgeLook>> {
    let body: LooksBody =
        linked_call(reqwest::Method::GET, "v1/looks", None).await?;
    Ok(body
        .looks
        .into_iter()
        .filter(|look| valid_path_id(&look.id))
        .take(64)
        .map(|look| BridgeLook {
            id: look.id,
            label: sanitize(&look.label),
            has_cape: look.has_cape,
        })
        .collect())
}

pub async fn apply_look(
    look_id: String,
    idempotency_key: String,
) -> crate::Result<BridgeJob> {
    if !valid_path_id(&look_id) || !valid_idempotency_key(&idempotency_key) {
        return Err(input_error("Invalid request"));
    }
    let job: BridgeJob = linked_call(
        reqwest::Method::POST,
        &format!("v1/looks/{look_id}/apply"),
        Some(serde_json::json!({ "idempotency_key": idempotency_key })),
    )
    .await?;
    validate_job(job)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_require_https_except_explicit_loopback() {
        assert!(parse_endpoint("https://skins.example.org", false).is_ok());
        assert_eq!(
            parse_endpoint("https://skins.example.org/bridge", false)
                .unwrap()
                .as_str(),
            "https://skins.example.org/bridge/"
        );
        assert!(parse_endpoint("http://skins.example.org", true).is_err());
        assert!(parse_endpoint("http://127.0.0.1:8787", false).is_err());
        assert!(parse_endpoint("http://127.0.0.1:8787", true).is_ok());
        assert!(parse_endpoint("http://[::1]:8787", true).is_ok());
        assert!(parse_endpoint("http://10.0.0.5:8787", true).is_err());
        assert!(parse_endpoint("https://user:pw@skins.example.org", false).is_err());
        assert!(parse_endpoint("https://skins.example.org/?x=1", false).is_err());
        assert!(parse_endpoint("file:///etc/passwd", true).is_err());
    }

    #[test]
    fn path_ids_cannot_inject_paths() {
        assert!(valid_path_id("job-123_ABC"));
        assert!(!valid_path_id("../link"));
        assert!(!valid_path_id("a/b"));
        assert!(!valid_path_id(""));
        assert!(!valid_path_id(&"a".repeat(65)));
    }

    #[test]
    fn server_text_is_sanitized() {
        assert_eq!(sanitize("ok\u{0}\nline"), "okline");
        assert_eq!(sanitize(&"x".repeat(500)).len(), 200);
    }

    #[test]
    fn links_are_bound_to_their_endpoint() {
        let config = BridgeConfig {
            endpoint: Some("https://b.example/".into()),
            link: Some(StoredLink {
                endpoint: "https://a.example/".into(),
                token: "t".repeat(40),
                player_uuid: Uuid::nil(),
                player_name: "Steve".into(),
                linked_ms: 0,
            }),
        };
        assert!(public_status(&config, false).link.is_none());
    }
}
