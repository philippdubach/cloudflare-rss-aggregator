// RSS/Atom Feed Parser using fast-xml-parser
import { XMLParser } from 'fast-xml-parser';
import { ParsedFeed, ParsedFeedItem } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['item', 'entry', 'category'].includes(name),
});

function generateId(item: any, feedUrl: string): string {
  // Try to get GUID/ID from item
  if (item.guid) {
    const guid = typeof item.guid === 'string' ? item.guid : item.guid['#text'];
    if (guid) return guid;
  }
  if (item.id) {
    const id = typeof item.id === 'string' ? item.id : item.id['#text'];
    if (id) return id;
  }
  
  // Generate hash from title + link
  const title = extractText(item.title) || '';
  const link = extractLink(item) || feedUrl;
  return hashString(`${title}:${link}`);
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function extractText(node: any): string | undefined {
  if (!node) return undefined;
  if (typeof node === 'string') return node.trim();
  if (node['#text']) return node['#text'].trim();
  if (node['@_type'] === 'html' && node['#text']) {
    return stripHtml(node['#text']).trim();
  }
  return undefined;
}

function extractLink(item: any): string | undefined {
  // RSS format
  if (item.link && typeof item.link === 'string') {
    return item.link.trim();
  }
  // Atom format - link can be array or object
  if (item.link) {
    if (Array.isArray(item.link)) {
      const alternate = item.link.find((l: any) => 
        l['@_rel'] === 'alternate' || !l['@_rel']
      );
      if (alternate) return alternate['@_href'];
      return item.link[0]['@_href'];
    }
    if (item.link['@_href']) return item.link['@_href'];
  }
  return undefined;
}

/**
 * Extract the blog's own permalink URL (for linkblogs like Daring Fireball).
 * Linkblogs often have <link> pointing to external articles they're referencing,
 * while the blog's own URL is in a different location depending on feed format:
 * - Atom: <link rel="related"> or <link rel="self"> or <id> if it's a URL
 * - RSS 2.0: <guid isPermaLink="true">
 */
function extractPermalink(item: any, feedUrl: string): string | undefined {
  // For Atom feeds: look for <link rel="related"> first (Daring Fireball uses this)
  // Then try <link rel="self"> or <link rel="via">
  if (item.link && Array.isArray(item.link)) {
    // Priority: related > self > via
    const relatedLink = item.link.find((l: any) => l['@_rel'] === 'related');
    if (relatedLink?.['@_href']) {
      return relatedLink['@_href'];
    }
    
    const selfLink = item.link.find((l: any) => 
      l['@_rel'] === 'self' || l['@_rel'] === 'via'
    );
    if (selfLink?.['@_href']) {
      return selfLink['@_href'];
    }
  }
  
  // For Atom feeds: check if <id> is a URL (some feeds use URL as id)
  if (item.id) {
    const id = typeof item.id === 'string' ? item.id : item.id['#text'];
    if (id && id.startsWith('http')) {
      return id;
    }
  }
  
  // For RSS 2.0: check <guid> with isPermaLink attribute
  // Per RSS 2.0 spec, isPermaLink defaults to "true" if not specified
  if (item.guid) {
    const isPermaLink = item.guid['@_isPermaLink'];
    const guidValue = typeof item.guid === 'string' ? item.guid : item.guid['#text'];
    
    // Use guid as permalink if isPermaLink is not explicitly "false" AND it looks like a URL
    if (guidValue && isPermaLink !== 'false' && guidValue.startsWith('http')) {
      return guidValue;
    }
  }
  
  return undefined;
}

function extractDate(item: any): string | undefined {
  // Try various date fields
  const dateFields = ['pubDate', 'published', 'updated', 'date', 'dc:date'];
  for (const field of dateFields) {
    const value = item[field];
    if (value) {
      const dateStr = typeof value === 'string' ? value : value['#text'];
      if (dateStr) {
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
        } catch (e) {
          // Invalid date, try next
        }
      }
    }
  }
  return undefined;
}

function extractContent(item: any): { summary?: string; content?: string } {
  let summary: string | undefined;
  let content: string | undefined;

  // Try description/summary
  if (item.description) {
    summary = extractText(item.description);
  } else if (item.summary) {
    summary = extractText(item.summary);
  }

  // Try content:encoded or content
  if (item['content:encoded']) {
    content = extractText(item['content:encoded']);
  } else if (item.content) {
    content = extractText(item.content);
  }

  // Limit lengths
  if (summary && summary.length > 1000) {
    summary = summary.substring(0, 1000) + '...';
  }
  if (content && content.length > 10000) {
    content = content.substring(0, 10000) + '...';
  }

  return { summary, content };
}

function extractAuthor(item: any): string | undefined {
  if (item.author) {
    if (typeof item.author === 'string') return item.author;
    if (item.author.name) return extractText(item.author.name);
    if (item.author['#text']) return item.author['#text'];
  }
  if (item['dc:creator']) {
    return extractText(item['dc:creator']);
  }
  return undefined;
}

function extractTags(item: any): string[] {
  const tags: string[] = [];
  if (item.category) {
    const categories = Array.isArray(item.category) ? item.category : [item.category];
    for (const cat of categories) {
      const tag = typeof cat === 'string' ? cat : (cat['#text'] || cat['@_term']);
      if (tag) tags.push(tag.trim());
    }
  }
  return tags;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const doc = parser.parse(xml);
  
  let title = 'Unknown Feed';
  let items: any[] = [];

  // RSS 2.0 format
  if (doc.rss?.channel) {
    const channel = doc.rss.channel;
    title = extractText(channel.title) || title;
    items = channel.item || [];
  }
  // Atom format
  else if (doc.feed) {
    title = extractText(doc.feed.title) || title;
    items = doc.feed.entry || [];
  }
  // RSS 1.0 / RDF format
  else if (doc['rdf:RDF']) {
    const rdf = doc['rdf:RDF'];
    if (rdf.channel) {
      title = extractText(rdf.channel.title) || title;
    }
    items = rdf.item || [];
  }

  const parsedItems: ParsedFeedItem[] = items.map((item: any) => {
    const { summary, content } = extractContent(item);
    const link = extractLink(item) || feedUrl;
    const permalink = extractPermalink(item, feedUrl);
    
    return {
      id: generateId(item, feedUrl),
      title: extractText(item.title) || 'Untitled',
      link,
      permalink,  // Blog's own URL (may differ from link for linkblogs)
      published: extractDate(item),
      updated: item.updated ? extractDate({ pubDate: item.updated }) : undefined,
      summary,
      content,
      author: extractAuthor(item),
      tags: extractTags(item),
    };
  });

  return { title, items: parsedItems };
}
