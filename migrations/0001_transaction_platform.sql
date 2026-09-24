PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  phone TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('agent','provider','admin')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  source_auction_id TEXT UNIQUE,
  kind TEXT NOT NULL DEFAULT 'property' CHECK (kind IN ('property','portfolio')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'closing' CHECK (status IN ('closing','active','complete','cancelled')),
  amount_cents INTEGER,
  property_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_participants (
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('buyer','seller','agent','provider')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','removed')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (transaction_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  kind TEXT NOT NULL CHECK (kind IN ('buyer_agent','seller_agent','provider_agent')),
  created_at INTEGER NOT NULL,
  UNIQUE (transaction_id, kind)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('buyer','seller','agent','provider','system')),
  body TEXT NOT NULL,
  correction_of TEXT REFERENCES messages(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'general',
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('uploading','available','signature_pending','complete','voided')),
  visibility TEXT NOT NULL DEFAULT 'participants' CHECK (visibility IN ('participants','buyer_agent','seller_agent','agent_provider','agent_only')),
  esign_provider TEXT,
  esign_external_id TEXT UNIQUE,
  completed_object_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS document_recipients (
  document_id TEXT NOT NULL REFERENCES documents(id),
  user_id TEXT REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('buyer','seller','agent','provider')),
  name TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','viewed','signed','declined')),
  signed_at INTEGER,
  PRIMARY KEY (document_id, role, email)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  assigned_role TEXT NOT NULL CHECK (assigned_role IN ('buyer','seller','agent','provider')),
  assigned_user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'action' CHECK (status IN ('action','waiting','complete','cancelled')),
  document_id TEXT REFERENCES documents(id),
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  service_type TEXT NOT NULL CHECK (service_type IN ('title','contractors','realtors','rentals')),
  provider_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'submitted',
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  transaction_id TEXT REFERENCES transactions(id),
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_participants_user ON transaction_participants(user_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_thread_time ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_transaction ON documents(transaction_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_transaction_role ON tasks(transaction_id, assigned_role, status);
CREATE INDEX IF NOT EXISTS idx_audit_transaction_time ON audit_events(transaction_id, created_at);
CREATE INDEX IF NOT EXISTS idx_service_transaction ON service_requests(transaction_id, service_type);
