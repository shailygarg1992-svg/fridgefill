// Reads Walmart "Delivered:" emails from Gmail and extracts item data.
// Uses regex parsing (no Claude API call needed — the text is structured).

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gmail_token } = req.body;

  if (!gmail_token) {
    return res.status(400).json({ error: 'Gmail token required. Connect Gmail first.' });
  }

  try {
    // Search for delivery confirmation emails (these contain item-level data)
    const searchQuery = 'from:walmart.com subject:delivered newer_than:120d';
    let allMessageIds = [];
    let pageToken = null;

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
      return res.status(200).json({ orders: [], message: 'No Walmart delivery emails found.' });
    }

    const allOrders = [];

    // Process up to 10 emails — no Claude call so each is fast
    for (const msg of allMessageIds.slice(0, 10)) {
      try {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
        const msgResponse = await fetch(msgUrl, {
          headers: { Authorization: `Bearer ${gmail_token}` },
        });

        if (!msgResponse.ok) continue;
        const msgData = await msgResponse.json();

        const headers = msgData.payload?.headers || [];
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
        const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

        // Only process "Delivered:" emails
        if (!subject.toLowerCase().includes('delivered')) continue;

        // Extract HTML body
        let html = '';
        if (msgData.payload?.body?.data) {
          html = decodeBase64Url(msgData.payload.body.data);
        } else if (msgData.payload?.parts) {
          html = await extractHtml(msgData.payload.parts, msg.id, gmail_token);
        }

        if (!html) continue;

        // Strip to text content
        const textContent = html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<img[^>]*>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&dollar;/g, '$')
          .replace(/&#36;/g, '$')
          .replace(/&zwnj;/g, '')
          .replace(/&reg;/gi, '®')
          .replace(/&#?\w+;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Parse items using regex
        // Pattern: "Item Name $0.37/OZ Qty: 1 [$0.40 from associate discount] $3.98 [$3.12 ea]"
        const items = parseItemsFromText(textContent);

        if (items.length > 0) {
          allOrders.push({
            order_date: parseEmailDate(date),
            items,
          });
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
    return res.status(500).json({ error: 'Failed to parse orders', message: error.message });
  }
}

function parseItemsFromText(text) {
  const items = [];

  // Find the items section — between "arrived" and "See all items" or "How was"
  const startMatch = text.match(/\d+ items? arrived/i);
  if (!startMatch) return items;

  const startIdx = startMatch.index + startMatch[0].length;
  const endMatch = text.slice(startIdx).match(/See all items|How was your delivery|Payment method/i);
  const itemSection = endMatch
    ? text.slice(startIdx, startIdx + endMatch.index)
    : text.slice(startIdx, startIdx + 3000);

  // Match each item: name, per-unit price, qty, optional discount, total price, optional ea price
  // Example: "Great Value Whole Vitamin D Milk, Gallon, 128 fl oz $0.03/FOZ Qty: 2 $0.64 from associate discount $6.24 $3.12 ea"
  const itemRegex = /([A-Z][^$]+?)\s+\$[\d.]+\/\w+\s+Qty:\s*(\d+)(?:\s+\$[\d.]+\s+from associate discount)?\s+\$([\d.]+)(?:\s+\$([\d.]+)\s+ea)?/gi;

  let match;
  while ((match = itemRegex.exec(itemSection)) !== null) {
    const name = match[1].replace(/Sold and Fulfilled by Walmart\s*/i, '').trim();
    const qty = parseInt(match[2], 10);
    const totalPrice = parseFloat(match[3]);
    const eaPrice = match[4] ? parseFloat(match[4]) : null;

    // Use per-item price: ea price if available, otherwise total/qty
    const unitPrice = eaPrice || (qty > 1 ? totalPrice / qty : totalPrice);

    if (name && !isNaN(unitPrice)) {
      items.push({
        name,
        qty,
        price: Math.round(unitPrice * 100) / 100,
      });
    }
  }

  return items;
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

async function extractHtml(parts, messageId, token) {
  for (const part of parts) {
    if (part.mimeType === 'text/html') {
      if (part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.body?.attachmentId) {
        const attUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`;
        const attRes = await fetch(attUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (attRes.ok) {
          const attData = await attRes.json();
          if (attData.data) return decodeBase64Url(attData.data);
        }
      }
    }
    if (part.parts) {
      const found = await extractHtml(part.parts, messageId, token);
      if (found) return found;
    }
  }
  return '';
}
