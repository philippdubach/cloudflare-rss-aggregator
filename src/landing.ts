// Landing page HTML template
import { Env } from './types';

export async function generateLandingPage(env: Env): Promise<string> {
  // Get stats
  const feedCount = await env.DB.prepare('SELECT COUNT(*) as count FROM feeds WHERE rank IS NOT NULL').first<{count: number}>();
  const entryCount = await env.DB.prepare('SELECT COUNT(*) as count FROM entries').first<{count: number}>();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Top HN Personal Blogs RSS</title>
  <meta name="description" content="Combined RSS feeds from the top 100 Hacker News personal blogs">
  <link rel="alternate" type="application/atom+xml" title="Top 100" href="/top100.xml">
  <link rel="alternate" type="application/atom+xml" title="Top 50" href="/top50.xml">
  <link rel="alternate" type="application/atom+xml" title="Top 25" href="/top25.xml">
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
    ul { list-style: none; }
    li { margin-bottom: 0.5rem; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .feeds { display: flex; flex-direction: column; gap: 0.75rem; }
    .feed { display: flex; justify-content: space-between; align-items: center; }
    .feed-name { font-weight: 500; }
    .feed-links { display: flex; gap: 0.75rem; font-size: 0.9rem; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #eee; color: #666; font-size: 0.85rem; }
    footer p { margin-bottom: 0.5rem; }
    .stats { color: #666; font-size: 0.9rem; margin-bottom: 0.25rem; }
    .note { color: #888; font-size: 0.75rem; font-style: italic; margin-bottom: 1.5rem; }
    .copyright { margin-top: 1.5rem; text-align: center; color: #999; font-size: 0.8rem; }
    a.hidden { color: inherit; }
    a.hidden:hover { color: #0066cc; }
    .github-link { display: inline-flex; align-items: center; gap: 0.35rem; color: #666; transition: color 0.15s; }
    .github-link:hover { color: #333; text-decoration: none; }
    .github-link svg { width: 16px; height: 16px; fill: currentColor; }
    .footer-links { display: flex; justify-content: center; gap: 1.5rem; margin-bottom: 0.75rem; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Top HN Personal Blogs RSS</h1>
  <p class="sub">Combined feeds from the top personal blogs ranked by Hacker News performance</p>
  
  <p class="stats">${feedCount?.count || 0} blogs* • ${entryCount?.count?.toLocaleString() || 0} articles • Updated every 15 min (last: <span id="lastUpdate"></span>)</p>
  <p class="note">*Inactive websites automatically removed. Newsletters added via <a href="https://kill-the-newsletter.com" class="hidden">kill-the-newsletter.com</a> (by <a href="https://leafac.com" class="hidden">Leandro Facchinetti</a>). For changes and corrections <a href="mailto:rss-aggregator@pdub.click" class="hidden">email me</a>.</p>
  
  <h2>Subscribe</h2>
  <div class="feeds">
    <div class="feed">
      <span class="feed-name">Top 25 HN Personal Blogs</span>
      <span class="feed-links">
        <a href="/top25.xml">Atom</a>
        <a href="/top25.rss">RSS</a>
      </span>
    </div>
    <div class="feed">
      <span class="feed-name">Top 50 HN Personal Blogs</span>
      <span class="feed-links">
        <a href="/top50.xml">Atom</a>
        <a href="/top50.rss">RSS</a>
      </span>
    </div>
    <div class="feed">
      <span class="feed-name">Top 100 HN Personal Blogs</span>
      <span class="feed-links">
        <a href="/top100.xml">Atom</a>
        <a href="/top100.rss">RSS</a>
      </span>
    </div>
  </div>
  
  <footer>
    <p>Rankings from the <a href="https://refactoringenglish.com/tools/hn-popularity/?start=2025-01-01&end=2025-12-31">2025 HN Popularity Contest</a> by <a href="https://refactoringenglish.com/">Refactoring English</a>. Blogs ranked by aggregate Hacker News score (submissions with 20+ points).</p>
    <div class="footer-links">
      <a href="https://github.com/philippdubach/cloudflare-rss-aggregator" class="github-link" title="View source on GitHub">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Source
      </a>
    </div>
    <p class="copyright">© 2026 <a href="https://philippdubach.com" class="hidden">philippdubach</a></p>
  </footer>
  <script>
    const serverTime = new Date('${new Date().toISOString()}');
    document.getElementById('lastUpdate').textContent = serverTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  </script>
</body>
</html>`;
}
