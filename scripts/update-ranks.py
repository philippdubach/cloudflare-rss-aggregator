#!/usr/bin/env python3
"""
Generate UPDATE statements to set ranks based on top100.csv.
"""

import csv
from urllib.parse import urlparse

def normalize_domain(domain):
    domain = domain.lower().strip()
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain

def extract_domain(url):
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain

def domains_match(feed_domain, ranked_domain):
    feed_domain = normalize_domain(feed_domain)
    ranked_domain = normalize_domain(ranked_domain)
    
    if feed_domain == ranked_domain:
        return True
    if feed_domain.endswith('.' + ranked_domain):
        return True
    if ranked_domain.endswith('.' + feed_domain):
        return True
    if '/' in ranked_domain:
        base_domain = ranked_domain.split('/')[0]
        if feed_domain == base_domain or feed_domain.endswith('.' + base_domain):
            return True
    return False

# Load rankings
rankings = {}
with open('../top100.csv', 'r', encoding='utf-8') as f:
    reader = csv.reader(f, delimiter='\t')
    next(reader)
    for row in reader:
        if len(row) >= 2:
            rank = int(row[0])
            domain = row[1].lower().strip()
            rankings[domain] = rank

# Load feeds and generate UPDATE statements
matched = 0
with open('../feeds.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        url = row['url'].strip()
        if url:
            domain = extract_domain(url)
            for ranked_domain, rank in rankings.items():
                if domains_match(domain, ranked_domain):
                    escaped_url = url.replace("'", "''")
                    print(f"UPDATE feeds SET rank = {rank} WHERE url = '{escaped_url}';")
                    matched += 1
                    break

print(f"-- Matched {matched} feeds to rankings")
