mod models;
mod handlers;

use axum::{routing::{get, post}, Router};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;

use sqlx::migrate::Migrator;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
}

#[tokio::main]
async fn main() {

    tracing_subscriber::fmt::init();

    tracing::info!("Run app backoffice...");

    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("Failed to connect to Postgres");

    let current_dir = std::env::current_dir().unwrap();
    tracing::info!("Текущая директория: {:?}", current_dir);

    match std::fs::read_dir("./migrations") {
        Ok(entries) => {
            for entry in entries {
                tracing::info!("Найден файл миграции: {:?}", entry.unwrap().file_name());
            }
        },
        Err(e) => tracing::error!("Не удалось прочитать папку миграций: {}", e),
    }

   // 3. ЗАПУСК МИГРАЦИЙ с явным выводом ошибки
    tracing::info!("Запуск миграций...");
    MIGRATOR.run(&pool)
        .await
        .expect("MIGRATION FAILED"); // Если тут упадет, код выхода будет 101 и ты увидишь текст
    tracing::info!("Миграции успешно применены!");

    let state = AppState { db: pool };

    let app = Router::new()
        .route("/users", post(handlers::create_user))
        .route("/users", get(handlers::get_users))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Server started on http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}