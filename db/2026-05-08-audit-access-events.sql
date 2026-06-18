CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT,
    actor_id TEXT,
    actor_label TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    resource_label TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    ip TEXT,
    user_agent TEXT,
    method TEXT,
    path TEXT,
    source TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_status ON audit_events(status);

CREATE TABLE IF NOT EXISTS access_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT,
    actor_id TEXT,
    actor_label TEXT,
    event_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    resource_label TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    failure_reason TEXT,
    ip TEXT,
    user_agent TEXT,
    method TEXT,
    path TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_events_created_at ON access_events(created_at);
CREATE INDEX IF NOT EXISTS idx_access_events_event_type ON access_events(event_type);
CREATE INDEX IF NOT EXISTS idx_access_events_actor ON access_events(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_access_events_resource ON access_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_access_events_status ON access_events(status);
CREATE INDEX IF NOT EXISTS idx_access_events_ip ON access_events(ip);
