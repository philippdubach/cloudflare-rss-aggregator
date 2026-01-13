// Type definitions for RSS Aggregator

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  FEED_QUEUE: Queue<FeedFetchMessage>;
  FEEDS_BUCKET: R2Bucket;
  ITEMS_PER_FEED: string;
  RETENTION_DAYS: string;
  BASE_URL: string;  // Base URL for feed self-links
  ADMIN_TOKEN?: string;  // Secret for API auth
}

export interface Feed {
  id: number;
  name: string;
  url: string;
  domain: string | null;
  rank: number | null;
  etag: string | null;
  last_modified: string | null;
  last_fetched: string | null;
  fetch_count: number;
  error_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  feed_id: number;
  title: string;
  link: string;
  permalink: string | null;  // Blog's own URL (for linkblogs)
  published: string | null;
  updated: string | null;
  summary: string | null;
  content: string | null;
  author: string | null;
  tags: string | null; // JSON array
  created_at: string;
}

export interface EntryWithFeed extends Entry {
  feed_name: string;
  feed_rank: number;
}

export interface FeedFetchMessage {
  feedId: number;
  feedUrl: string;
  feedName: string;
  etag?: string;
  lastModified?: string;
}

export interface ParsedFeedItem {
  id: string;
  title: string;
  link: string;
  permalink?: string;  // Blog's own URL (for linkblogs like Daring Fireball)
  published?: string;
  updated?: string;
  summary?: string;
  content?: string;
  author?: string;
  tags?: string[];
}

export interface ParsedFeed {
  title: string;
  items: ParsedFeedItem[];
}
