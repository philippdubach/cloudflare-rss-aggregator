// RSS/Atom Feed Generator
import { Env, EntryWithFeed, isSponsored } from './types';

// SVG logo as data URI (orange RSS icon)
const FEED_LOGO_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#ff6600"/><circle cx="16" cy="48" r="6" fill="#fff"/><path d="M16 24c13.255 0 24 10.745 24 24h8c0-17.673-14.327-32-32-32v8z" fill="#fff"/><path d="M16 8c22.091 0 40 17.909 40 40h8C64 21.49 42.51 0 16 0v8z" fill="#fff"/></svg>`)}`;

interface FeedConfig {
  title: string;
  description: string;
  maxRank: number;
}

const FEED_CONFIGS: Record<string, FeedConfig> = {
  top100: {
    title: 'Top 100 Hacker News Personal Blogs',
    description: 'Aggregated feed from the top 100 personal blogs ranked by Hacker News performance',
    maxRank: 100,
  },
  top50: {
    title: 'Top 50 Hacker News Personal Blogs',
    description: 'Aggregated feed from the top 50 personal blogs ranked by Hacker News performance',
    maxRank: 50,
  },
  top25: {
    title: 'Top 25 Hacker News Personal Blogs',
    description: 'Aggregated feed from the top 25 personal blogs ranked by Hacker News performance',
    maxRank: 25,
  },
};

export interface GeneratedFeed {
  content: string;
  lastModified: string | null;  // ISO date string from newest entry
}

export async function generateFeed(
  env: Env,
  feedType: 'top100' | 'top50' | 'top25',
  format: 'atom' | 'rss' = 'atom',
  baseUrl?: string
): Promise<GeneratedFeed> {
  const config = FEED_CONFIGS[feedType];
  const feedBaseUrl = baseUrl || env.BASE_URL;
  const itemsPerFeed = parseInt(env.ITEMS_PER_FEED) || 50;
  
  // Hard cap to prevent unbounded queries (max 500 entries)
  const MAX_ENTRIES = 500;
  const requestedLimit = itemsPerFeed * config.maxRank;
  const actualLimit = Math.min(requestedLimit, MAX_ENTRIES);
  
  // Get recent entries from ranked feeds, excluding sponsored content at SQL level
  const entries = await env.DB.prepare(`
    SELECT e.*, f.name as feed_name, f.rank as feed_rank
    FROM entries e
    JOIN feeds f ON e.feed_id = f.id
    WHERE f.rank IS NOT NULL AND f.rank <= ?
      AND e.title NOT LIKE '%sponsor%'
      AND e.title NOT LIKE '%SPONSOR%'
      AND e.title NOT LIKE '%Sponsor%'
      AND (e.summary IS NULL OR (e.summary NOT LIKE '%sponsor%' AND e.summary NOT LIKE '%SPONSOR%' AND e.summary NOT LIKE '%Sponsor%'))
    ORDER BY e.published DESC NULLS LAST
    LIMIT ?
  `).bind(config.maxRank, actualLimit).all<EntryWithFeed>();
  
  // Additional filter as second defense layer (catches content field and tags)
  const items = (entries.results || []).filter(item => !isSponsored(item));
  
  // Get the newest entry's published date for Last-Modified header
  const newestDate = items.length > 0 && items[0].published 
    ? items[0].published 
    : null;
  
  const content = format === 'rss'
    ? generateRSS(config, items, feedBaseUrl, feedType)
    : generateAtom(config, items, feedBaseUrl, feedType);
  
  return { content, lastModified: newestDate };
}

function generateAtom(
  config: FeedConfig, 
  items: EntryWithFeed[], 
  baseUrl: string,
  feedType: string
): string {
  const now = new Date().toISOString();
  const feedUrl = `${baseUrl}/${feedType}.atom`;
  
  const entriesXml = items.map(item => {
    const published = item.published || item.created_at;
    const updated = item.updated || published;
    const content = escapeXml(item.content || item.summary || '');
    const summary = escapeXml(item.summary || '');
    
    // Use permalink as primary link (blog's own URL), fallback to link
    // This ensures linkblogs show their own post URL, not external referenced articles
    const entryUrl = item.permalink || item.link;
    
    let tagsXml = '';
    if (item.tags) {
      try {
        const tags = JSON.parse(item.tags) as string[];
        tagsXml = tags.map(tag => `    <category term="${escapeXml(tag)}"/>`).join('\n');
      } catch (e) {}
    }
    
    return `  <entry>
    <id>${escapeXml(item.id)}</id>
    <title>${escapeXml(item.title)}</title>
    <link href="${escapeXml(entryUrl)}" rel="alternate"/>
    <published>${published}</published>
    <updated>${updated}</updated>
    <author>
      <name>${escapeXml(item.author || item.feed_name)}</name>
    </author>
    <source>
      <title>${escapeXml(item.feed_name)}</title>
    </source>
${tagsXml ? tagsXml + '\n' : ''}    <summary type="html">${summary}</summary>
${content ? `    <content type="html">${content}</content>` : ''}
  </entry>`;
  }).join('\n');

  // XSL styling script for browser rendering (rss.style)
  const styleScript = `<script src="https://www.rss.style/js/atom-style.js" xmlns="http://www.w3.org/1999/xhtml"></script>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  ${styleScript}
  <id>${feedUrl}</id>
  <title>${escapeXml(config.title)}</title>
  <subtitle>${escapeXml(config.description)}</subtitle>
  <icon>${FEED_LOGO_SVG}</icon>
  <logo>${FEED_LOGO_SVG}</logo>
  <link href="${feedUrl}" rel="self" type="application/atom+xml"/>
  <link href="${baseUrl}/" rel="alternate" type="text/html"/>
  <updated>${now}</updated>
  <generator>RSS Aggregator (Cloudflare Workers)</generator>
${entriesXml}
</feed>`;
}

function generateRSS(
  config: FeedConfig, 
  items: EntryWithFeed[], 
  baseUrl: string,
  feedType: string
): string {
  const now = new Date().toUTCString();
  const feedUrl = `${baseUrl}/${feedType}.rss`;
  
  const itemsXml = items.map(item => {
    const pubDate = item.published ? new Date(item.published).toUTCString() : now;
    const description = escapeXml(item.summary || item.content || '');
    
    // Use permalink as primary link (blog's own URL), fallback to link
    // This ensures linkblogs show their own post URL, not external referenced articles
    const entryUrl = item.permalink || item.link;
    
    let categoriesXml = '';
    if (item.tags) {
      try {
        const tags = JSON.parse(item.tags) as string[];
        categoriesXml = tags.map(tag => `      <category>${escapeXml(tag)}</category>`).join('\n');
      } catch (e) {}
    }
    
    return `    <item>
      <guid isPermaLink="false">${escapeXml(item.id)}</guid>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(entryUrl)}</link>
      <pubDate>${pubDate}</pubDate>
      <author>${escapeXml(item.author || item.feed_name)}</author>
      <source url="${escapeXml(entryUrl)}">${escapeXml(item.feed_name)}</source>
${categoriesXml ? categoriesXml + '\n' : ''}      <description>${description}</description>
    </item>`;
  }).join('\n');

  // XSL styling script for browser rendering (rss.style)
  const styleScript = `<script src="https://www.rss.style/js/rss-style.js" xmlns="http://www.w3.org/1999/xhtml"></script>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  ${styleScript}
  <channel>
    <title>${escapeXml(config.title)}</title>
    <description>${escapeXml(config.description)}</description>
    <link>${baseUrl}/</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${FEED_LOGO_SVG}</url>
      <title>${escapeXml(config.title)}</title>
      <link>${baseUrl}/</link>
    </image>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>RSS Aggregator (Cloudflare Workers)</generator>
${itemsXml}
  </channel>
</rss>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { FEED_CONFIGS };
