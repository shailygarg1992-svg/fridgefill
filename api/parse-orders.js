// This route reads Walmart order confirmation emails from Gmail
// and extracts structured order data (items, prices, dates).
//
// Key insight from debugging: Walmart sends many email types (delivery updates,
// promotions, change confirmations). The actual order emails have subject
// "Thanks for your delivery order, Shaily". We need to:
// 1. Search broadly to get enough results
// 2. Filter by subject to only process actual order confirmations
// 3. Use pagination to go back far enough for older orders

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
    // Step 1: Search specifically for order confirmation emails
    // "Thanks for your delivery order" is the exact subject Walmart uses
    const searchQuery = 'from:walmart.com subject:"Thanks for your delivery order" newer_than:120d';
    let allMessageIds = [];
    let pageToken = null;

    // Paginate to get all order emails (not just the first page)
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
      if (!pageToken) break; // No more pages
    }

    if (allMessageIds.length === 0) {
      return res.status(200).json({
        orders: [],
        message: 'No Walmart order confirmation emails found. Looking for emails with subject "Thanks for your delivery order".',
      });
    }

    // Step 2: Fetch each email's content
    const emails = [];
    for (const msg of allMessageIds.slice(0, 20)) {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
      const msgResponse = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${gmail_token}` },
      });

      if (!msgResponse.ok) continue;
      const msgData = await msgResponse.json();

      const headers = msgData.payload?.headers || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

      // Extract email body
      let body = '';
      if (msgData.payload?.body?.data) {
        body = decodeBase64Url(msgData.payload.body.data);
      } else if (msgData.payload?.parts) {
        body = extractBodyFromParts(msgData.payload.parts);
      }

      if (body && subject) {
        // Strip HTML but keep structure
        const textBody = body
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&dollar;/g, '$')
          .replace(/&#36;/g, '$')
          .replace(/&#?\w+;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 4000); // More room for longer order emails

        emails.push({ subject, date, body: textBody });
      }
    }

    if (emails.length === 0) {
      return res.status(200).json({
        orders: [],
        message: `Found ${allMessageIds.length} emails but could not read their content.`,
      });
    }

    // Step 3: Send to Claude in batches if needed (to avoid token limits)
    // Process up to 10 emails at a time
    const allOrders = [];
    const batchSize = 5;

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `You extract Walmart grocery order data from order confirmation emails. Return ONLY valid JSON (no markdown, no code fences).

For each email that contains an actual Walmart order confirmation, extract:
- order_date: ISO date string (YYYY-MM-DD) parsed from the email date
- items: array of { name, qty, price } where:
  - name: the full product name exactly as shown in the email
  - qty: quantity ordered (number)
  - price: the TOTAL price for that line item (unit price × qty). This is what the customer paid for that line.

Important:
- Only extract from actual order confirmation emails (subject usually contains "Thanks for your delivery order")
- Skip emails that are shipping updates, promotions, or order change confirmations
- Include ALL items from each order, don't skip any
- The price should be the line total as shown in the email

Return: { "orders": [ { "order_date": "2026-03-25", "items": [ { "name": "Product Name", "qty": 1, "price": 3.99 } ] } ] }

If no valid orders found in this batch, return: { "orders": [] }`,
        messages: [{
          role: 'user',
          content: `Extract Walmart orders from these ${batch.length} emails:\n\n${batch.map((e, idx) =>
            `--- EMAIL ${idx + 1} ---\nSubject: ${e.subject}\nDate: ${e.date}\n\n${e.body}`
          ).join('\n\n')}`,
        }],
      });

      const text = response.content[0].text;
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          continue; // Skip this batch if parsing fails
        }
      }

      if (result.orders) {
        allOrders.push(...result.orders);
      }
    }

    // Sort orders by date (newest first)
    allOrders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

    return res.status(200).json({
      orders: allOrders,
      emails_found: allMessageIds.length,
      emails_processed: emails.length,
    });
  } catch (error) {
    console.error('Parse orders error:', error);
    return res.status(500).json({ error: 'Failed to parse orders', message: error.message });
  }
}

function decodeBase64Url(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractBodyFromParts(parts) {
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
