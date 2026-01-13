#!/usr/bin/env python3
"""
Generate SQL import statements for feeds and rankings.
Maps feeds.csv to top100.csv rankings.
"""

import csv
import re
from urllib.parse import urlparse

def extract_domain(url):
    """Extract domain from feed URL."""
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    # Remove www. prefix
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain

def normalize_domain(domain):
    """Normalize domain for matching."""
    domain = domain.lower().strip()
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain

def domains_match(feed_domain, ranked_domain):
    """
    Check if domains match for ranking purposes.
    Uses exact matching or subdomain matching, but avoids false positives.
    """
    feed_domain = normalize_domain(feed_domain)
    ranked_domain = normalize_domain(ranked_domain)
    
    # Exact match
    if feed_domain == ranked_domain:
        return True
    
    # Feed domain is subdomain of ranked (e.g., blog.example.com matches example.com)
    if feed_domain.endswith('.' + ranked_domain):
        return True
    
    # Ranked domain is subdomain of feed (e.g., example.com/blog in path)
    if ranked_domain.endswith('.' + feed_domain):
        return True
        
    # Handle paths in ranked domains (e.g., devblogs.microsoft.com/oldnewthing)
    if '/' in ranked_domain:
        base_domain = ranked_domain.split('/')[0]
        path_part = ranked_domain.split('/', 1)[1] if '/' in ranked_domain else ''
        if feed_domain == base_domain or feed_domain.endswith('.' + base_domain):
            return True
    
    return False

def load_rankings():
    """Load rankings from top100.csv."""
    rankings = {}
    with open('../top100.csv', 'r', encoding='utf-8') as f:
        # Tab-separated file
        reader = csv.reader(f, delimiter='\t')
        header = next(reader)  # Skip header
        for row in reader:
            if len(row) >= 6:
                rank = int(row[0])
                domain = row[1].lower().strip()
                author = row[5].strip() if len(row) > 5 else ''
                rankings[domain] = {
                    'rank': rank,
                    'author': author,
                }
    return rankings

def load_feeds():
    """Load feeds from feeds.csv."""
    feeds = []
    with open('../feeds.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row['name'].strip()
            url = row['url'].strip()
            if url:
                feeds.append({
                    'name': name,
                    'url': url,
                    'domain': extract_domain(url),
                })
    return feeds

def escape_sql(s):
    """Escape string for SQL."""
    if s is None:
        return 'NULL'
    return "'" + s.replace("'", "''") + "'"

def main():
    rankings = load_rankings()
    feeds = load_feeds()
    
    print(f"-- Loaded {len(rankings)} rankings and {len(feeds)} feeds")
    print()
    
    # Generate INSERT statements
    print("-- Feed inserts")
    print()
    
    matched = 0
    unmatched = 0
    
    for feed in feeds:
        domain = feed['domain']
        name = feed['name']
        url = feed['url']
        
        # Try to find ranking by domain (exact or subdomain match)
        rank = None
        for ranked_domain, info in rankings.items():
            if domains_match(domain, ranked_domain):
                rank = info['rank']
                break
        
        if rank:
            matched += 1
        else:
            unmatched += 1
        
        rank_val = str(rank) if rank else 'NULL'
        
        print(f"INSERT OR IGNORE INTO feeds (name, url, domain, rank) VALUES ({escape_sql(name)}, {escape_sql(url)}, {escape_sql(domain)}, {rank_val});")
    
    print()
    print(f"-- Summary: {matched} ranked feeds, {unmatched} unranked feeds")

if __name__ == '__main__':
    main()
