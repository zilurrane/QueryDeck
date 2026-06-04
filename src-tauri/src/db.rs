// MSSQL connectivity via tiberius + secret storage via the OS keychain.
//
// Connection registry keyed by an opaque id. Each entry keeps the live client
// plus the config it was opened with, so a cancelled query (which desyncs the
// tiberius protocol) can transparently reconnect. Results are normalised to the
// shared `QueryResult { columns, rows }` shape.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tiberius::{AuthMethod, Client, ColumnType, Config, EncryptionLevel, QueryItem, Row};
use tokio::net::TcpStream;
use tokio::sync::{Mutex, Notify};
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

type SqlClient = Client<Compat<TcpStream>>;

const SERVICE: &str = "QueryDeck";

struct Conn {
    client: SqlClient,
    config: ConnConfig,
}

#[derive(Default)]
pub struct DbState {
    conns: Mutex<HashMap<String, Conn>>,
    cancels: Mutex<HashMap<String, Arc<Notify>>>,
    counter: AtomicU64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConnConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: String,
    #[serde(default)]
    pub encrypt: bool,
    #[serde(default)]
    pub trust_cert: bool,
}

#[derive(Debug, Serialize)]
pub struct ConnInfo {
    pub id: String,
    pub database: String,
}

#[derive(Debug, Serialize)]
pub struct Column {
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
}

#[derive(Debug, Serialize)]
pub struct QueryResult {
    pub columns: Vec<Column>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: usize,
    pub elapsed_ms: u128,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

async fn build_client(cfg: &ConnConfig) -> Result<SqlClient, String> {
    let mut config = Config::new();
    config.host(&cfg.host);
    config.port(cfg.port);
    config.database(&cfg.database);
    config.authentication(AuthMethod::sql_server(&cfg.username, &cfg.password));
    config.encryption(if cfg.encrypt {
        EncryptionLevel::Required
    } else {
        EncryptionLevel::Off
    });
    if cfg.trust_cert {
        config.trust_cert();
    }

    let tcp = TcpStream::connect(config.get_addr()).await.map_err(err)?;
    tcp.set_nodelay(true).map_err(err)?;

    Client::connect(config, tcp.compat_write()).await.map_err(err)
}

fn type_name(ct: ColumnType) -> String {
    use ColumnType::*;
    let s = match ct {
        Null => "null",
        Bit | Bitn => "bit",
        Int1 => "tinyint",
        Int2 => "smallint",
        Int4 => "int",
        Int8 => "bigint",
        Intn => "int",
        Float4 => "real",
        Float8 | Floatn => "float",
        Money | Money4 => "money",
        Decimaln => "decimal",
        Numericn => "numeric",
        Datetime | Datetime4 | Datetimen => "datetime",
        Datetime2 => "datetime2",
        Daten => "date",
        Timen => "time",
        DatetimeOffsetn => "datetimeoffset",
        Guid => "uniqueidentifier",
        BigChar | NChar => "char",
        BigVarChar | NVarchar => "nvarchar",
        Text | NText => "text",
        Xml => "xml",
        BigBinary | BigVarBin => "binary",
        Image => "image",
        _ => "unknown",
    };
    s.to_string()
}

fn cell_to_json(row: &Row, idx: usize) -> Value {
    use chrono::{NaiveDate, NaiveDateTime, NaiveTime};

    if let Ok(v) = row.try_get::<&str, usize>(idx) {
        return v.map(|s| Value::String(s.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<i32, usize>(idx) {
        return v.map(Value::from).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<i64, usize>(idx) {
        return v.map(Value::from).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<i16, usize>(idx) {
        return v.map(Value::from).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<u8, usize>(idx) {
        return v.map(Value::from).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<f64, usize>(idx) {
        return v.map(Value::from).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<f32, usize>(idx) {
        return v.map(|n| Value::from(n as f64)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<bool, usize>(idx) {
        return v.map(Value::Bool).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<rust_decimal::Decimal, usize>(idx) {
        return v
            .map(|d| {
                d.to_string()
                    .parse::<f64>()
                    .map(Value::from)
                    .unwrap_or(Value::String(d.to_string()))
            })
            .unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<NaiveDateTime, usize>(idx) {
        return v
            .map(|d| Value::String(d.format("%Y-%m-%d %H:%M:%S").to_string()))
            .unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<NaiveDate, usize>(idx) {
        return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<NaiveTime, usize>(idx) {
        return v.map(|d| Value::String(d.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<uuid::Uuid, usize>(idx) {
        return v.map(|u| Value::String(u.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<&[u8], usize>(idx) {
        return v
            .map(|b| {
                let hex: String = b.iter().map(|x| format!("{:02x}", x)).collect();
                Value::String(format!("0x{}", hex))
            })
            .unwrap_or(Value::Null);
    }
    Value::Null
}

async fn exec(client: &mut SqlClient, sql: &str) -> Result<QueryResult, String> {
    let start = Instant::now();
    let mut stream = client.simple_query(sql).await.map_err(err)?;

    let mut columns: Vec<Column> = Vec::new();
    let mut have_meta = false;
    let mut rows: Vec<Vec<Value>> = Vec::new();

    while let Some(item) = stream.try_next().await.map_err(err)? {
        match item {
            QueryItem::Metadata(meta) => {
                if !have_meta {
                    columns = meta
                        .columns()
                        .iter()
                        .map(|c| Column {
                            name: c.name().to_string(),
                            type_name: type_name(c.column_type()),
                        })
                        .collect();
                    have_meta = true;
                }
            }
            QueryItem::Row(row) => {
                let mut vals = Vec::with_capacity(columns.len());
                for i in 0..columns.len() {
                    vals.push(cell_to_json(&row, i));
                }
                rows.push(vals);
            }
        }
    }

    let row_count = rows.len();
    Ok(QueryResult {
        columns,
        rows,
        row_count,
        elapsed_ms: start.elapsed().as_millis(),
    })
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn test_connection(cfg: ConnConfig) -> Result<u128, String> {
    let start = Instant::now();
    let _client = build_client(&cfg).await?;
    Ok(start.elapsed().as_millis())
}

#[tauri::command]
pub async fn connect(cfg: ConnConfig, state: tauri::State<'_, DbState>) -> Result<ConnInfo, String> {
    let client = build_client(&cfg).await?;
    let id = format!("conn-{}", state.counter.fetch_add(1, Ordering::Relaxed));
    let database = cfg.database.clone();
    state.conns.lock().await.insert(
        id.clone(),
        Conn {
            client,
            config: cfg,
        },
    );
    Ok(ConnInfo { id, database })
}

#[tauri::command]
pub async fn run_query(
    conn_id: String,
    sql: String,
    max_rows: Option<u32>,
    state: tauri::State<'_, DbState>,
) -> Result<QueryResult, String> {
    // Take the connection out of the map so we don't hold the map lock for the
    // whole query — that lets `cancel_query` run concurrently.
    let mut conn = {
        let mut map = state.conns.lock().await;
        map.remove(&conn_id)
            .ok_or_else(|| "Connection not found".to_string())?
    };
    let cancel = {
        let mut cm = state.cancels.lock().await;
        cm.entry(conn_id.clone())
            .or_insert_with(|| Arc::new(Notify::new()))
            .clone()
    };

    let final_sql = match max_rows {
        Some(n) if n > 0 => format!("SET ROWCOUNT {}; {} ; SET ROWCOUNT 0;", n, sql),
        _ => sql,
    };

    let outcome: Option<Result<QueryResult, String>> = tokio::select! {
        r = exec(&mut conn.client, &final_sql) => Some(r),
        _ = cancel.notified() => None,
    };

    match outcome {
        Some(r) => {
            state.conns.lock().await.insert(conn_id, conn);
            r
        }
        None => {
            // Cancelled mid-flight: the protocol is desynced, reconnect fresh.
            let Conn { client, config } = conn;
            drop(client);
            if let Ok(c) = build_client(&config).await {
                state
                    .conns
                    .lock()
                    .await
                    .insert(conn_id, Conn { client: c, config });
            }
            Err("Query cancelled".to_string())
        }
    }
}

#[tauri::command]
pub async fn cancel_query(conn_id: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    if let Some(n) = state.cancels.lock().await.get(&conn_id) {
        n.notify_waiters();
    }
    Ok(())
}

#[tauri::command]
pub async fn list_schema(
    conn_id: String,
    state: tauri::State<'_, DbState>,
) -> Result<QueryResult, String> {
    const SQL: &str = "\
        SELECT t.TABLE_SCHEMA, t.TABLE_NAME, t.TABLE_TYPE, \
               c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.ORDINAL_POSITION \
        FROM INFORMATION_SCHEMA.TABLES t \
        JOIN INFORMATION_SCHEMA.COLUMNS c \
          ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME \
        ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION";
    let mut map = state.conns.lock().await;
    let conn = map
        .get_mut(&conn_id)
        .ok_or_else(|| "Connection not found".to_string())?;
    exec(&mut conn.client, SQL).await
}

#[tauri::command]
pub async fn disconnect(conn_id: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    state.conns.lock().await.remove(&conn_id);
    state.cancels.lock().await.remove(&conn_id);
    Ok(())
}

// ---- OS keychain (Windows Credential Manager) -----------------------------

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    keyring::Entry::new(SERVICE, &key)
        .map_err(err)?
        .set_password(&value)
        .map_err(err)
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, &key).map_err(err)?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(err(e)),
    }
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &key).map_err(err)?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(err(e)),
    }
}
