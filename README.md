# RSS Aggregator

Serverless RSS feed aggregator on Cloudflare Workers. Combines posts from multiple blogs into unified feeds.

## Endpoints

- `/` - Landing page with stats
- `/top25.xml`, `/top50.xml`, `/top100.xml` - Atom feeds
- `/top25.rss`, `/top50.rss`, `/top100.rss` - RSS 2.0 feeds
- `/api/stats` - JSON stats

## Setup

```bash
# Prerequisites: Node.js 18+, Cloudflare account
npx wrangler login

# Create resources
npx wrangler d1 create rss-aggregator-db
npx wrangler kv:namespace create CACHE
npx wrangler queues create rss-feed-queue

# Update wrangler.toml with the resource IDs from the commands above

# Deploy
npx wrangler d1 execute rss-aggregator-db --file=./schema.sql
python3 scripts/generate-import.py > scripts/import.sql
npx wrangler d1 execute rss-aggregator-db --file=./scripts/import.sql
npx wrangler deploy

# Set admin token for protected endpoints
npx wrangler secret put ADMIN_TOKEN
```

## Data Files

The import scripts expect two CSV files in the parent directory (not included in repo):

**`feeds.csv`** - List of RSS/Atom feeds:
```csv
name,url
Blog Name,https://example.com/feed.xml
```

**`top100.csv`** - Tab-separated rankings:
```
rank	domain	...	author
1	example.com	...	Author Name
```

## Local Development

```bash
npm install
npm run db:migrate:local
npm run db:import:local
npm run dev
```

## Architecture

- Cron trigger (15min) queues feeds for fetching
- Queue worker fetches and parses RSS/Atom feeds
- D1 stores entries, KV caches generated feeds
- Smart Placement enabled for D1 proximity

## Security

Protected endpoints (`/api/trigger-fetch`, `/api/subscribers`) require `Authorization: Bearer <token>` header. SSRF protection blocks internal network requests. Query results capped at 500 entries.

## Configuration

In `wrangler.toml`:
- `ITEMS_PER_FEED` (default: 50) - Max items per source
- `RETENTION_DAYS` (default: 30) - Entry retention period

## License

MIT
