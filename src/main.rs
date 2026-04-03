use chrono::Local;
use eframe::egui;
use rusqlite::{Connection, OptionalExtension, params};
use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;

fn main() -> eframe::Result<()> {
    let db_path = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("sku_calculator.db");

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([1400.0, 920.0]),
        ..Default::default()
    };

    eframe::run_native(
        "SKU 计算器",
        options,
        Box::new(move |_cc| {
            setup_chinese_fonts(&_cc.egui_ctx);
            setup_ui_style(&_cc.egui_ctx);
            let app = SkuApp::new(db_path.clone()).unwrap_or_else(|err| {
                panic!("初始化应用失败: {err}");
            });
            Ok(Box::new(app))
        }),
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum FeeMode {
    Fixed,
    Percent,
}

impl FeeMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Fixed => "fixed",
            Self::Percent => "percent",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Fixed => "固定值",
            Self::Percent => "百分比",
        }
    }

    fn from_str(value: &str) -> Self {
        match value {
            "percent" => Self::Percent,
            _ => Self::Fixed,
        }
    }
}

#[derive(Clone)]
struct AppSettings {
    platform_fee_percent: f64,
    package_fee_mode: FeeMode,
    package_fee_value: f64,
    other_fee_mode: FeeMode,
    other_fee_value: f64,
    operation_fee: f64,
    target_profit_percent: f64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            platform_fee_percent: 8.0,
            package_fee_mode: FeeMode::Fixed,
            package_fee_value: 0.0,
            other_fee_mode: FeeMode::Fixed,
            other_fee_value: 0.0,
            operation_fee: 0.0,
            target_profit_percent: 20.0,
        }
    }
}

#[derive(Clone)]
struct SalesSpec {
    id: i64,
    quantity: i32,
}

#[derive(Clone)]
struct ShippingRule {
    id: i64,
    weight_min: f64,
    weight_max: f64,
    shipping_fee: f64,
}

#[derive(Clone)]
struct ProductSummary {
    id: i64,
    name: String,
    unit_cost: f64,
    unit_weight: f64,
    spec_names: String,
    updated_at: String,
}

#[derive(Clone)]
struct ProductDetail {
    id: i64,
    name: String,
    unit_cost: f64,
    unit_weight: f64,
    selected_spec_ids: Vec<i64>,
}

#[derive(Clone)]
struct CalculationResult {
    spec_name: String,
    spec_quantity: i32,
    goods_cost: f64,
    total_weight: f64,
    shipping_fee: f64,
    package_fee: f64,
    other_fee: f64,
    operation_fee: f64,
    total_cost: f64,
    raw_suggested_price: f64,
    final_suggested_price: f64,
    platform_fee: f64,
    estimated_profit: f64,
    profit_rate: f64,
    break_even_roi: f64,
}

#[derive(Clone)]
struct HistorySummary {
    id: i64,
    product_name: String,
    created_at: String,
    selected_quantities: String,
}

#[derive(Clone)]
struct HistoryDetail {
    id: i64,
    product_name: String,
    unit_cost: f64,
    unit_weight: f64,
    selected_quantities: Vec<i32>,
    created_at: String,
    items: Vec<CalculationResult>,
}

struct Database {
    conn: Connection,
}

impl Database {
    fn new(path: PathBuf) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS sales_specs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL UNIQUE,
                sort_no INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS shipping_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                weight_min REAL NOT NULL,
                weight_max REAL NOT NULL,
                shipping_fee REAL NOT NULL,
                sort_no INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                config_key TEXT PRIMARY KEY,
                config_value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                unit_cost REAL NOT NULL,
                unit_weight REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS product_specs (
                product_id INTEGER NOT NULL,
                spec_id INTEGER NOT NULL,
                PRIMARY KEY (product_id, spec_id),
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY(spec_id) REFERENCES sales_specs(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS calc_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                unit_cost REAL NOT NULL,
                unit_weight REAL NOT NULL,
                selected_quantities TEXT NOT NULL,
                platform_fee_percent REAL NOT NULL,
                package_fee_mode TEXT NOT NULL,
                package_fee_value REAL NOT NULL,
                other_fee_mode TEXT NOT NULL,
                other_fee_value REAL NOT NULL,
                operation_fee REAL NOT NULL,
                target_profit_percent REAL NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS calc_history_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                history_id INTEGER NOT NULL,
                spec_name TEXT NOT NULL,
                spec_quantity INTEGER NOT NULL,
                goods_cost REAL NOT NULL,
                total_weight REAL NOT NULL,
                shipping_fee REAL NOT NULL,
                package_fee REAL NOT NULL,
                other_fee REAL NOT NULL,
                operation_fee REAL NOT NULL,
                total_cost REAL NOT NULL,
                raw_price REAL NOT NULL,
                final_price REAL NOT NULL,
                platform_fee REAL NOT NULL,
                profit REAL NOT NULL,
                profit_rate REAL NOT NULL,
                break_even_roi REAL NOT NULL,
                FOREIGN KEY(history_id) REFERENCES calc_history(id) ON DELETE CASCADE
            );
            "#,
        )?;

        let db = Self { conn };
        db.ensure_defaults()?;
        Ok(db)
    }

    fn ensure_defaults(&self) -> rusqlite::Result<()> {
        let spec_count: i64 =
            self.conn
                .query_row("SELECT COUNT(1) FROM sales_specs", [], |row| row.get(0))?;
        if spec_count == 0 {
            for (sort_no, qty) in [1_i32, 3, 5, 10, 20, 30, 50, 100].into_iter().enumerate() {
                self.conn.execute(
                    "INSERT INTO sales_specs (name, quantity, sort_no, enabled) VALUES (?1, ?2, ?3, 1)",
                    params![spec_display_name(qty), qty, sort_no as i64],
                )?;
            }
        }

        let current_rules = self.load_shipping_rules()?;
        if current_rules.is_empty() || looks_like_old_kg_defaults(&current_rules) {
            self.replace_shipping_rules(&default_shipping_rules())?;
        }

        for (key, value) in [
            ("platform_fee_percent", "8"),
            ("package_fee_mode", "fixed"),
            ("package_fee_value", "0"),
            ("other_fee_mode", "fixed"),
            ("other_fee_value", "0"),
            ("operation_fee", "0"),
            ("target_profit_percent", "20"),
        ] {
            self.conn.execute(
                "INSERT OR IGNORE INTO app_settings (config_key, config_value) VALUES (?1, ?2)",
                params![key, value],
            )?;
        }

        Ok(())
    }

    fn replace_shipping_rules(&self, rules: &[ShippingRule]) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM shipping_rules", [])?;
        for (sort_no, rule) in rules.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO shipping_rules (weight_min, weight_max, shipping_fee, sort_no, enabled)
                 VALUES (?1, ?2, ?3, ?4, 1)",
                params![rule.weight_min, rule.weight_max, rule.shipping_fee, sort_no as i64],
            )?;
        }
        Ok(())
    }

    fn load_settings(&self) -> rusqlite::Result<AppSettings> {
        let mut stmt = self
            .conn
            .prepare("SELECT config_key, config_value FROM app_settings")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut map = HashMap::new();
        for row in rows {
            let (key, value) = row?;
            map.insert(key, value);
        }

        Ok(AppSettings {
            platform_fee_percent: parse_f64(map.get("platform_fee_percent"), 8.0),
            package_fee_mode: FeeMode::from_str(
                map.get("package_fee_mode")
                    .map(String::as_str)
                    .unwrap_or("fixed"),
            ),
            package_fee_value: parse_f64(map.get("package_fee_value"), 0.0),
            other_fee_mode: FeeMode::from_str(
                map.get("other_fee_mode")
                    .map(String::as_str)
                    .unwrap_or("fixed"),
            ),
            other_fee_value: parse_f64(map.get("other_fee_value"), 0.0),
            operation_fee: parse_f64(map.get("operation_fee"), 0.0),
            target_profit_percent: parse_f64(map.get("target_profit_percent"), 20.0),
        })
    }

    fn save_settings(
        &self,
        settings: &AppSettings,
        shipping_rules: &[ShippingRule],
    ) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for (key, value) in [
            (
                "platform_fee_percent",
                settings.platform_fee_percent.to_string(),
            ),
            (
                "package_fee_mode",
                settings.package_fee_mode.as_str().to_string(),
            ),
            ("package_fee_value", settings.package_fee_value.to_string()),
            (
                "other_fee_mode",
                settings.other_fee_mode.as_str().to_string(),
            ),
            ("other_fee_value", settings.other_fee_value.to_string()),
            ("operation_fee", settings.operation_fee.to_string()),
            (
                "target_profit_percent",
                settings.target_profit_percent.to_string(),
            ),
        ] {
            tx.execute(
                "INSERT INTO app_settings (config_key, config_value) VALUES (?1, ?2)
                 ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value",
                params![key, value],
            )?;
        }

        tx.execute("DELETE FROM shipping_rules", [])?;
        for (idx, rule) in shipping_rules.iter().enumerate() {
            tx.execute(
                "INSERT INTO shipping_rules (weight_min, weight_max, shipping_fee, sort_no, enabled)
                 VALUES (?1, ?2, ?3, ?4, 1)",
                params![rule.weight_min, rule.weight_max, rule.shipping_fee, idx as i64],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    fn load_specs(&self) -> rusqlite::Result<Vec<SalesSpec>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, quantity FROM sales_specs WHERE enabled = 1 ORDER BY quantity ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SalesSpec {
                id: row.get(0)?,
                quantity: row.get(1)?,
            })
        })?;

        let mut specs = Vec::new();
        for row in rows {
            specs.push(row?);
        }
        Ok(specs)
    }

    fn add_spec(&self, quantity: i32) -> rusqlite::Result<()> {
        let sort_no: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(sort_no), 0) + 1 FROM sales_specs",
            [],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO sales_specs (name, quantity, sort_no, enabled)
             VALUES (?1, ?2, ?3, 1)
             ON CONFLICT(quantity) DO UPDATE SET name=excluded.name, enabled=1",
            params![spec_display_name(quantity), quantity, sort_no],
        )?;
        Ok(())
    }

    fn delete_spec(&self, spec_id: i64) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM sales_specs WHERE id = ?1", params![spec_id])?;
        Ok(())
    }

    fn load_shipping_rules(&self) -> rusqlite::Result<Vec<ShippingRule>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, weight_min, weight_max, shipping_fee
             FROM shipping_rules
             WHERE enabled = 1
             ORDER BY weight_min ASC, weight_max ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ShippingRule {
                id: row.get(0)?,
                weight_min: row.get(1)?,
                weight_max: row.get(2)?,
                shipping_fee: row.get(3)?,
            })
        })?;

        let mut rules = Vec::new();
        for row in rows {
            rules.push(row?);
        }
        Ok(rules)
    }

    fn upsert_product(
        &self,
        name: &str,
        unit_cost: f64,
        unit_weight: f64,
        selected_spec_ids: &[i64],
    ) -> rusqlite::Result<i64> {
        let now = now_string();
        let product_id: Option<i64> = self
            .conn
            .query_row(
                "SELECT id FROM products WHERE name = ?1",
                params![name],
                |row| row.get(0),
            )
            .optional()?;

        let tx = self.conn.unchecked_transaction()?;
        let id = if let Some(id) = product_id {
            tx.execute(
                "UPDATE products
                 SET unit_cost = ?1, unit_weight = ?2, updated_at = ?3
                 WHERE id = ?4",
                params![unit_cost, unit_weight, now, id],
            )?;
            id
        } else {
            tx.execute(
                "INSERT INTO products (name, unit_cost, unit_weight, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                params![name, unit_cost, unit_weight, now],
            )?;
            tx.last_insert_rowid()
        };

        tx.execute(
            "DELETE FROM product_specs WHERE product_id = ?1",
            params![id],
        )?;
        for spec_id in selected_spec_ids {
            tx.execute(
                "INSERT INTO product_specs (product_id, spec_id) VALUES (?1, ?2)",
                params![id, spec_id],
            )?;
        }
        tx.commit()?;
        Ok(id)
    }

    fn load_recent_products(&self, limit: usize) -> rusqlite::Result<Vec<ProductSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, unit_cost, unit_weight, updated_at
             FROM products
             ORDER BY updated_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?;

        let mut products = Vec::new();
        for row in rows {
            let (id, name, unit_cost, unit_weight, updated_at) = row?;
            let spec_names = self.load_product_spec_names(id)?;
            products.push(ProductSummary {
                id,
                name,
                unit_cost,
                unit_weight,
                spec_names: spec_names.join(" / "),
                updated_at,
            });
        }
        Ok(products)
    }

    fn load_product_spec_names(&self, product_id: i64) -> rusqlite::Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.quantity
             FROM product_specs ps
             JOIN sales_specs s ON s.id = ps.spec_id
             WHERE ps.product_id = ?1
             ORDER BY s.quantity ASC",
        )?;
        let rows = stmt.query_map(params![product_id], |row| row.get::<_, i32>(0))?;

        let mut names = Vec::new();
        for row in rows {
            names.push(spec_display_name(row?));
        }
        Ok(names)
    }

    fn load_product(&self, product_id: i64) -> rusqlite::Result<ProductDetail> {
        let (id, name, unit_cost, unit_weight) = self.conn.query_row(
            "SELECT id, name, unit_cost, unit_weight FROM products WHERE id = ?1",
            params![product_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT spec_id FROM product_specs WHERE product_id = ?1 ORDER BY spec_id ASC",
        )?;
        let rows = stmt.query_map(params![product_id], |row| row.get::<_, i64>(0))?;
        let mut selected_spec_ids = Vec::new();
        for row in rows {
            selected_spec_ids.push(row?);
        }

        Ok(ProductDetail {
            id,
            name,
            unit_cost,
            unit_weight,
            selected_spec_ids,
        })
    }

    fn delete_product(&self, product_id: i64) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        let mut history_ids = Vec::new();
        {
            let mut stmt = tx.prepare("SELECT id FROM calc_history WHERE product_id = ?1")?;
            let rows = stmt.query_map(params![product_id], |row| row.get::<_, i64>(0))?;
            for row in rows {
                history_ids.push(row?);
            }
        }

        for history_id in history_ids {
            tx.execute(
                "DELETE FROM calc_history_items WHERE history_id = ?1",
                params![history_id],
            )?;
        }
        tx.execute(
            "DELETE FROM calc_history WHERE product_id = ?1",
            params![product_id],
        )?;
        tx.execute(
            "DELETE FROM product_specs WHERE product_id = ?1",
            params![product_id],
        )?;
        tx.execute("DELETE FROM products WHERE id = ?1", params![product_id])?;
        tx.commit()?;
        Ok(())
    }

    fn insert_history(
        &self,
        product_id: i64,
        product_name: &str,
        unit_cost: f64,
        unit_weight: f64,
        settings: &AppSettings,
        results: &[CalculationResult],
    ) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        let selected_quantities = results
            .iter()
            .map(|item| item.spec_quantity.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let created_at = now_string();

        tx.execute(
            "INSERT INTO calc_history (
                product_id, product_name, unit_cost, unit_weight, selected_quantities,
                platform_fee_percent, package_fee_mode, package_fee_value, other_fee_mode,
                other_fee_value, operation_fee, target_profit_percent, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                product_id,
                product_name,
                unit_cost,
                unit_weight,
                selected_quantities,
                settings.platform_fee_percent,
                settings.package_fee_mode.as_str(),
                settings.package_fee_value,
                settings.other_fee_mode.as_str(),
                settings.other_fee_value,
                settings.operation_fee,
                settings.target_profit_percent,
                created_at,
            ],
        )?;
        let history_id = tx.last_insert_rowid();

        for item in results {
            tx.execute(
                "INSERT INTO calc_history_items (
                    history_id, spec_name, spec_quantity, goods_cost, total_weight, shipping_fee,
                    package_fee, other_fee, operation_fee, total_cost, raw_price, final_price,
                    platform_fee, profit, profit_rate, break_even_roi
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                params![
                    history_id,
                    item.spec_name,
                    item.spec_quantity,
                    item.goods_cost,
                    item.total_weight,
                    item.shipping_fee,
                    item.package_fee,
                    item.other_fee,
                    item.operation_fee,
                    item.total_cost,
                    item.raw_suggested_price,
                    item.final_suggested_price,
                    item.platform_fee,
                    item.estimated_profit,
                    item.profit_rate,
                    item.break_even_roi,
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    fn load_history_summaries(&self, keyword: &str) -> rusqlite::Result<Vec<HistorySummary>> {
        let mut rows = Vec::new();
        if keyword.trim().is_empty() {
            let mut stmt = self.conn.prepare(
                "SELECT id, product_name, created_at, selected_quantities
                 FROM calc_history
                 ORDER BY created_at DESC
                 LIMIT 100",
            )?;
            let mapped = stmt.query_map([], |row| {
                Ok(HistorySummary {
                    id: row.get(0)?,
                    product_name: row.get(1)?,
                    created_at: row.get(2)?,
                    selected_quantities: row.get(3)?,
                })
            })?;
            for row in mapped {
                rows.push(row?);
            }
        } else {
            let like = format!("%{}%", keyword.trim());
            let mut stmt = self.conn.prepare(
                "SELECT id, product_name, created_at, selected_quantities
                 FROM calc_history
                 WHERE product_name LIKE ?1
                 ORDER BY created_at DESC
                 LIMIT 100",
            )?;
            let mapped = stmt.query_map(params![like], |row| {
                Ok(HistorySummary {
                    id: row.get(0)?,
                    product_name: row.get(1)?,
                    created_at: row.get(2)?,
                    selected_quantities: row.get(3)?,
                })
            })?;
            for row in mapped {
                rows.push(row?);
            }
        }
        Ok(rows)
    }

    fn load_history_detail(&self, history_id: i64) -> rusqlite::Result<HistoryDetail> {
        let (id, product_name, unit_cost, unit_weight, selected_quantities, created_at) =
            self.conn.query_row(
                "SELECT id, product_name, unit_cost, unit_weight, selected_quantities, created_at
                 FROM calc_history
                 WHERE id = ?1",
                params![history_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, f64>(2)?,
                        row.get::<_, f64>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )?;

        let mut stmt = self.conn.prepare(
            "SELECT spec_name, spec_quantity, goods_cost, total_weight, shipping_fee, package_fee,
                    other_fee, operation_fee, total_cost, raw_price, final_price, platform_fee,
                    profit, profit_rate, break_even_roi
             FROM calc_history_items
             WHERE history_id = ?1
             ORDER BY spec_quantity ASC",
        )?;
        let item_rows = stmt.query_map(params![history_id], |row| {
            Ok(CalculationResult {
                spec_name: row.get(0)?,
                spec_quantity: row.get(1)?,
                goods_cost: row.get(2)?,
                total_weight: row.get(3)?,
                shipping_fee: row.get(4)?,
                package_fee: row.get(5)?,
                other_fee: row.get(6)?,
                operation_fee: row.get(7)?,
                total_cost: row.get(8)?,
                raw_suggested_price: row.get(9)?,
                final_suggested_price: row.get(10)?,
                platform_fee: row.get(11)?,
                estimated_profit: row.get(12)?,
                profit_rate: row.get(13)?,
                break_even_roi: row.get(14)?,
            })
        })?;

        let mut items = Vec::new();
        for row in item_rows {
            items.push(row?);
        }

        Ok(HistoryDetail {
            id,
            product_name,
            unit_cost,
            unit_weight,
            selected_quantities: parse_quantities(&selected_quantities),
            created_at,
            items,
        })
    }

    fn delete_history(&self, history_id: i64) -> rusqlite::Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM calc_history_items WHERE history_id = ?1",
            params![history_id],
        )?;
        tx.execute(
            "DELETE FROM calc_history WHERE id = ?1",
            params![history_id],
        )?;
        tx.commit()?;
        Ok(())
    }
}

struct SkuApp {
    db: Database,
    product_name: String,
    unit_cost_input: String,
    unit_weight_input: String,
    selected_spec_ids: BTreeSet<i64>,
    specs: Vec<SalesSpec>,
    new_spec_quantity_input: String,
    settings: AppSettings,
    shipping_rules: Vec<ShippingRule>,
    new_rule_min_input: String,
    new_rule_max_input: String,
    new_rule_fee_input: String,
    recent_products: Vec<ProductSummary>,
    history_keyword: String,
    history_summaries: Vec<HistorySummary>,
    selected_history: Option<HistoryDetail>,
    current_results: Vec<CalculationResult>,
    show_settings: bool,
    show_history: bool,
    status_message: String,
}

impl SkuApp {
    fn new(db_path: PathBuf) -> rusqlite::Result<Self> {
        let db = Database::new(db_path)?;
        let settings = db.load_settings()?;
        let specs = db.load_specs()?;
        let shipping_rules = db.load_shipping_rules()?;
        let recent_products = db.load_recent_products(20)?;
        let history_summaries = db.load_history_summaries("")?;

        Ok(Self {
            db,
            product_name: String::new(),
            unit_cost_input: String::new(),
            unit_weight_input: String::new(),
            selected_spec_ids: BTreeSet::new(),
            specs,
            new_spec_quantity_input: String::new(),
            settings,
            shipping_rules,
            new_rule_min_input: String::new(),
            new_rule_max_input: String::new(),
            new_rule_fee_input: String::new(),
            recent_products,
            history_keyword: String::new(),
            history_summaries,
            selected_history: None,
            current_results: Vec::new(),
            show_settings: false,
            show_history: false,
            status_message: "已就绪".to_string(),
        })
    }

    fn refresh_specs(&mut self) {
        match self.db.load_specs() {
            Ok(specs) => self.specs = specs,
            Err(err) => self.status_message = format!("读取规格失败: {err}"),
        }
    }

    fn refresh_recent_products(&mut self) {
        match self.db.load_recent_products(20) {
            Ok(products) => self.recent_products = products,
            Err(err) => self.status_message = format!("读取最近商品失败: {err}"),
        }
    }

    fn refresh_history(&mut self) {
        match self.db.load_history_summaries(&self.history_keyword) {
            Ok(items) => self.history_summaries = items,
            Err(err) => self.status_message = format!("读取历史记录失败: {err}"),
        }
    }

    fn add_spec(&mut self) {
        let quantity = self
            .new_spec_quantity_input
            .trim()
            .parse::<i32>()
            .unwrap_or_default();
        if quantity <= 0 {
            self.status_message = "规格数量必须大于 0".to_string();
            return;
        }
        match self.db.add_spec(quantity) {
            Ok(_) => {
                self.refresh_specs();
                if let Some(spec) = self.specs.iter().find(|spec| spec.quantity == quantity) {
                    self.selected_spec_ids.insert(spec.id);
                }
                self.new_spec_quantity_input.clear();
                self.status_message = format!("已添加规格 {}", spec_display_name(quantity));
            }
            Err(err) => self.status_message = format!("添加规格失败: {err}"),
        }
    }

    fn delete_spec(&mut self, spec_id: i64) {
        match self.db.delete_spec(spec_id) {
            Ok(_) => {
                self.selected_spec_ids.remove(&spec_id);
                self.refresh_specs();
                self.status_message = "规格已删除".to_string();
            }
            Err(err) => self.status_message = format!("删除规格失败: {err}"),
        }
    }

    fn delete_product(&mut self, product_id: i64) {
        match self.db.delete_product(product_id) {
            Ok(_) => {
                self.refresh_recent_products();
                self.refresh_history();
                self.status_message = "商品数据已删除".to_string();
            }
            Err(err) => self.status_message = format!("删除商品失败: {err}"),
        }
    }

    fn delete_history(&mut self, history_id: i64) {
        match self.db.delete_history(history_id) {
            Ok(_) => {
                if self
                    .selected_history
                    .as_ref()
                    .map(|detail| detail.id == history_id)
                    .unwrap_or(false)
                {
                    self.selected_history = None;
                }
                self.refresh_history();
                self.status_message = "历史记录已删除".to_string();
            }
            Err(err) => self.status_message = format!("删除历史记录失败: {err}"),
        }
    }

    fn validate_shipping_rules(&self) -> Result<(), String> {
        if self.shipping_rules.is_empty() {
            return Err("至少保留一条重量运费规则".to_string());
        }

        let mut rules = self.shipping_rules.clone();
        rules.sort_by(|a, b| a.weight_min.total_cmp(&b.weight_min));

        for rule in &rules {
            if rule.weight_min < 0.0 || rule.weight_max <= 0.0 || rule.shipping_fee < 0.0 {
                return Err("重量和运费不能为负数，且最大重量必须大于 0".to_string());
            }
            if rule.weight_max <= rule.weight_min {
                return Err("重量区间的最大值必须大于最小值".to_string());
            }
        }

        for window in rules.windows(2) {
            if let [left, right] = window
                && right.weight_min <= left.weight_max
            {
                return Err("重量区间存在重叠，请调整后保存".to_string());
            }
        }

        Ok(())
    }

    fn save_settings(&mut self) {
        if self.settings.platform_fee_percent < 0.0 {
            self.status_message = "平台扣点不能小于 0".to_string();
            return;
        }
        if self.settings.target_profit_percent < 0.0 {
            self.status_message = "目标毛利率不能小于 0".to_string();
            return;
        }
        if let Err(err) = self.validate_shipping_rules() {
            self.status_message = err;
            return;
        }

        match self.db.save_settings(&self.settings, &self.shipping_rules) {
            Ok(_) => {
                self.shipping_rules = self.db.load_shipping_rules().unwrap_or_default();
                self.status_message = "设置已保存".to_string();
            }
            Err(err) => self.status_message = format!("保存设置失败: {err}"),
        }
    }

    fn load_product_into_form(&mut self, product_id: i64) {
        match self.db.load_product(product_id) {
            Ok(product) => {
                let _ = product.id;
                self.product_name = product.name;
                self.unit_cost_input = format_money(product.unit_cost);
                self.unit_weight_input = format_weight_value(product.unit_weight);
                self.selected_spec_ids = product.selected_spec_ids.into_iter().collect();
                self.calculate_only();
                self.status_message = "已加载商品，可直接重新计算".to_string();
            }
            Err(err) => self.status_message = format!("加载商品失败: {err}"),
        }
    }

    fn ensure_specs_for_quantities(&mut self, quantities: &[i32]) {
        let mut existing_map = self
            .specs
            .iter()
            .map(|spec| (spec.quantity, spec.id))
            .collect::<HashMap<_, _>>();
        let mut changed = false;

        for qty in quantities {
            if *qty > 0 && !existing_map.contains_key(qty) {
                if self.db.add_spec(*qty).is_ok() {
                    changed = true;
                }
            }
        }

        if changed {
            self.refresh_specs();
            existing_map = self
                .specs
                .iter()
                .map(|spec| (spec.quantity, spec.id))
                .collect::<HashMap<_, _>>();
        }

        self.selected_spec_ids.clear();
        for qty in quantities {
            if let Some(spec_id) = existing_map.get(qty) {
                self.selected_spec_ids.insert(*spec_id);
            }
        }
    }

    fn load_history_into_form(&mut self, history_id: i64) {
        match self.db.load_history_detail(history_id) {
            Ok(detail) => {
                self.product_name = detail.product_name.clone();
                self.unit_cost_input = format_money(detail.unit_cost);
                self.unit_weight_input = format_weight_value(detail.unit_weight);
                self.ensure_specs_for_quantities(&detail.selected_quantities);
                self.selected_history = Some(detail);
                self.calculate_only();
                self.status_message = "历史记录已回填到主界面".to_string();
            }
            Err(err) => self.status_message = format!("加载历史记录失败: {err}"),
        }
    }

    fn save_and_calculate(&mut self) {
        let name = self.product_name.trim().to_string();
        if name.is_empty() {
            self.status_message = "请输入商品名称".to_string();
            return;
        }
        if self.selected_spec_ids.is_empty() {
            self.status_message = "请至少选择一个销售规格".to_string();
            return;
        }

        let unit_cost = match self.unit_cost_input.trim().parse::<f64>() {
            Ok(value) if value >= 0.0 => value,
            _ => {
                self.status_message = "产品成本格式不正确".to_string();
                return;
            }
        };
        let unit_weight = match self.unit_weight_input.trim().parse::<f64>() {
            Ok(value) if value > 0.0 => value,
            _ => {
                self.status_message = "重量格式不正确，且必须大于 0".to_string();
                return;
            }
        };

        let results = self.calculate_results(unit_cost, unit_weight);
        if results.is_empty() {
            self.status_message = "当前没有可计算的规格结果".to_string();
            return;
        }

        let selected_ids = self.selected_spec_ids.iter().copied().collect::<Vec<_>>();
        match self
            .db
            .upsert_product(&name, unit_cost, unit_weight, &selected_ids)
        {
            Ok(product_id) => match self.db.insert_history(
                product_id,
                &name,
                unit_cost,
                unit_weight,
                &self.settings,
                &results,
            ) {
                Ok(_) => {
                    self.current_results = results;
                    self.refresh_recent_products();
                    self.refresh_history();
                    self.status_message = "商品已保存并完成计算".to_string();
                }
                Err(err) => self.status_message = format!("保存历史记录失败: {err}"),
            },
            Err(err) => self.status_message = format!("保存商品失败: {err}"),
        }
    }

    fn calculate_only(&mut self) {
        let unit_cost = match self.unit_cost_input.trim().parse::<f64>() {
            Ok(value) if value >= 0.0 => value,
            _ => {
                self.status_message = "产品成本格式不正确".to_string();
                return;
            }
        };
        let unit_weight = match self.unit_weight_input.trim().parse::<f64>() {
            Ok(value) if value > 0.0 => value,
            _ => {
                self.status_message = "重量格式不正确，且必须大于 0".to_string();
                return;
            }
        };
        self.current_results = self.calculate_results(unit_cost, unit_weight);
        self.status_message = "已完成本次计算".to_string();
    }

    fn calculate_results(&self, unit_cost: f64, unit_weight: f64) -> Vec<CalculationResult> {
        let mut selected_specs = self
            .specs
            .iter()
            .filter(|spec| self.selected_spec_ids.contains(&spec.id))
            .cloned()
            .collect::<Vec<_>>();
        selected_specs.sort_by_key(|spec| spec.quantity);

        let platform_rate = self.settings.platform_fee_percent / 100.0;
        let package_percent = match self.settings.package_fee_mode {
            FeeMode::Percent => self.settings.package_fee_value / 100.0,
            FeeMode::Fixed => 0.0,
        };
        let other_percent = match self.settings.other_fee_mode {
            FeeMode::Percent => self.settings.other_fee_value / 100.0,
            FeeMode::Fixed => 0.0,
        };
        let target_profit_rate = self.settings.target_profit_percent / 100.0;

        selected_specs
            .into_iter()
            .map(|spec| {
                let goods_cost = unit_cost * spec.quantity as f64;
                let total_weight = unit_weight * spec.quantity as f64;
                let shipping_fee = self.lookup_shipping_fee(total_weight);

                let package_fee_fixed = match self.settings.package_fee_mode {
                    FeeMode::Fixed => self.settings.package_fee_value,
                    FeeMode::Percent => 0.0,
                };
                let other_fee_fixed = match self.settings.other_fee_mode {
                    FeeMode::Fixed => self.settings.other_fee_value,
                    FeeMode::Percent => 0.0,
                };

                let fixed_cost_base = goods_cost
                    + shipping_fee
                    + self.settings.operation_fee
                    + package_fee_fixed
                    + other_fee_fixed;
                let denominator =
                    1.0 - platform_rate - package_percent - other_percent - target_profit_rate;
                let raw_suggested_price = if denominator > 0.0 {
                    fixed_cost_base / denominator
                } else {
                    0.0
                };
                let final_suggested_price = if raw_suggested_price > 0.0 {
                    (raw_suggested_price.ceil() - 0.1).max(0.1)
                } else {
                    0.0
                };

                let platform_fee = final_suggested_price * platform_rate;
                let package_fee = match self.settings.package_fee_mode {
                    FeeMode::Fixed => self.settings.package_fee_value,
                    FeeMode::Percent => final_suggested_price * package_percent,
                };
                let other_fee = match self.settings.other_fee_mode {
                    FeeMode::Fixed => self.settings.other_fee_value,
                    FeeMode::Percent => final_suggested_price * other_percent,
                };
                let total_cost = goods_cost
                    + shipping_fee
                    + package_fee
                    + other_fee
                    + self.settings.operation_fee;
                let estimated_profit = final_suggested_price - total_cost - platform_fee;
                let profit_rate = if final_suggested_price > 0.0 {
                    estimated_profit / final_suggested_price
                } else {
                    0.0
                };
                let break_even_roi = if profit_rate > 0.0 {
                    1.0 / profit_rate
                } else {
                    0.0
                };

                CalculationResult {
                    spec_name: spec_display_name(spec.quantity),
                    spec_quantity: spec.quantity,
                    goods_cost,
                    total_weight,
                    shipping_fee,
                    package_fee,
                    other_fee,
                    operation_fee: self.settings.operation_fee,
                    total_cost,
                    raw_suggested_price,
                    final_suggested_price,
                    platform_fee,
                    estimated_profit,
                    profit_rate,
                    break_even_roi,
                }
            })
            .collect()
    }

    fn lookup_shipping_fee(&self, weight: f64) -> f64 {
        self.shipping_rules
            .iter()
            .find(|rule| weight >= rule.weight_min && weight <= rule.weight_max)
            .map(|rule| rule.shipping_fee)
            .unwrap_or(0.0)
    }

    fn draw_main_ui(&mut self, ctx: &egui::Context) {
        let mut pending_delete_spec = None;
        let mut pending_load_product = None;
        let mut pending_delete_product = None;

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label("名称");
                ui.add(egui::TextEdit::singleline(&mut self.product_name).desired_width(260.0));
                ui.label("成本");
                ui.add(
                    egui::TextEdit::singleline(&mut self.unit_cost_input)
                        .desired_width(110.0)
                        .hint_text("例如 8.7"),
                );
                ui.label("重量");
                ui.add(
                    egui::TextEdit::singleline(&mut self.unit_weight_input)
                        .desired_width(110.0)
                        .hint_text("g"),
                );
                if ui.button("设置").clicked() {
                    self.show_settings = true;
                }
                if ui.button("历史记录").clicked() {
                    self.show_history = true;
                    self.refresh_history();
                }
                if ui.button("仅计算").clicked() {
                    self.calculate_only();
                }
                if ui.button("添加并保存").clicked() {
                    self.save_and_calculate();
                }
            });

            ui.add_space(10.0);
            ui.horizontal(|ui| {
                ui.label("新增规格数量");
                ui.add(
                    egui::TextEdit::singleline(&mut self.new_spec_quantity_input)
                        .desired_width(70.0),
                );
                if ui.button("添加规格").clicked() {
                    self.add_spec();
                }
            });

            ui.add_space(6.0);
            egui::ScrollArea::vertical()
                .id_salt("spec_list")
                .max_height(120.0)
                .show(ui, |ui| {
                    ui.horizontal_wrapped(|ui| {
                        for spec in self.specs.clone() {
                            let spec_label = spec_display_name(spec.quantity);
                            let desired_size =
                                egui::vec2(64.0 + spec_label.chars().count() as f32 * 14.0, 46.0);
                            let (rect, response) =
                                ui.allocate_exact_size(desired_size, egui::Sense::hover());
                            let hovered = response.hovered();

                            ui.allocate_ui_at_rect(rect, |ui| {
                                egui::Frame::group(ui.style()).show(ui, |ui| {
                                    ui.set_min_size(desired_size);
                                    ui.spacing_mut().item_spacing = egui::vec2(4.0, 2.0);
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::TOP),
                                        |ui| {
                                            ui.scope(|ui| {
                                                if !hovered {
                                                    ui.visuals_mut().override_text_color =
                                                        Some(egui::Color32::TRANSPARENT);
                                                }
                                                let button = egui::Button::new(
                                                    egui::RichText::new("x").size(9.0),
                                                )
                                                .frame(false)
                                                .min_size(egui::vec2(10.0, 10.0));
                                                if ui.add_enabled(hovered, button).clicked() {
                                                    pending_delete_spec = Some(spec.id);
                                                }
                                            });
                                        },
                                    );
                                    ui.scope(|ui| {
                                        ui.spacing_mut().interact_size = egui::vec2(26.0, 26.0);
                                        ui.horizontal(|ui| {
                                            let mut checked =
                                                self.selected_spec_ids.contains(&spec.id);
                                            let checkbox = egui::Checkbox::new(
                                                &mut checked,
                                                egui::RichText::new(spec_label).size(20.0),
                                            );
                                            if ui.add(checkbox).changed() {
                                                if checked {
                                                    self.selected_spec_ids.insert(spec.id);
                                                } else {
                                                    self.selected_spec_ids.remove(&spec.id);
                                                }
                                            }
                                        });
                                    });
                                });
                            });
                        }
                    });
                });

            ui.separator();
            ui.heading("计算结果");
            ui.add_space(6.0);
            let product_name = if self.product_name.trim().is_empty() {
                "-".to_string()
            } else {
                self.product_name.trim().to_string()
            };
            egui::ScrollArea::vertical()
                .id_salt("result_table")
                .max_height(300.0)
                .show(ui, |ui| {
                    egui::Grid::new("result_grid")
                        .striped(true)
                        .min_col_width(80.0)
                        .show(ui, |ui| {
                            ui.strong("名称");
                            ui.strong("规格");
                            ui.strong("商品成本");
                            ui.strong("总重量");
                            ui.strong("运费");
                            ui.strong("包装");
                            ui.strong("其它");
                            ui.strong("运营");
                            ui.strong("总成本");
                            ui.strong("建议售价");
                            ui.strong("毛利率");
                            ui.strong("保本ROI");
                            ui.end_row();

                            for item in &self.current_results {
                                ui.label(&product_name);
                                ui.label(&item.spec_name);
                                ui.label(format_money(item.goods_cost));
                                ui.label(format_weight(item.total_weight));
                                ui.label(format_money(item.shipping_fee));
                                ui.label(format_money(item.package_fee));
                                ui.label(format_money(item.other_fee));
                                ui.label(format_money(item.operation_fee));
                                ui.label(format_money(item.total_cost));
                                ui.label(format_money(item.final_suggested_price));
                                ui.label(format_percent_ratio(item.profit_rate));
                                ui.label(format_ratio(item.break_even_roi));
                                ui.end_row();
                            }
                        });
                });

            ui.separator();
            ui.heading("最近添加的商品");
            ui.label("双击商品可回填到主界面重新计算");
            egui::ScrollArea::vertical()
                .id_salt("recent_products")
                .max_height(220.0)
                .show(ui, |ui| {
                    for product in self.recent_products.clone() {
                        ui.horizontal(|ui| {
                            let response = ui.add(
                                egui::Button::new(format!(
                                    "{} | 成本 {} | 重量 {} | 规格 {} | {}",
                                    product.name,
                                    format_money(product.unit_cost),
                                    format_weight(product.unit_weight),
                                    product.spec_names,
                                    product.updated_at
                                ))
                                .selected(false),
                            );
                            if response.double_clicked() {
                                pending_load_product = Some(product.id);
                            }
                            if ui.add_sized([34.0, 30.0], egui::Button::new("X")).clicked() {
                                pending_delete_product = Some(product.id);
                            }
                        });
                    }
                });
        });

        if let Some(spec_id) = pending_delete_spec {
            self.delete_spec(spec_id);
        }
        if let Some(product_id) = pending_load_product {
            self.load_product_into_form(product_id);
        }
        if let Some(product_id) = pending_delete_product {
            self.delete_product(product_id);
        }
    }

    fn draw_settings_window(&mut self, ctx: &egui::Context) {
        let mut pending_remove_rule_index = None;
        let mut open = self.show_settings;
        ctx.show_viewport_immediate(
            egui::ViewportId::from_hash_of("settings_viewport"),
            egui::ViewportBuilder::default()
                .with_title("设置")
                .with_inner_size([920.0, 760.0]),
            |ctx, _class| {
                if ctx.input(|input| input.viewport().close_requested()) {
                    open = false;
                }
                egui::CentralPanel::default().show(ctx, |ui| {
                    ui.heading("费用设置");
                    ui.add_space(6.0);

                    ui.horizontal(|ui| {
                        ui.label("平台扣点（仅百分比）");
                        ui.add(
                            egui::DragValue::new(&mut self.settings.platform_fee_percent)
                                .range(0.0..=100.0)
                                .speed(0.1)
                                .suffix("%"),
                        );
                    });

                    ui.horizontal(|ui| {
                        ui.label("包装成本");
                        fee_mode_combo(ui, "package_fee_mode", &mut self.settings.package_fee_mode);
                        let suffix = if self.settings.package_fee_mode == FeeMode::Percent {
                            "%"
                        } else {
                            " 元"
                        };
                        ui.add(
                            egui::DragValue::new(&mut self.settings.package_fee_value)
                                .range(0.0..=999_999.0)
                                .speed(0.1)
                                .suffix(suffix),
                        );
                    });

                    ui.horizontal(|ui| {
                        ui.label("其它成本");
                        fee_mode_combo(ui, "other_fee_mode", &mut self.settings.other_fee_mode);
                        let suffix = if self.settings.other_fee_mode == FeeMode::Percent {
                            "%"
                        } else {
                            " 元"
                        };
                        ui.add(
                            egui::DragValue::new(&mut self.settings.other_fee_value)
                                .range(0.0..=999_999.0)
                                .speed(0.1)
                                .suffix(suffix),
                        );
                    });

                    ui.horizontal(|ui| {
                        ui.label("运营费用（固定值）");
                        ui.add(
                            egui::DragValue::new(&mut self.settings.operation_fee)
                                .range(0.0..=999_999.0)
                                .speed(0.1)
                                .suffix(" 元"),
                        );
                    });

                    ui.horizontal(|ui| {
                        ui.label("目标毛利率");
                        ui.add(
                            egui::DragValue::new(&mut self.settings.target_profit_percent)
                                .range(0.0..=100.0)
                                .speed(0.1)
                                .suffix("%"),
                        );
                    });

                    ui.separator();
                    ui.heading("重量区间运费");
                    ui.label(
                        "默认单位为 g，规则按“重量 >= 最小值 且 重量 <= 最大值”命中，区间不可重叠",
                    );
                    ui.add_space(6.0);
                    egui::Grid::new("shipping_rules_grid")
                        .striped(true)
                        .min_col_width(80.0)
                        .show(ui, |ui| {
                            ui.strong("最小重量");
                            ui.strong("最大重量");
                            ui.strong("运费");
                            ui.strong("操作");
                            ui.end_row();

                            for (idx, rule) in self.shipping_rules.iter_mut().enumerate() {
                                ui.add(
                                    egui::DragValue::new(&mut rule.weight_min)
                                        .range(0.0..=999_999.0)
                                        .speed(1.0)
                                        .suffix(" g"),
                                );
                                ui.add(
                                    egui::DragValue::new(&mut rule.weight_max)
                                        .range(0.0..=999_999.0)
                                        .speed(1.0)
                                        .suffix(" g"),
                                );
                                ui.add(
                                    egui::DragValue::new(&mut rule.shipping_fee)
                                        .range(0.0..=999_999.0)
                                        .speed(0.1)
                                        .suffix(" 元"),
                                );
                                if ui.small_button("删除").clicked() {
                                    pending_remove_rule_index = Some(idx);
                                }
                                ui.end_row();
                            }
                        });

                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        ui.label("新增区间");
                        ui.add(
                            egui::TextEdit::singleline(&mut self.new_rule_min_input)
                                .desired_width(70.0)
                                .hint_text("最小 g"),
                        );
                        ui.add(
                            egui::TextEdit::singleline(&mut self.new_rule_max_input)
                                .desired_width(70.0)
                                .hint_text("最大 g"),
                        );
                        ui.add(
                            egui::TextEdit::singleline(&mut self.new_rule_fee_input)
                                .desired_width(70.0)
                                .hint_text("运费"),
                        );
                        if ui.button("添加运费规则").clicked() {
                            let parsed = (
                                self.new_rule_min_input.trim().parse::<f64>(),
                                self.new_rule_max_input.trim().parse::<f64>(),
                                self.new_rule_fee_input.trim().parse::<f64>(),
                            );
                            match parsed {
                                (Ok(min), Ok(max), Ok(fee)) => {
                                    self.shipping_rules.push(ShippingRule {
                                        id: 0,
                                        weight_min: min,
                                        weight_max: max,
                                        shipping_fee: fee,
                                    });
                                    self.shipping_rules
                                        .sort_by(|a, b| a.weight_min.total_cmp(&b.weight_min));
                                    self.new_rule_min_input.clear();
                                    self.new_rule_max_input.clear();
                                    self.new_rule_fee_input.clear();
                                    self.status_message =
                                        "已加入新的运费规则，记得保存设置".to_string();
                                }
                                _ => {
                                    self.status_message =
                                        "新增运费规则的输入格式不正确".to_string();
                                }
                            }
                        }
                    });

                    ui.separator();
                    if ui.button("保存设置").clicked() {
                        self.save_settings();
                    }
                });
            },
        );

        if let Some(idx) = pending_remove_rule_index {
            if idx < self.shipping_rules.len() {
                let _ = self.shipping_rules[idx].id;
                self.shipping_rules.remove(idx);
                self.status_message = "已移除一条运费规则，记得保存设置".to_string();
            }
        }

        self.show_settings = open;
    }

    fn draw_history_window(&mut self, ctx: &egui::Context) {
        let mut open = self.show_history;
        let mut pending_open_history = None;
        let mut pending_load_to_form = None;
        let mut pending_delete_history = None;

        ctx.show_viewport_immediate(
            egui::ViewportId::from_hash_of("history_viewport"),
            egui::ViewportBuilder::default()
                .with_title("历史记录")
                .with_inner_size([1080.0, 760.0]),
            |ctx, _class| {
                if ctx.input(|input| input.viewport().close_requested()) {
                    open = false;
                }
                egui::CentralPanel::default().show(ctx, |ui| {
                    ui.horizontal(|ui| {
                        ui.label("商品名称");
                        ui.text_edit_singleline(&mut self.history_keyword);
                        if ui.button("查询").clicked() {
                            self.refresh_history();
                        }
                    });

                    ui.separator();
                    ui.columns(2, |columns| {
                        columns[0].heading("记录列表");
                        egui::ScrollArea::vertical()
                            .id_salt("history_list")
                            .max_height(560.0)
                            .show(&mut columns[0], |ui| {
                                for item in self.history_summaries.clone() {
                                    ui.horizontal(|ui| {
                                        let text = format!(
                                            "{} | 规格 {} | {}",
                                            item.product_name,
                                            item.selected_quantities,
                                            item.created_at
                                        );
                                        let response =
                                            ui.add(egui::Button::new(text).selected(false));
                                        if response.clicked() {
                                            pending_open_history = Some(item.id);
                                        }
                                        if response.double_clicked() {
                                            pending_load_to_form = Some(item.id);
                                        }
                                        if ui
                                            .add_sized([34.0, 30.0], egui::Button::new("X"))
                                            .clicked()
                                        {
                                            pending_delete_history = Some(item.id);
                                        }
                                    });
                                }
                            });

                        columns[1].heading("记录详情");
                        if let Some(detail) = &self.selected_history {
                            columns[1].label(format!("记录编号：{}", detail.id));
                            columns[1].label(format!("时间：{}", detail.created_at));
                            columns[1].label(format!("商品：{}", detail.product_name));
                            columns[1].label(format!("成本：{}", format_money(detail.unit_cost)));
                            columns[1]
                                .label(format!("重量：{}", format_weight(detail.unit_weight)));
                            columns[1].label(format!(
                                "规格：{}",
                                detail
                                    .selected_quantities
                                    .iter()
                                    .map(|qty| spec_display_name(*qty))
                                    .collect::<Vec<_>>()
                                    .join(" / ")
                            ));
                            columns[1].add_space(8.0);
                            columns[1].label("双击左侧记录可直接回填主界面重新计算");
                            columns[1].separator();
                            egui::ScrollArea::vertical()
                                .id_salt("history_detail_items")
                                .max_height(450.0)
                                .show(&mut columns[1], |ui| {
                                    egui::Grid::new("history_detail_grid")
                                        .striped(true)
                                        .min_col_width(70.0)
                                        .show(ui, |ui| {
                                            ui.strong("规格");
                                            ui.strong("总成本");
                                            ui.strong("建议售价");
                                            ui.strong("毛利率");
                                            ui.strong("保本ROI");
                                            ui.end_row();

                                            for item in &detail.items {
                                                ui.label(&item.spec_name);
                                                ui.label(format_money(item.total_cost));
                                                ui.label(format_money(item.final_suggested_price));
                                                ui.label(format_percent_ratio(item.profit_rate));
                                                ui.label(format_ratio(item.break_even_roi));
                                                ui.end_row();
                                            }
                                        });
                                });
                        } else {
                            columns[1].label("点击左侧记录查看详情");
                        }
                    });
                });
            },
        );

        if let Some(history_id) = pending_open_history {
            match self.db.load_history_detail(history_id) {
                Ok(detail) => self.selected_history = Some(detail),
                Err(err) => self.status_message = format!("读取历史详情失败: {err}"),
            }
        }
        if let Some(history_id) = pending_load_to_form {
            self.load_history_into_form(history_id);
        }
        if let Some(history_id) = pending_delete_history {
            self.delete_history(history_id);
        }

        self.show_history = open;
    }
}

impl eframe::App for SkuApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        setup_ui_style(ctx);
        self.draw_main_ui(ctx);

        if self.show_settings {
            self.draw_settings_window(ctx);
        }
        if self.show_history {
            self.draw_history_window(ctx);
        }
    }
}

fn fee_mode_combo(ui: &mut egui::Ui, id_source: &str, mode: &mut FeeMode) {
    egui::ComboBox::from_id_salt(id_source)
        .selected_text(mode.label())
        .show_ui(ui, |ui| {
            ui.selectable_value(mode, FeeMode::Fixed, FeeMode::Fixed.label());
            ui.selectable_value(mode, FeeMode::Percent, FeeMode::Percent.label());
        });
}

fn parse_f64(value: Option<&String>, default_value: f64) -> f64 {
    value
        .and_then(|item| item.parse::<f64>().ok())
        .unwrap_or(default_value)
}

fn parse_quantities(text: &str) -> Vec<i32> {
    text.split(',')
        .filter_map(|item| item.trim().parse::<i32>().ok())
        .collect()
}

fn spec_display_name(quantity: i32) -> String {
    format!("{quantity}份")
}

fn format_money(value: f64) -> String {
    format!("{value:.2}")
}

fn format_weight(value: f64) -> String {
    if value.fract().abs() < 0.001 {
        format!("{value:.0} g")
    } else {
        format!("{value:.2} g")
    }
}

fn format_weight_value(value: f64) -> String {
    if value.fract().abs() < 0.001 {
        format!("{value:.0}")
    } else {
        format!("{value:.2}")
    }
}

fn format_percent_ratio(value: f64) -> String {
    format!("{:.2}%", value * 100.0)
}

fn format_ratio(value: f64) -> String {
    if value <= 0.0 {
        "-".to_string()
    } else {
        format!("{value:.2}")
    }
}

fn now_string() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn default_shipping_rules() -> Vec<ShippingRule> {
    vec![
        ShippingRule {
            id: 0,
            weight_min: 0.0,
            weight_max: 450.0,
            shipping_fee: 1.5,
        },
        ShippingRule {
            id: 0,
            weight_min: 451.0,
            weight_max: 900.0,
            shipping_fee: 1.8,
        },
        ShippingRule {
            id: 0,
            weight_min: 901.0,
            weight_max: 1800.0,
            shipping_fee: 2.1,
        },
        ShippingRule {
            id: 0,
            weight_min: 1801.0,
            weight_max: 2600.0,
            shipping_fee: 2.6,
        },
        ShippingRule {
            id: 0,
            weight_min: 2601.0,
            weight_max: 4500.0,
            shipping_fee: 5.0,
        },
    ]
}

fn looks_like_old_kg_defaults(rules: &[ShippingRule]) -> bool {
    let expected = [(0.0, 0.5, 2.0), (0.5, 1.0, 3.5), (1.0, 2.0, 5.0)];
    if rules.len() != expected.len() {
        return false;
    }
    rules.iter().zip(expected).all(|(rule, item)| {
        (rule.weight_min - item.0).abs() < 0.0001
            && (rule.weight_max - item.1).abs() < 0.0001
            && (rule.shipping_fee - item.2).abs() < 0.0001
    })
}

fn setup_chinese_fonts(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    let candidates = [
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
    ];

    for path in candidates {
        if let Ok(bytes) = std::fs::read(path) {
            fonts.font_data.insert(
                "system_chinese".to_string(),
                egui::FontData::from_owned(bytes).into(),
            );
            fonts
                .families
                .entry(egui::FontFamily::Proportional)
                .or_default()
                .insert(0, "system_chinese".to_string());
            fonts
                .families
                .entry(egui::FontFamily::Monospace)
                .or_default()
                .push("system_chinese".to_string());
            ctx.set_fonts(fonts);
            return;
        }
    }
}

fn setup_ui_style(ctx: &egui::Context) {
    let mut style = (*ctx.style()).clone();
    style.spacing.item_spacing = egui::vec2(12.0, 12.0);
    style.spacing.button_padding = egui::vec2(14.0, 10.0);
    style.spacing.interact_size = egui::vec2(72.0, 36.0);
    style.visuals.widgets.inactive.bg_fill = egui::Color32::from_rgb(248, 249, 252);
    style.visuals.widgets.inactive.weak_bg_fill = egui::Color32::from_rgb(240, 243, 248);
    style.visuals.widgets.inactive.bg_stroke =
        egui::Stroke::new(1.5, egui::Color32::from_rgb(105, 117, 138));
    style.visuals.widgets.hovered.bg_fill = egui::Color32::from_rgb(236, 241, 248);
    style.visuals.widgets.hovered.bg_stroke =
        egui::Stroke::new(1.8, egui::Color32::from_rgb(72, 103, 170));
    style.visuals.widgets.active.bg_fill = egui::Color32::from_rgb(228, 235, 245);
    style.visuals.widgets.active.bg_stroke =
        egui::Stroke::new(2.0, egui::Color32::from_rgb(54, 87, 154));
    style.visuals.selection.bg_fill = egui::Color32::from_rgb(206, 222, 245);
    style.visuals.extreme_bg_color = egui::Color32::from_rgb(250, 251, 253);
    style.visuals.faint_bg_color = egui::Color32::from_rgb(244, 246, 250);
    style.text_styles.insert(
        egui::TextStyle::Heading,
        egui::FontId::new(28.0, egui::FontFamily::Proportional),
    );
    style.text_styles.insert(
        egui::TextStyle::Body,
        egui::FontId::new(22.0, egui::FontFamily::Proportional),
    );
    style.text_styles.insert(
        egui::TextStyle::Button,
        egui::FontId::new(21.0, egui::FontFamily::Proportional),
    );
    style.text_styles.insert(
        egui::TextStyle::Monospace,
        egui::FontId::new(20.0, egui::FontFamily::Monospace),
    );
    style.text_styles.insert(
        egui::TextStyle::Small,
        egui::FontId::new(18.0, egui::FontFamily::Proportional),
    );
    ctx.set_style(style);
}
