-- Schema for RSS Aggregator D1 Database

-- Feed sources with ranking information
CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    domain TEXT,
    rank INTEGER,  -- Position in top100 (1-100, NULL if not ranked)
    etag TEXT,
    last_modified TEXT,
    last_fetched TEXT,
    fetch_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Feed entries/articles
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,  -- GUID or generated hash
    feed_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    permalink TEXT,  -- Blog's own URL (for linkblogs like Daring Fireball)
    published TEXT,
    updated TEXT,
    summary TEXT,
    content TEXT,
    author TEXT,
    tags TEXT,  -- JSON array
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entries_feed_id ON entries(feed_id);
CREATE INDEX IF NOT EXISTS idx_entries_published ON entries(published DESC);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
CREATE INDEX IF NOT EXISTS idx_feeds_rank ON feeds(rank);
CREATE INDEX IF NOT EXISTS idx_feeds_domain ON feeds(domain);

-- View for top 100 entries (most recent from ranked feeds)
-- Note: e.* includes permalink column for linkblog support
CREATE VIEW IF NOT EXISTS top100_entries AS
SELECT e.*, f.name as feed_name, f.rank as feed_rank
FROM entries e
JOIN feeds f ON e.feed_id = f.id
WHERE f.rank IS NOT NULL AND f.rank <= 100
ORDER BY e.published DESC;

-- View for top 50 entries
CREATE VIEW IF NOT EXISTS top50_entries AS
SELECT e.*, f.name as feed_name, f.rank as feed_rank
FROM entries e
JOIN feeds f ON e.feed_id = f.id
WHERE f.rank IS NOT NULL AND f.rank <= 50
ORDER BY e.published DESC;

-- View for top 25 entries
CREATE VIEW IF NOT EXISTS top25_entries AS
SELECT e.*, f.name as feed_name, f.rank as feed_rank
FROM entries e
JOIN feeds f ON e.feed_id = f.id
WHERE f.rank IS NOT NULL AND f.rank <= 25
ORDER BY e.published DESC;

-- Subscriber tracking (unique readers per feed)
CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT NOT NULL,           -- Hashed IP + User-Agent
    feed_path TEXT NOT NULL,    -- /top25.xml, /top50.xml, etc.
    user_agent TEXT,            -- Original user agent (for analytics)
    first_seen TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    request_count INTEGER DEFAULT 1,
    PRIMARY KEY (id, feed_path)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_feed_path ON subscribers(feed_path);
CREATE INDEX IF NOT EXISTS idx_subscribers_last_seen ON subscribers(last_seen);

-- View for subscriber stats
CREATE VIEW IF NOT EXISTS subscriber_stats AS
SELECT 
    feed_path,
    COUNT(*) as unique_subscribers,
    SUM(request_count) as total_requests,
    MAX(last_seen) as last_access
FROM subscribers
GROUP BY feed_path;
