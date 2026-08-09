export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  marketplace_product_id TEXT NOT NULL,
  title TEXT,
  url TEXT,
  folder_path TEXT,
  purpose TEXT,
  pack_quantity INTEGER,
  my_rating INTEGER,
  rating TEXT,
  review_count TEXT,
  description TEXT,
  orders TEXT,
  seller_name TEXT,
  seller_id TEXT,
  store_url TEXT,
  video TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, marketplace_product_id)
);

CREATE TABLE IF NOT EXISTS product_specs (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (product_id, key)
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  rel_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  rel_path TEXT NOT NULL DEFAULT '',
  name TEXT,
  group_name TEXT,
  price TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_tags (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  marketplace_order_id TEXT NOT NULL,
  status TEXT,
  ordered_at TEXT,
  discount TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, marketplace_order_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  marketplace_product_id TEXT,
  marketplace_item_id TEXT,
  source_line_key TEXT,
  title TEXT,
  quantity INTEGER,
  unit_price REAL,
  currency TEXT,
  sku TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  tracking_code TEXT,
  label TEXT,
  status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS package_tracking_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  tracking_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary',
  created_at TEXT NOT NULL,
  UNIQUE(package_id, tracking_code),
  UNIQUE(platform, tracking_code)
);

CREATE TABLE IF NOT EXISTS package_orders (
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (package_id, order_id)
);

CREATE TABLE IF NOT EXISTS package_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(package_id, order_item_id)
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  looking_for TEXT,
  file_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  confidence INTEGER,
  match_source TEXT,
  rank INTEGER,
  review_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
  CHECK(review_status IN ('pending', 'confirmed', 'rejected'))
);

CREATE TABLE IF NOT EXISTS product_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id_a INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id_b INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'similar',
  source TEXT NOT NULL DEFAULT 'manual',
  confidence INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(product_id_a, product_id_b),
  CHECK(product_id_a < product_id_b),
  CHECK(relation IN ('similar', 'same_product', 'variant')),
  CHECK(source IN ('manual', 'search', 'import')),
  CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_folder
  ON products(folder_path)
  WHERE folder_path IS NOT NULL AND TRIM(folder_path) != '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_name_nocase
  ON tags(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_choices_product ON product_choices(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_specs_product ON product_specs(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)
  WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_item_marketplace_id
  ON order_items(order_id, marketplace_item_id)
  WHERE marketplace_item_id IS NOT NULL AND TRIM(marketplace_item_id) != '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_item_source_line
  ON order_items(order_id, source_line_key)
  WHERE source_line_key IS NOT NULL AND TRIM(source_line_key) != '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_package_primary_tracking
  ON package_tracking_codes(package_id)
  WHERE role = 'primary';
`
