// Feed Fetcher - handles fetching and parsing RSS feeds
import { Env, Feed, FeedFetchMessage, ParsedFeedItem } from './types';
import { parseFeed } from './parser';

const USER_AGENT = 'RSSAggregator/1.0 (Cloudflare Workers; +https://github.com/rss-aggregator)';

// SSRF protection: validate URLs before fetching
function isValidFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Block internal/private ranges
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.startsWith('172.17.') ||
        hostname.startsWith('172.18.') ||
        hostname.startsWith('172.19.') ||
        hostname.startsWith('172.20.') ||
        hostname.startsWith('172.21.') ||
        hostname.startsWith('172.22.') ||
        hostname.startsWith('172.23.') ||
        hostname.startsWith('172.24.') ||
        hostname.startsWith('172.25.') ||
        hostname.startsWith('172.26.') ||
        hostname.startsWith('172.27.') ||
        hostname.startsWith('172.28.') ||
        hostname.startsWith('172.29.') ||
        hostname.startsWith('172.30.') ||
        hostname.startsWith('172.31.') ||
        hostname.startsWith('169.254.') ||  // Link-local
        hostname.startsWith('0.')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchFeed(
  message: FeedFetchMessage,
  env: Env
): Promise<{ success: boolean; newEntries: number; error?: string }> {
  const { feedId, feedUrl, feedName, etag, lastModified } = message;
  
  // SSRF protection: validate URL before fetching
  if (!isValidFeedUrl(feedUrl)) {
    const error = 'Invalid or blocked URL';
    await updateFeedStatus(env.DB, feedId, false, error);
    return { success: false, newEntries: 0, error };
  }
  
  try {
    // Build request headers
    const headers: HeadersInit = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    };
    
    if (etag) {
      headers['If-None-Match'] = etag;
    }
    if (lastModified) {
      headers['If-Modified-Since'] = lastModified;
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    let response: Response;
    try {
      response = await fetch(feedUrl, {
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle 304 Not Modified
    if (response.status === 304) {
      await updateFeedStatus(env.DB, feedId, true);
      return { success: true, newEntries: 0 };
    }

    // Handle errors
    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`;
      await updateFeedStatus(env.DB, feedId, false, error);
      return { success: false, newEntries: 0, error };
    }

    // Get response headers for caching
    const newEtag = response.headers.get('ETag');
    const newLastModified = response.headers.get('Last-Modified');

    // Parse feed
    const xml = await response.text();
    const parsed = parseFeed(xml, feedUrl);

    // Store new entries
    const newEntries = await storeEntries(env.DB, feedId, parsed.items);

    // Update feed status with cache headers
    await updateFeedStatus(env.DB, feedId, true, undefined, newEtag, newLastModified);

    return { success: true, newEntries };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await updateFeedStatus(env.DB, feedId, false, errorMsg);
    return { success: false, newEntries: 0, error: errorMsg };
  }
}

async function updateFeedStatus(
  db: D1Database,
  feedId: number,
  success: boolean,
  error?: string,
  etag?: string | null,
  lastModified?: string | null
): Promise<void> {
  const now = new Date().toISOString();
  
  if (success) {
    await db.prepare(`
      UPDATE feeds SET
        last_fetched = ?,
        fetch_count = fetch_count + 1,
        etag = COALESCE(?, etag),
        last_modified = COALESCE(?, last_modified),
        error_count = 0,
        last_error = NULL,
        updated_at = ?
      WHERE id = ?
    `).bind(now, etag, lastModified, now, feedId).run();
  } else {
    await db.prepare(`
      UPDATE feeds SET
        last_fetched = ?,
        error_count = error_count + 1,
        last_error = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(now, error, now, feedId).run();
  }
}

async function storeEntries(
  db: D1Database,
  feedId: number,
  items: ParsedFeedItem[]
): Promise<number> {
  let newCount = 0;
  
  for (const item of items) {
    try {
      // Use INSERT OR IGNORE to skip duplicates
      const result = await db.prepare(`
        INSERT OR IGNORE INTO entries (id, feed_id, title, link, permalink, published, updated, summary, content, author, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.id,
        feedId,
        item.title,
        item.link,
        item.permalink || null,  // Blog's own URL (for linkblogs)
        item.published || null,
        item.updated || null,
        item.summary || null,
        item.content || null,
        item.author || null,
        item.tags ? JSON.stringify(item.tags) : null
      ).run();
      
      if (result.meta.changes > 0) {
        newCount++;
      }
    } catch (error) {
      // Log but continue with other items
      console.error(`Failed to store entry ${item.id}:`, error);
    }
  }
  
  return newCount;
}

// Queue all feeds for fetching (called by cron)
export async function queueAllFeeds(env: Env): Promise<{ queued: number }> {
  // Get all feeds with their cache headers
  const feeds = await env.DB.prepare(`
    SELECT id, name, url, etag, last_modified
    FROM feeds
    WHERE url IS NOT NULL
    ORDER BY rank ASC NULLS LAST, id ASC
  `).all<Feed>();
  
  if (!feeds.results || feeds.results.length === 0) {
    return { queued: 0 };
  }
  
  // Queue in batches of 100
  const batchSize = 100;
  let queued = 0;
  
  for (let i = 0; i < feeds.results.length; i += batchSize) {
    const batch = feeds.results.slice(i, i + batchSize);
    const messages: MessageSendRequest<FeedFetchMessage>[] = batch.map(feed => ({
      body: {
        feedId: feed.id,
        feedUrl: feed.url,
        feedName: feed.name,
        etag: feed.etag || undefined,
        lastModified: feed.last_modified || undefined,
      },
    }));
    
    await env.FEED_QUEUE.sendBatch(messages);
    queued += batch.length;
  }
  
  return { queued };
}

// Prune old entries (called periodically)
export async function pruneOldEntries(env: Env): Promise<{ deleted: number }> {
  const retentionDays = parseInt(env.RETENTION_DAYS) || 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  const result = await env.DB.prepare(`
    DELETE FROM entries
    WHERE created_at < ?
  `).bind(cutoffDate.toISOString()).run();
  
  return { deleted: result.meta.changes || 0 };
}
