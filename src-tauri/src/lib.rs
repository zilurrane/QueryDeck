mod db;

use db::DbState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(DbState::default())
        .invoke_handler(tauri::generate_handler![
            db::test_connection,
            db::connect,
            db::run_query,
            db::cancel_query,
            db::list_schema,
            db::disconnect,
            db::secret_set,
            db::secret_get,
            db::secret_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
