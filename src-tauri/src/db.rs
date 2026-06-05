// Multi-engine SQL connectivity + secret storage via the OS keychain.
//
// A connection registry keyed by an opaque id. Each entry keeps the live client
// (MSSQL via `tiberius`, or PostgreSQL via `sqlx`) plus the config it was opened
// with, so a cancelled query (which desyncs the protocol) can transparently
// reconnect. Results from every engine are normalised to the shared
// `QueryResult { columns, rows }` shape so the UI never sees engine specifics.

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

use sqlx::mysql::{MySqlConnectOptions, MySqlConnection, MySqlSslMode};
use sqlx::postgres::{PgConnectOptions, PgConnection, PgSslMode};
use sqlx::{Column as _, ConnectOptions, Row as _, TypeInfo as _};

type SqlClient = Client<Compat<TcpStream>>;

const SERVICE: &str = "QueryDeck";

/// Supported database engines. Serialised lowercase to/from the frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Mssql,
    Postgres,
    Mysql,
}

impl Default for Engine {
    fn default() -> Self {
        Engine::Mssql
    }
}

/// A live connection, one variant per engine.
enum AnyConn {
    Mssql(SqlClient),
    Postgres(PgConnection),
    Mysql(MySqlConnection),
}

struct Conn {
    client: AnyConn,
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
    #[serde(default)]
    pub engine: Engine,
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
    pub engine: Engine,
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

// ---------------------------------------------------------------------------
// Connection setup
// ---------------------------------------------------------------------------

async fn build_client(cfg: &ConnConfig) -> Result<AnyConn, String> {
    match cfg.engine {
        Engine::Mssql => Ok(AnyConn::Mssql(build_mssql(cfg).await?)),
        Engine::Postgres => Ok(AnyConn::Postgres(build_postgres(cfg).await?)),
        Engine::Mysql => Ok(AnyConn::Mysql(build_mysql(cfg).await?)),
    }
}

async fn build_mssql(cfg: &ConnConfig) -> Result<SqlClient, String> {
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

async fn build_postgres(cfg: &ConnConfig) -> Result<PgConnection, String> {
    // encrypt -> require TLS; trust_cert -> don't verify the server cert.
    let ssl_mode = match (cfg.encrypt, cfg.trust_cert) {
        (true, true) => PgSslMode::Require,    // encrypt, no CA/host verification
        (true, false) => PgSslMode::VerifyFull, // encrypt + verify
        (false, _) => PgSslMode::Prefer,        // opportunistic
    };
    let opts = PgConnectOptions::new()
        .host(&cfg.host)
        .port(cfg.port)
        .username(&cfg.username)
        .password(&cfg.password)
        .database(&cfg.database)
        .ssl_mode(ssl_mode);
    opts.connect().await.map_err(err)
}

async fn build_mysql(cfg: &ConnConfig) -> Result<MySqlConnection, String> {
    let ssl_mode = match (cfg.encrypt, cfg.trust_cert) {
        (true, true) => MySqlSslMode::Required,        // encrypt, no cert verification
        (true, false) => MySqlSslMode::VerifyIdentity, // encrypt + verify
        (false, _) => MySqlSslMode::Preferred,         // opportunistic
    };
    let mut opts = MySqlConnectOptions::new()
        .host(&cfg.host)
        .port(cfg.port)
        .username(&cfg.username)
        .password(&cfg.password)
        .ssl_mode(ssl_mode);
    // MySQL can connect without selecting a database.
    if !cfg.database.is_empty() {
        opts = opts.database(&cfg.database);
    }
    opts.connect().await.map_err(err)
}

// ---------------------------------------------------------------------------
// Execution (dispatches per engine, normalises to QueryResult)
// ---------------------------------------------------------------------------

async fn exec(conn: &mut AnyConn, sql: &str, cap: Option<usize>) -> Result<QueryResult, String> {
    let start = Instant::now();
    match conn {
        AnyConn::Mssql(c) => exec_mssql(c, sql, cap, start).await,
        AnyConn::Postgres(c) => exec_postgres(c, sql, cap, start).await,
        AnyConn::Mysql(c) => exec_mysql(c, sql, cap, start).await,
    }
}

async fn exec_mssql(
    client: &mut SqlClient,
    sql: &str,
    cap: Option<usize>,
    start: Instant,
) -> Result<QueryResult, String> {
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
                            type_name: mssql_type_name(c.column_type()),
                        })
                        .collect();
                    have_meta = true;
                }
            }
            QueryItem::Row(row) => {
                if cap.is_some_and(|n| rows.len() >= n) {
                    continue;
                }
                let mut vals = Vec::with_capacity(columns.len());
                for i in 0..columns.len() {
                    vals.push(mssql_cell_to_json(&row, i));
                }
                rows.push(vals);
            }
        }
    }

    Ok(finish(columns, rows, start))
}

async fn exec_postgres(
    conn: &mut PgConnection,
    sql: &str,
    cap: Option<usize>,
    start: Instant,
) -> Result<QueryResult, String> {
    // sqlx 0.9 requires query text to be `&'static str` unless wrapped in
    // `AssertSqlSafe` — which is correct here: a SQL console runs arbitrary
    // user-supplied SQL by design. `fetch_all` is awaited inline (no escaping
    // borrow); we cap the rows client-side.
    let raw = sqlx::query(sqlx::AssertSqlSafe(sql))
        .fetch_all(&mut *conn)
        .await
        .map_err(err)?;

    let mut columns: Vec<Column> = Vec::new();
    let mut rows: Vec<Vec<Value>> = Vec::new();

    for row in &raw {
        if columns.is_empty() {
            columns = row
                .columns()
                .iter()
                .map(|c| Column {
                    name: c.name().to_string(),
                    type_name: c.type_info().name().to_lowercase(),
                })
                .collect();
        }
        if cap.is_some_and(|n| rows.len() >= n) {
            break;
        }
        let mut vals = Vec::with_capacity(columns.len());
        for i in 0..columns.len() {
            vals.push(pg_cell_to_json(row, i));
        }
        rows.push(vals);
    }

    Ok(finish(columns, rows, start))
}

async fn exec_mysql(
    conn: &mut MySqlConnection,
    sql: &str,
    cap: Option<usize>,
    start: Instant,
) -> Result<QueryResult, String> {
    let raw = sqlx::query(sqlx::AssertSqlSafe(sql))
        .fetch_all(&mut *conn)
        .await
        .map_err(err)?;

    let mut columns: Vec<Column> = Vec::new();
    let mut rows: Vec<Vec<Value>> = Vec::new();

    for row in &raw {
        if columns.is_empty() {
            columns = row
                .columns()
                .iter()
                .map(|c| Column {
                    name: c.name().to_string(),
                    type_name: c.type_info().name().to_lowercase(),
                })
                .collect();
        }
        if cap.is_some_and(|n| rows.len() >= n) {
            break;
        }
        let mut vals = Vec::with_capacity(columns.len());
        for i in 0..columns.len() {
            vals.push(mysql_cell_to_json(row, i));
        }
        rows.push(vals);
    }

    Ok(finish(columns, rows, start))
}

fn finish(columns: Vec<Column>, rows: Vec<Vec<Value>>, start: Instant) -> QueryResult {
    let row_count = rows.len();
    QueryResult {
        columns,
        rows,
        row_count,
        elapsed_ms: start.elapsed().as_millis(),
    }
}

// ---------------------------------------------------------------------------
// MSSQL type + value mapping
// ---------------------------------------------------------------------------

fn mssql_type_name(ct: ColumnType) -> String {
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

fn mssql_cell_to_json(row: &Row, idx: usize) -> Value {
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

// ---------------------------------------------------------------------------
// PostgreSQL value mapping (type name comes straight from `type_info().name()`)
// ---------------------------------------------------------------------------

fn pg_cell_to_json(row: &sqlx::postgres::PgRow, idx: usize) -> Value {
    use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};

    // Each arm only succeeds when the column's type actually decodes to that
    // Rust type (sqlx enforces compatibility), so the order just needs strings
    // before json and bytea last.
    macro_rules! try_as {
        ($t:ty, $f:expr) => {
            if let Ok(v) = row.try_get::<Option<$t>, usize>(idx) {
                return v.map($f).unwrap_or(Value::Null);
            }
        };
    }

    try_as!(bool, Value::Bool);
    try_as!(i16, Value::from);
    try_as!(i32, Value::from);
    try_as!(i64, Value::from);
    try_as!(f32, |n| Value::from(n as f64));
    try_as!(f64, Value::from);
    try_as!(rust_decimal::Decimal, |d| {
        d.to_string()
            .parse::<f64>()
            .map(Value::from)
            .unwrap_or(Value::String(d.to_string()))
    });
    try_as!(String, Value::String);
    try_as!(NaiveDateTime, |d| Value::String(
        d.format("%Y-%m-%d %H:%M:%S").to_string()
    ));
    try_as!(DateTime<Utc>, |d| Value::String(d.to_rfc3339()));
    try_as!(NaiveDate, |d| Value::String(d.to_string()));
    try_as!(NaiveTime, |d| Value::String(d.to_string()));
    try_as!(uuid::Uuid, |u| Value::String(u.to_string()));
    try_as!(serde_json::Value, |j| j);
    try_as!(Vec<u8>, |b| {
        let hex: String = b.iter().map(|x| format!("{:02x}", x)).collect();
        Value::String(format!("0x{}", hex))
    });
    Value::Null
}

// ---------------------------------------------------------------------------
// MySQL value mapping
// ---------------------------------------------------------------------------

fn mysql_cell_to_json(row: &sqlx::mysql::MySqlRow, idx: usize) -> Value {
    use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};

    macro_rules! try_as {
        ($t:ty, $f:expr) => {
            if let Ok(v) = row.try_get::<Option<$t>, usize>(idx) {
                return v.map($f).unwrap_or(Value::Null);
            }
        };
    }

    // Signed and unsigned integer widths, then floats/decimal, strings,
    // temporals, json, and binary last.
    try_as!(i8, Value::from);
    try_as!(i16, Value::from);
    try_as!(i32, Value::from);
    try_as!(i64, Value::from);
    try_as!(u8, Value::from);
    try_as!(u16, Value::from);
    try_as!(u32, Value::from);
    try_as!(u64, Value::from);
    try_as!(f32, |n| Value::from(n as f64));
    try_as!(f64, Value::from);
    try_as!(rust_decimal::Decimal, |d| {
        d.to_string()
            .parse::<f64>()
            .map(Value::from)
            .unwrap_or(Value::String(d.to_string()))
    });
    try_as!(String, Value::String);
    try_as!(NaiveDateTime, |d| Value::String(
        d.format("%Y-%m-%d %H:%M:%S").to_string()
    ));
    try_as!(DateTime<Utc>, |d| Value::String(d.to_rfc3339()));
    try_as!(NaiveDate, |d| Value::String(d.to_string()));
    try_as!(NaiveTime, |d| Value::String(d.to_string()));
    try_as!(serde_json::Value, |j| j);
    try_as!(Vec<u8>, |b| {
        let hex: String = b.iter().map(|x| format!("{:02x}", x)).collect();
        Value::String(format!("0x{}", hex))
    });
    Value::Null
}

// ---------------------------------------------------------------------------
// Schema introspection (per engine, aliased to the same column names)
// ---------------------------------------------------------------------------

fn schema_sql(engine: Engine) -> &'static str {
    match engine {
        Engine::Mssql => "\
            SELECT t.TABLE_SCHEMA, t.TABLE_NAME, t.TABLE_TYPE, \
                   c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.ORDINAL_POSITION \
            FROM INFORMATION_SCHEMA.TABLES t \
            JOIN INFORMATION_SCHEMA.COLUMNS c \
              ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME \
            ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION",
        Engine::Postgres => "\
            SELECT t.table_schema AS \"TABLE_SCHEMA\", t.table_name AS \"TABLE_NAME\", \
                   t.table_type AS \"TABLE_TYPE\", c.column_name AS \"COLUMN_NAME\", \
                   c.data_type AS \"DATA_TYPE\", c.is_nullable AS \"IS_NULLABLE\", \
                   c.ordinal_position AS \"ORDINAL_POSITION\" \
            FROM information_schema.tables t \
            JOIN information_schema.columns c \
              ON c.table_schema = t.table_schema AND c.table_name = t.table_name \
            WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema') \
            ORDER BY t.table_schema, t.table_name, c.ordinal_position",
        Engine::Mysql => "\
            SELECT t.table_schema AS `TABLE_SCHEMA`, t.table_name AS `TABLE_NAME`, \
                   t.table_type AS `TABLE_TYPE`, c.column_name AS `COLUMN_NAME`, \
                   c.data_type AS `DATA_TYPE`, c.is_nullable AS `IS_NULLABLE`, \
                   c.ordinal_position AS `ORDINAL_POSITION` \
            FROM information_schema.tables t \
            JOIN information_schema.columns c \
              ON c.table_schema = t.table_schema AND c.table_name = t.table_name \
            WHERE t.table_schema = DATABASE() \
            ORDER BY t.table_schema, t.table_name, c.ordinal_position",
    }
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
    let engine = cfg.engine;
    state.conns.lock().await.insert(
        id.clone(),
        Conn {
            client,
            config: cfg,
        },
    );
    Ok(ConnInfo {
        id,
        database,
        engine,
    })
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

    // Cap row collection at max_rows; for MSSQL also hint the server.
    let cap = max_rows.filter(|n| *n > 0).map(|n| n as usize);
    let final_sql = match (conn.config.engine, cap) {
        (Engine::Mssql, Some(n)) => format!("SET ROWCOUNT {}; {} ; SET ROWCOUNT 0;", n, sql),
        _ => sql,
    };

    let outcome: Option<Result<QueryResult, String>> = tokio::select! {
        r = exec(&mut conn.client, &final_sql, cap) => Some(r),
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
    let mut map = state.conns.lock().await;
    let conn = map
        .get_mut(&conn_id)
        .ok_or_else(|| "Connection not found".to_string())?;
    let sql = schema_sql(conn.config.engine);
    exec(&mut conn.client, sql, None).await
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

#[cfg(test)]
mod tests {
    use super::*;

    // Exercises the real Postgres path (build_client -> exec -> pg_cell_to_json).
    // Skipped unless QD_PG_TEST is set so normal `cargo test` needs no DB.
    // Env: QD_PG_HOST, QD_PG_PORT, QD_PG_USER, QD_PG_PASS, QD_PG_DB.
    #[tokio::test]
    async fn postgres_query_roundtrip() {
        if std::env::var("QD_PG_TEST").is_err() {
            eprintln!("skipping postgres_query_roundtrip (set QD_PG_TEST=1)");
            return;
        }
        let env = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
        let cfg = ConnConfig {
            engine: Engine::Postgres,
            host: env("QD_PG_HOST", "localhost"),
            port: env("QD_PG_PORT", "55432").parse().unwrap(),
            username: env("QD_PG_USER", "postgres"),
            password: env("QD_PG_PASS", "secret"),
            database: env("QD_PG_DB", "qdtest"),
            encrypt: false,
            trust_cert: true,
        };

        let mut conn = build_client(&cfg).await.expect("connect");
        let sql = "SELECT 1::int AS a, 'hi'::text AS b, true AS c, 3.5::numeric AS d, \
                   NULL::int AS e, '2020-01-02 03:04:05'::timestamp AS f, \
                   '11111111-1111-1111-1111-111111111111'::uuid AS g, \
                   '{\"k\": 1}'::jsonb AS h, 9000000000::bigint AS i, 2::smallint AS j";
        let r = exec(&mut conn, sql, None).await.expect("query");

        let names: Vec<&str> = r.columns.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
        assert_eq!(r.row_count, 1);
        let row = &r.rows[0];
        assert_eq!(row[0], serde_json::json!(1));
        assert_eq!(row[1], serde_json::json!("hi"));
        assert_eq!(row[2], serde_json::json!(true));
        assert_eq!(row[3], serde_json::json!(3.5));
        assert_eq!(row[4], Value::Null);
        assert_eq!(row[5], serde_json::json!("2020-01-02 03:04:05"));
        assert_eq!(row[6], serde_json::json!("11111111-1111-1111-1111-111111111111"));
        assert_eq!(row[7], serde_json::json!({"k": 1}));
        assert_eq!(row[8], serde_json::json!(9000000000_i64));
        assert_eq!(row[9], serde_json::json!(2));

        // And the schema-introspection query must run without error.
        let s = exec(&mut conn, schema_sql(Engine::Postgres), None).await.expect("schema");
        assert!(s.columns.iter().any(|c| c.name == "TABLE_NAME"));
    }

    // Same shape as the Postgres test, against MySQL. Skipped unless
    // QD_MYSQL_TEST is set. Env: QD_MYSQL_HOST/PORT/USER/PASS/DB.
    #[tokio::test]
    async fn mysql_query_roundtrip() {
        if std::env::var("QD_MYSQL_TEST").is_err() {
            eprintln!("skipping mysql_query_roundtrip (set QD_MYSQL_TEST=1)");
            return;
        }
        let env = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
        let cfg = ConnConfig {
            engine: Engine::Mysql,
            host: env("QD_MYSQL_HOST", "localhost"),
            port: env("QD_MYSQL_PORT", "33306").parse().unwrap(),
            username: env("QD_MYSQL_USER", "root"),
            password: env("QD_MYSQL_PASS", "secret"),
            database: env("QD_MYSQL_DB", "qdtest"),
            encrypt: false,
            trust_cert: true,
        };

        let mut conn = build_client(&cfg).await.expect("connect");
        // Set up a typed table (statements run one at a time — single-statement protocol).
        exec(&mut conn, "DROP TABLE IF EXISTS qd_t", None).await.expect("drop");
        exec(
            &mut conn,
            "CREATE TABLE qd_t (i INT, b VARCHAR(10), u INT UNSIGNED, d DECIMAL(10,2), \
             n INT, dt DATETIME, big BIGINT, ti TINYINT)",
            None,
        )
        .await
        .expect("create");
        exec(
            &mut conn,
            "INSERT INTO qd_t VALUES (1, 'hi', 7, 3.50, NULL, '2020-01-02 03:04:05', 9000000000, 2)",
            None,
        )
        .await
        .expect("insert");

        let r = exec(&mut conn, "SELECT i, b, u, d, n, dt, big, ti FROM qd_t", None)
            .await
            .expect("query");
        assert_eq!(r.row_count, 1);
        let row = &r.rows[0];
        assert_eq!(row[0], serde_json::json!(1));
        assert_eq!(row[1], serde_json::json!("hi"));
        assert_eq!(row[2], serde_json::json!(7));
        assert_eq!(row[3], serde_json::json!(3.5));
        assert_eq!(row[4], Value::Null);
        assert_eq!(row[5], serde_json::json!("2020-01-02 03:04:05"));
        assert_eq!(row[6], serde_json::json!(9000000000_i64));
        assert_eq!(row[7], serde_json::json!(2));

        let s = exec(&mut conn, schema_sql(Engine::Mysql), None).await.expect("schema");
        assert!(s.columns.iter().any(|c| c.name == "TABLE_NAME"));

        exec(&mut conn, "DROP TABLE qd_t", None).await.ok();
    }
}
