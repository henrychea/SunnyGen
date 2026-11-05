export const SCHEMA_VERSION = 1

export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    color TEXT,
    sort_index INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX folders_parent ON folders(parent_id, sort_index, name);

  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    mime TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration REAL,
    sha256 TEXT NOT NULL,
    source TEXT NOT NULL,
    path TEXT NOT NULL,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  ) STRICT;
  CREATE UNIQUE INDEX assets_sha256 ON assets(sha256);
  CREATE INDEX assets_gallery ON assets(kind, created_at DESC);
  CREATE INDEX assets_folder ON assets(folder_id, created_at DESC);

  CREATE TABLE generations (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    params TEXT NOT NULL DEFAULT '{}',
    input_asset_ids TEXT NOT NULL DEFAULT '[]',
    output_asset_ids TEXT NOT NULL DEFAULT '[]',
    provider_job_id TEXT,
    error TEXT,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX generations_gallery ON generations(status, kind, created_at DESC);
  CREATE INDEX generations_folder ON generations(folder_id, created_at DESC);
  CREATE INDEX generations_provider_job ON generations(provider_job_id);

  CREATE TABLE jobs (
    task_id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_job_id TEXT,
    status TEXT NOT NULL,
    poll_after INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX jobs_due ON jobs(status, poll_after);

  CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    graph TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE studio_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    clean_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    data TEXT NOT NULL DEFAULT '{}',
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX studio_items_kind ON studio_items(kind, created_at DESC);

  CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT,
    messages TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX chats_updated ON chats(updated_at DESC);
  `,
]
