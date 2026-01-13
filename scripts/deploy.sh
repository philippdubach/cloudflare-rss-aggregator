#!/bin/bash
# Deployment script for RSS Aggregator
# Run this after `npx wrangler login`

set -e

echo "🚀 RSS Aggregator Deployment Script"
echo "===================================="

# Check if wrangler is logged in
if ! npx wrangler whoami 2>/dev/null | grep -q "You are logged in"; then
    echo "❌ Please login first: npx wrangler login"
    exit 1
fi

echo "✅ Logged in to Cloudflare"

# Create D1 database
echo ""
echo "📦 Creating D1 database..."
D1_OUTPUT=$(npx wrangler d1 create rss-aggregator-db 2>&1 || true)

if echo "$D1_OUTPUT" | grep -q "already exists"; then
    echo "   Database already exists, fetching info..."
    D1_ID=$(npx wrangler d1 list 2>&1 | grep rss-aggregator-db | awk '{print $1}')
else
    D1_ID=$(echo "$D1_OUTPUT" | grep "database_id" | awk -F'"' '{print $2}')
fi

echo "   Database ID: $D1_ID"

# Create KV namespace
echo ""
echo "📦 Creating KV namespace..."
KV_OUTPUT=$(npx wrangler kv:namespace create CACHE 2>&1 || true)

if echo "$KV_OUTPUT" | grep -q "already exists"; then
    echo "   KV namespace already exists, fetching info..."
    KV_ID=$(npx wrangler kv:namespace list 2>&1 | grep -A1 "rss-aggregator-CACHE" | tail -1 | awk -F'"' '{print $4}')
else
    KV_ID=$(echo "$KV_OUTPUT" | grep '"id"' | awk -F'"' '{print $4}')
fi

echo "   KV ID: $KV_ID"

# Create Queue
echo ""
echo "📦 Creating Queue..."
npx wrangler queues create feed-fetch-queue 2>&1 || echo "   Queue may already exist"

# Create R2 bucket
echo ""
echo "📦 Creating R2 bucket..."
npx wrangler r2 bucket create rss-feeds 2>&1 || echo "   Bucket may already exist"

# Update wrangler.toml
echo ""
echo "📝 Updating wrangler.toml..."

if [[ -n "$D1_ID" ]]; then
    sed -i.bak "s/database_id = \"local\"/database_id = \"$D1_ID\"/" wrangler.toml
fi

if [[ -n "$KV_ID" ]]; then
    sed -i.bak "s/^id = \"local\"/id = \"$KV_ID\"/" wrangler.toml
fi

rm -f wrangler.toml.bak

echo "✅ wrangler.toml updated"

# Run migrations
echo ""
echo "🗄️ Running database migrations..."
npx wrangler d1 execute rss-aggregator-db --file=./schema.sql

# Import data
echo ""
echo "📥 Importing feed data..."
python3 scripts/generate-import.py > scripts/import.sql
npx wrangler d1 execute rss-aggregator-db --file=./scripts/import.sql

# Deploy
echo ""
echo "🚀 Deploying worker..."
npx wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your RSS aggregator is now live. The feeds will start populating"
echo "after the first cron trigger (every 15 minutes)."
echo ""
echo "To manually trigger a fetch, run:"
echo "  curl -X POST https://rss-aggregator.<your-subdomain>.workers.dev/api/trigger-fetch"
