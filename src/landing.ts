// Landing page HTML template
import { Env } from './types';

export async function generateLandingPage(env: Env): Promise<string> {
  // Get stats
  const feedCount = await env.DB.prepare('SELECT COUNT(*) as count FROM feeds WHERE rank IS NOT NULL').first<{count: number}>();
  const entryCount = await env.DB.prepare('SELECT COUNT(*) as count FROM entries').first<{count: number}>();
  const lastUpdate = await env.DB.prepare('SELECT MAX(last_fetched) as last_fetched FROM feeds WHERE rank IS NOT NULL').first<{last_fetched: string | null}>();

  const baseUrl = env.BASE_URL;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Top Hacker News Personal Blogs 2025 — Combined RSS Feed</title>
  <meta name="description" content="Subscribe to one RSS feed for all ${feedCount?.count || 100} top-ranked Hacker News personal blogs. Curated from the 2025 HN Popularity rankings. Updated every 15 minutes.">
  
  <!-- Open Graph -->
  <meta property="og:title" content="Top Hacker News Personal Blogs 2025 — Combined RSS Feed">
  <meta property="og:description" content="One RSS feed for the ${feedCount?.count || 100} most popular personal blogs on Hacker News. Updated every 15 minutes.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Top Hacker News Personal Blogs 2025 — Combined RSS Feed">
  <meta name="twitter:description" content="One RSS feed for the ${feedCount?.count || 100} most popular personal blogs on Hacker News.">
  
  <!-- Canonical -->
  <link rel="canonical" href="${baseUrl}/">
  
  <!-- RSS/Atom discovery -->
  <link rel="alternate" type="application/atom+xml" title="Top 100 HN Blogs (Atom)" href="/top100.atom">
  <link rel="alternate" type="application/atom+xml" title="Top 50 HN Blogs (Atom)" href="/top50.atom">
  <link rel="alternate" type="application/atom+xml" title="Top 25 HN Blogs (Atom)" href="/top25.atom">
  <link rel="alternate" type="application/rss+xml" title="Top 100 HN Blogs (RSS)" href="/top100.rss">
  <link rel="alternate" type="application/rss+xml" title="Top 50 HN Blogs (RSS)" href="/top50.rss">
  <link rel="alternate" type="application/rss+xml" title="Top 25 HN Blogs (RSS)" href="/top25.rss">
  
  <!-- JSON-LD Schema -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "DataFeed",
    "name": "Top Hacker News Personal Blogs RSS Feed",
    "description": "Aggregated RSS feed combining posts from the most popular personal blogs ranked by Hacker News performance in 2025",
    "url": "${baseUrl}/",
    "provider": {
      "@type": "Person",
      "name": "Philipp Dubach",
      "url": "https://philippdubach.com"
    },
    "dateModified": "${lastUpdate?.last_fetched || new Date().toISOString()}",
    "dataFeedElement": [
      {
        "@type": "DataFeedItem",
        "name": "Top 25 HN Personal Blogs",
        "url": "${baseUrl}/top25.xml"
      },
      {
        "@type": "DataFeedItem",
        "name": "Top 50 HN Personal Blogs", 
        "url": "${baseUrl}/top50.xml"
      },
      {
        "@type": "DataFeedItem",
        "name": "Top 100 HN Personal Blogs",
        "url": "${baseUrl}/top100.xml"
      }
    ],
    "about": {
      "@type": "Thing",
      "name": "Hacker News",
      "url": "https://news.ycombinator.com",
      "sameAs": "https://en.wikipedia.org/wiki/Hacker_News"
    }
  }
  </script>
  
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      line-height: 1.6;
      max-width: 650px;
      margin: 0 auto;
      padding: 2rem 1rem;
      color: #333;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p.sub { color: #666; margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; margin: 2rem 0 1rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    h3.feed-name { font-size: 1rem; font-weight: 500; margin: 0; }
    ul { list-style: none; }
    li { margin-bottom: 0.5rem; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .feeds { display: flex; flex-direction: column; gap: 0.75rem; }
    .feed { display: flex; justify-content: space-between; align-items: center; }
    .feed-links { display: flex; gap: 0.75rem; font-size: 0.9rem; margin: 0; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #eee; color: #666; font-size: 0.85rem; }
    footer p { margin-bottom: 0.5rem; }
    .stats { color: #666; font-size: 0.9rem; margin-bottom: 0.25rem; }
    .note { color: #888; font-size: 0.75rem; font-style: italic; margin-bottom: 1.5rem; }
    .copyright { margin-top: 1.5rem; margin-bottom: 0.25rem; text-align: center; color: #999; font-size: 0.8rem; }
    a.hidden { color: inherit; }
    a.hidden:hover { color: #0066cc; }
    .github-link { display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem; color: #999; font-size: 0.8rem; transition: color 0.15s; width: 100%; }
    .github-link:hover { color: #666; text-decoration: none; }
    .github-link svg { width: 14px; height: 14px; fill: currentColor; }
  </style>
</head>
<body>
  <header>
    <h1>Top Hacker News Personal Blogs — RSS Feed</h1>
    <p class="sub">One feed for the most popular personal blogs, ranked by <a href="https://news.ycombinator.com" class="hidden">Hacker News</a> performance</p>
  </header>
  
  <main>
  
  <p class="stats">${feedCount?.count || 0} blogs* • ${entryCount?.count?.toLocaleString() || 0} articles • Updated every 15 min (last: <span id="lastUpdate"></span>)</p>
  <p class="note">*Inactive websites automatically removed. Newsletters added via <a href="https://kill-the-newsletter.com" class="hidden">kill-the-newsletter.com</a> (by <a href="https://leafac.com" class="hidden">Leandro Facchinetti</a>). For changes and corrections <a href="mailto:rss-aggregator@pdub.click" class="hidden">email me</a>.</p>
  
  <section aria-labelledby="subscribe-heading">
    <h2 id="subscribe-heading">Subscribe</h2>
    <div class="feeds">
      <article class="feed">
        <h3 class="feed-name">Top 25 Hacker News Personal Blogs</h3>
        <p class="feed-links">
          <a href="/top25.xml">Atom</a>
          <a href="/top25.rss">RSS</a>
        </p>
      </article>
      <article class="feed">
        <h3 class="feed-name">Top 50 Hacker News Personal Blogs</h3>
        <p class="feed-links">
          <a href="/top50.xml">Atom</a>
          <a href="/top50.rss">RSS</a>
        </p>
      </article>
      <article class="feed">
        <h3 class="feed-name">Top 100 Hacker News Personal Blogs</h3>
        <p class="feed-links">
          <a href="/top100.xml">Atom</a>
          <a href="/top100.rss">RSS</a>
        </p>
      </article>
    </div>
  </section>
  </main>
  
  <footer>
    <p>Rankings from the <a href="https://refactoringenglish.com/tools/hn-popularity/?start=2025-01-01&end=2025-12-31" class="hidden">2025 HN Popularity Contest</a> by <a href="https://refactoringenglish.com/" class="hidden">Refactoring English</a>. Blogs ranked by aggregate Hacker News score (submissions with 20+ points).</p>
    <p class="copyright">© 2026 <a href="https://philippdubach.com" class="hidden">philippdubach</a></p>
    <a href="https://github.com/philippdubach/cloudflare-rss-aggregator" class="github-link" title="View source on GitHub">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      Source
    </a>
  </footer>
  <script>
    const lastFetched = '${lastUpdate?.last_fetched || ''}';
    if (lastFetched) {
      const date = new Date(lastFetched);
      document.getElementById('lastUpdate').textContent = date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    } else {
      document.getElementById('lastUpdate').textContent = '—';
    }
  </script>
</body>
</html>`;
}
