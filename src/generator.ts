// RSS/Atom Feed Generator
import { Env, EntryWithFeed } from './types';

const FEED_BASE_URL = 'https://rss-aggregator.pages.dev'; // Update after deployment

interface FeedConfig {
  title: string;
  description: string;
  maxRank: number;
  path: string;
}

const FEED_CONFIGS: Record<string, FeedConfig> = {
  top100: {
    title: 'Top 100 Hacker News Personal Blogs',
    description: 'Aggregated feed from the top 100 personal blogs ranked by Hacker News performance',
    maxRank: 100,
    path: '/top100.xml',
  },
  top50: {
    title: 'Top 50 Hacker News Personal Blogs',
    description: 'Aggregated feed from the top 50 personal blogs ranked by Hacker News performance',
    maxRank: 50,
    path: '/top50.xml',
  },
  top25: {
    title: 'Top 25 Hacker News Personal Blogs',
    description: 'Aggregated feed from the top 25 personal blogs ranked by Hacker News performance',
    maxRank: 25,
    path: '/top25.xml',
  },
};

export async function generateFeed(
  env: Env,
  feedType: 'top100' | 'top50' | 'top25',
  format: 'atom' | 'rss' = 'atom'
): Promise<string> {
  const config = FEED_CONFIGS[feedType];
  const itemsPerFeed = parseInt(env.ITEMS_PER_FEED) || 50;
  
  // Hard cap to prevent unbounded queries (max 500 entries)
  const MAX_ENTRIES = 500;
  const requestedLimit = itemsPerFeed * config.maxRank;
  const actualLimit = Math.min(requestedLimit, MAX_ENTRIES);
  
  // Get recent entries from ranked feeds
  const entries = await env.DB.prepare(`
    SELECT e.*, f.name as feed_name, f.rank as feed_rank
    FROM entries e
    JOIN feeds f ON e.feed_id = f.id
    WHERE f.rank IS NOT NULL AND f.rank <= ?
    ORDER BY e.published DESC NULLS LAST
    LIMIT ?
  `).bind(config.maxRank, actualLimit).all<EntryWithFeed>();
  
  const items = entries.results || [];
  
  if (format === 'rss') {
    return generateRSS(config, items);
  }
  return generateAtom(config, items);
}

function generateAtom(config: FeedConfig, items: EntryWithFeed[]): string {
  const now = new Date().toISOString();
  const feedUrl = `${FEED_BASE_URL}${config.path}`;
  
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${feedUrl}</id>
  <title>${escapeXml(config.title)}</title>
  <subtitle>${escapeXml(config.description)}</subtitle>
  <link href="${feedUrl}" rel="self" type="application/atom+xml"/>
  <link href="${FEED_BASE_URL}" rel="alternate" type="text/html"/>
  <updated>${now}</updated>
  <generator>RSS Aggregator (Cloudflare Workers)</generator>
${entriesXml}
</feed>`;
}

function generateRSS(config: FeedConfig, items: EntryWithFeed[]): string {
  const now = new Date().toUTCString();
  const feedUrl = `${FEED_BASE_URL}${config.path}`;
  
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <description>${escapeXml(config.description)}</description>
    <link>${FEED_BASE_URL}</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
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
