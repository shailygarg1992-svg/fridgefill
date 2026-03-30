// This route reads Walmart order confirmation emails from Gmail
// and extracts structured order data (items, prices, dates).
//
// Key learnings from testing:
// - Walmart order emails have subject "Thanks for your delivery order, Shaily"
// - The plain text version only shows a summary (3 items + "See all +16")
// - But the raw HTML (176KB!) contains ALL item details in table/div structures
// - Solution: strip styles/scripts but keep HTML structure, let Claude parse it

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gmail_token } = req.body;

  if (!gmail_token) {
    return res.status(400).json({ error: 'Gmail token required. Connect Gmail first.' });
  }

  try {
    // Search specifically for order confirmation emails
    const searchQuery = 'from:walmart.com subject:"Thanks for your delivery order" newer_than:120d';
    let allMessageIds = [];
    let pageToken = null;

    // Paginate to get all order emails
    for (let page = 0; page < 3; page++) {
      let searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`;
      if (pageToken) searchUrl += `&pageToken=${pageToken}`;

      const searchResponse = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${gmail_token}` },
      });

      if (!searchResponse.ok) {
        const err = await searchResponse.json();
        if (err.error?.code === 401) {
          return res.status(401).json({ error: 'Gmail token expired. Please reconnect Gmail.' });
        }
        throw new Error(err.error?.message || 'Gmail search failed');
      }

      const searchData = await searchResponse.json();
      if (searchData.messages) {
        allMessageIds.push(...searchData.messages);
      }

      pageToken = searchData.nextPageToken;
      if (!pageToken) break;
    }

    if (allMessageIds.length === 0) {
      return res.status(200).json({ orders: [], message: 'No Walmart order confirmation emails found.' });
    }

    // Fetch and parse each email individually
    // (one Claude call per email to avoid context limits with large HTML)
    const allOrders = [];

    for (const msg of allMessageIds.slice(0, 15)) {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
      const msgResponse = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${gmail_token}` },
      });

      if (!msgResponse.ok) continue;
      const msgData = await msgResponse.json();

      const headers = msgData.payload?.headers || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

      // Only process actual order confirmations
      if (!subject.includes('Thanks for your delivery order')) continue;

      // Extract HTML body
      let html = '';
      if (msgData.payload?.body?.data) {
        html = decodeBase64Url(msgData.payload.body.data);
      } else if (msgData.payload?.parts) {
        html = extractBodyFromParts(msgData.payload.parts);
      }

      if (!html) continue;

      // Clean HTML: remove styles/scripts/images but KEEP structural tags
      // This preserves tables, divs, spans that contain item data
      const cleanedHtml = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<img[^>]*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s*(style|class|id|width|height|align|valign|bgcolor|cellpadding|cellspacing|border|role|aria-\w+|data-\w+)="[^"]*"/gi, '')
        .replace(/\s*(style|class|id|width|height|align|valign|bgcolor|cellpadding|cellspacing|border|role|aria-\w+|data-\w+)='[^']*'/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Send a large chunk — item data can be deep in the HTML after headers/nav
      // After stripping styles/scripts/images/attributes, 176KB → ~30-50KB
      // Claude Sonnet can handle up to ~100K tokens, so 50KB of HTML is fine
      const htmlChunk = cleanedHtml.slice(0, 50000);

      // Parse this single email with Claude
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: `You extract grocery items from a Walmart order confirmation email HTML. Return ONLY valid JSON.

Extract every item listed in the email. Look for product names, quantities, and prices in the HTML structure (tables, divs, spans).

Rules:
- name: full product name as shown
- qty: quantity (default 1 if not shown)
- price: the price shown for that item (unit price per item, NOT multiplied by qty)

Return: { "order_date": "YYYY-MM-DD", "items": [ { "name": "Product Name", "qty": 1, "price": 3.99 } ] }

If you cannot find item details, return: { "order_date": "YYYY-MM-DD", "items": [] }`,
          messages: [{
            role: 'user',
            content: `Extract all items from this Walmart order email.
Subject: ${subject}
Date: ${date}

HTML content:
${htmlChunk}`,
          }],
        });

        const text = response.content[0].text;
        let result;
        try {
          result = JSON.parse(text);
        } catch {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) result = JSON.parse(jsonMatch[0]);
          else continue;
        }

        if (result && result.items && result.items.length > 0) {
          // If Claude didn't get the date from the email, parse it from the header
          if (!result.order_date || result.order_date === 'YYYY-MM-DD') {
            result.order_date = parseEmailDate(date);
          }
          allOrders.push(result);
        }
      } catch (e) {
        console.error(`Failed to parse email ${msg.id}:`, e.message);
        continue;
      }
    }

    // Sort orders by date (newest first)
    allOrders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

    return res.status(200).json({
      orders: allOrders,
      emails_found: allMessageIds.length,
      orders_parsed: allOrders.length,
    });
  } catch (error) {
    console.error('Parse orders error:', error);
    return res.status(500).json({ error: 'Failed to parse orders', message: error.message });
  }
}

function parseEmailDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

function decodeBase64Url(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractBodyFromParts(parts) {
  // Prefer HTML — it contains the full item list
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      const found = extractBodyFromParts(part.parts);
      if (found) return found;
    }
  }
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }
  return '';
}
