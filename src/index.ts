// Main Worker Entry Point
import { Env, FeedFetchMessage } from './types';
import { fetchFeed, queueAllFeeds, pruneOldEntries } from './fetcher';
import { generateFeed, GeneratedFeed } from './generator';
import { generateLandingPage } from './landing';

// Security headers for all responses
function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'interest-cohort=()');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Validate admin token for protected endpoints
function validateAdminToken(request: Request, env: Env): Response | null {
  if (!env.ADMIN_TOKEN) {
    return new Response('Endpoint disabled - no admin token configured', { status: 503 });
  }
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null; // Auth passed
}

// Generate a subscriber ID from IP and User-Agent (hashed for privacy)
async function getSubscriberId(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For') || 
             'unknown';
  const ua = request.headers.get('User-Agent') || 'unknown';
  const data = new TextEncoder().encode(`${ip}:${ua}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// Track subscriber access (fire-and-forget)
async function trackSubscriber(env: Env, path: string, request: Request): Promise<void> {
  try {
    const subscriberId = await getSubscriberId(request);
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    
    await env.DB.prepare(`
      INSERT INTO subscribers (id, feed_path, user_agent, first_seen, last_seen, request_count)
      VALUES (?, ?, ?, datetime('now'), datetime('now'), 1)
      ON CONFLICT(id, feed_path) DO UPDATE SET
        last_seen = datetime('now'),
        request_count = request_count + 1
    `).bind(subscriberId, path, userAgent.substring(0, 200)).run();
  } catch (error) {
    // Don't fail the request if tracking fails
    console.error('Subscriber tracking error:', error);
  }
}

export default {
  // HTTP request handler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Landing page
      if (path === '/' || path === '') {
        const html = await generateLandingPage(env);
        return addSecurityHeaders(new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300', // 5 min cache
          },
        }));
      }

      // Atom feeds (.xml and .atom routes)
      if (path === '/top100.xml' || path === '/top100.atom') {
        ctx.waitUntil(trackSubscriber(env, path, request));
        const baseUrl = new URL(request.url).origin;
        const feed = await generateFeed(env, 'top100', 'atom', baseUrl);
        return feedResponse(feed, 'atom');
      }
      if (path === '/top50.xml' || path === '/top50.atom') {
        ctx.waitUntil(trackSubscriber(env, path, request));
        const baseUrl = new URL(request.url).origin;
        const feed = await generateFeed(env, 'top50', 'atom', baseUrl);
        return feedResponse(feed, 'atom');
      }
      if (path === '/top25.xml' || path === '/top25.atom') {
        ctx.waitUntil(trackSubscriber(env, path, request));
        const baseUrl = new URL(request.url).origin;
        const feed = await generateFeed(env, 'top25', 'atom', baseUrl);
        return feedResponse(feed, 'atom');
      }

      // RSS feeds
      if (path === '/top100.rss') {
        ctx.waitUntil(trackSubscriber(env, path, request));
        const baseUrl = new URL(request.url).origin;
        const feed = await generateFeed(env, 'top100', 'rss', baseUrl);
        return feedResponse(feed, 'rss');
      }
      if (path === '/top50.rss') {
        ctx.waitUntil(trackSubscriber(env, path, request));
        const baseUrl = new URL(request.url).origin;
        const feed = await generateFeed(env, 'top50', 'rss', baseUrl);
        return feedResponse(feed, 'rss');
      }
      if (path === '/top25.rss') {
        ctx.waitUntil(trackSubscriber(env, path, request));
        const baseUrl = new URL(request.url).origin;
        const feed = await generateFeed(env, 'top25', 'rss', baseUrl);
        return feedResponse(feed, 'rss');
      }

      // API endpoints
      if (path === '/api/stats') {
        const stats = await handleStats(env);
        return addSecurityHeaders(stats);
      }
      
      if (path === '/api/subscribers') {
        // Protected endpoint - requires admin token
        const authError = validateAdminToken(request, env);
        if (authError) return addSecurityHeaders(authError);
        const subscribers = await handleSubscribers(env);
        return addSecurityHeaders(subscribers);
      }
      
      if (path === '/api/trigger-fetch' && request.method === 'POST') {
        // Protected endpoint - requires admin token
        const authError = validateAdminToken(request, env);
        if (authError) return addSecurityHeaders(authError);
        const result = await queueAllFeeds(env);
        return addSecurityHeaders(Response.json(result));
      }

      // 404
      return addSecurityHeaders(new Response('Not Found', { status: 404 }));
    } catch (error) {
      // Enhanced error logging with stack trace
      const errorMessage = error instanceof Error 
        ? `${error.message}\n${error.stack}` 
        : JSON.stringify(error);
      console.error('Request error:', errorMessage);
      return addSecurityHeaders(new Response('Internal Server Error', { status: 500 }));
    }
  },

  // Cron trigger handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Cron triggered:', event.cron);
    
    try {
      // Queue all feeds for fetching
      const queueResult = await queueAllFeeds(env);
      console.log(`Queued ${queueResult.queued} feeds for fetching`);
      
      // Prune old entries (run once per day, check if hour is 0)
      const hour = new Date().getUTCHours();
      if (hour === 0) {
        const pruneResult = await pruneOldEntries(env);
        console.log(`Pruned ${pruneResult.deleted} old entries`);
      }
    } catch (error) {
      console.error('Cron error:', error);
    }
  },

  // Queue consumer handler
  async queue(batch: MessageBatch<FeedFetchMessage>, env: Env): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} feeds`);
    
    for (const message of batch.messages) {
      try {
        const result = await fetchFeed(message.body, env);
        
        if (result.success) {
          console.log(`✓ ${message.body.feedName}: ${result.newEntries} new entries`);
          message.ack();
        } else {
          console.log(`✗ ${message.body.feedName}: ${result.error}`);
          // Retry on transient errors
          if (result.error?.includes('timeout') || result.error?.includes('5')) {
            message.retry();
          } else {
            message.ack(); // Don't retry on permanent failures
          }
        }
      } catch (error) {
        console.error(`Error processing ${message.body.feedName}:`, error);
        message.retry();
      }
    }
  },
};

// Generate ETag from content hash
async function generateETag(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `"${hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('')}"`;
}

async function feedResponse(feed: GeneratedFeed, format: 'atom' | 'rss'): Promise<Response> {
  // Use text/xml for browser XSL styling compatibility (per rss.style requirements)
  const contentType = 'text/xml; charset=utf-8';
  
  // Generate ETag from content
  const etag = await generateETag(feed.content);
  
  const headers: HeadersInit = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=900', // 15 min cache
    'Access-Control-Allow-Origin': '*',
    'ETag': etag,
  };
  
  // Add Last-Modified if we have a newest entry date
  if (feed.lastModified) {
    headers['Last-Modified'] = new Date(feed.lastModified).toUTCString();
  }
  
  return addSecurityHeaders(new Response(feed.content, { headers }));
}

async function handleStats(env: Env): Promise<Response> {
  const [feedCount, entryCount, rankedFeeds, recentEntries] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM feeds').first<{count: number}>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM entries').first<{count: number}>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM feeds WHERE rank IS NOT NULL').first<{count: number}>(),
    env.DB.prepare(`
      SELECT COUNT(*) as count FROM entries 
      WHERE created_at > datetime('now', '-24 hours')
    `).first<{count: number}>(),
  ]);

  const data = {
    feeds: {
      total: feedCount?.count || 0,
      ranked: rankedFeeds?.count || 0,
    },
    entries: {
      total: entryCount?.count || 0,
      last24h: recentEntries?.count || 0,
    },
    lastUpdated: new Date().toISOString(),
  };

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',  // 1 minute cache
    },
  });
}

async function handleSubscribers(env: Env): Promise<Response> {
  const [statsResult, recentResult, topAgentsResult] = await Promise.all([
    // Per-feed stats
    env.DB.prepare(`
      SELECT feed_path, 
             COUNT(*) as unique_subscribers,
             SUM(request_count) as total_requests,
             MAX(last_seen) as last_access
      FROM subscribers
      GROUP BY feed_path
      ORDER BY unique_subscribers DESC
    `).all<{feed_path: string; unique_subscribers: number; total_requests: number; last_access: string}>(),
    
    // Recent unique subscribers (last 24h)
    env.DB.prepare(`
      SELECT COUNT(DISTINCT id) as count 
      FROM subscribers 
      WHERE last_seen > datetime('now', '-24 hours')
    `).first<{count: number}>(),
    
    // Top user agents (to identify RSS readers)
    env.DB.prepare(`
      SELECT user_agent, COUNT(*) as count
      FROM subscribers
      GROUP BY user_agent
      ORDER BY count DESC
      LIMIT 10
    `).all<{user_agent: string; count: number}>(),
  ]);

  return Response.json({
    byFeed: statsResult.results || [],
    totalUniqueSubscribers: statsResult.results?.reduce((sum, s) => sum + s.unique_subscribers, 0) || 0,
    activeInLast24h: recentResult?.count || 0,
    topUserAgents: topAgentsResult.results || [],
    generatedAt: new Date().toISOString(),
  });
}
