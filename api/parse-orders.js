// Reads Walmart order confirmation emails from Gmail
// and extracts structured order data (items, prices, dates).
//
// Uses direct fetch to Anthropic API (no SDK) to minimize cold start time.
// Exports maxDuration config for Vercel.

// Tell Vercel this function needs more than 10s
export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gmail_token } = req.body;

  if (!gmail_token) {
    return res.status(400).json({ error: 'Gmail token required. Connect Gmail first.' });
  }

  const debug = [];

  try {
    // Search for order confirmation emails
    const searchQuery = 'from:walmart.com subject:"Thanks for your delivery order" newer_than:120d';
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=10`;
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
    const allMessageIds = searchData.messages || [];
    debug.push({ search: `Found ${allMessageIds.length} emails` });

    if (allMessageIds.length === 0) {
      return res.status(200).json({ orders: [], message: 'No Walmart order confirmation emails found.', debug });
    }

    const allOrders = [];

    // Process just 1 email at a time to stay within timeout
    for (const msg of allMessageIds.slice(0, 1)) {
      const emailDebug = { id: msg.id };

      try {
        // Fetch email
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
        const msgResponse = await fetch(msgUrl, {
          headers: { Authorization: `Bearer ${gmail_token}` },
        });

        if (!msgResponse.ok) {
          emailDebug.error = `fetch failed: ${msgResponse.status}`;
          debug.push(emailDebug);
          continue;
        }
        const msgData = await msgResponse.json();

        const headers = msgData.payload?.headers || [];
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
        const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
        emailDebug.subject = subject;
        emailDebug.date = date;

        if (!subject.includes('Thanks for your delivery order')) {
          emailDebug.skipped = 'subject filter';
          debug.push(emailDebug);
          continue;
        }

        // Extract HTML body
        let html = '';
        if (msgData.payload?.body?.data) {
          html = decodeBase64Url(msgData.payload.body.data);
          emailDebug.extraction = 'direct body.data';
        } else if (msgData.payload?.parts) {
          html = await extractHtml(msgData.payload.parts, msg.id, gmail_token);
          emailDebug.extraction = html ? 'from parts' : 'parts empty';
        }

        emailDebug.rawHtmlLength = html.length;

        if (!html) {
          emailDebug.error = 'no HTML body';
          debug.push(emailDebug);
          continue;
        }

        // Clean HTML — strip styles/scripts/images but keep structure
        const cleanedHtml = html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<img[^>]*>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/\s*(style|class|id|width|height|align|valign|bgcolor|cellpadding|cellspacing|border|role|aria-\w+|data-\w+)="[^"]*"/gi, '')
          .replace(/\s*(style|class|id|width|height|align|valign|bgcolor|cellpadding|cellspacing|border|role|aria-\w+|data-\w+)='[^']*'/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        const htmlChunk = cleanedHtml.slice(0, 50000);
        emailDebug.cleanedLength = cleanedHtml.length;
        emailDebug.chunkLength = htmlChunk.length;

        // Call Claude API directly via fetch (no SDK = faster cold start)
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
          emailDebug.error = 'ANTHROPIC_API_KEY not set';
          debug.push(emailDebug);
          continue;
        }

        const startTime = Date.now();
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: `You extract grocery items from a Walmart order confirmation email HTML. Return ONLY valid JSON, no markdown.

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
          }),
        });

        emailDebug.claudeMs = Date.now() - startTime;
        emailDebug.claudeStatus = claudeResponse.status;

        if (!claudeResponse.ok) {
          const errBody = await claudeResponse.text();
          emailDebug.error = `Claude API ${claudeResponse.status}: ${errBody.slice(0, 300)}`;
          debug.push(emailDebug);
          continue;
        }

        const claudeData = await claudeResponse.json();
        const text = claudeData.content?.[0]?.text || '';
        emailDebug.claudeResponseLength = text.length;
        emailDebug.claudeResponsePreview = text.slice(0, 300);

        let result;
        try {
          result = JSON.parse(text);
        } catch {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
          } else {
            emailDebug.error = 'no JSON in Claude response';
            debug.push(emailDebug);
            continue;
          }
        }

        emailDebug.itemsFound = result?.items?.length || 0;

        if (result && result.items && result.items.length > 0) {
          if (!result.order_date || result.order_date === 'YYYY-MM-DD') {
            result.order_date = parseEmailDate(date);
          }
          allOrders.push(result);
        }
      } catch (e) {
        emailDebug.error = `${e.constructor?.name || 'Error'}: ${e.message}`;
      }

      debug.push(emailDebug);
    }

    allOrders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

    return res.status(200).json({
      orders: allOrders,
      emails_found: allMessageIds.length,
      orders_parsed: allOrders.length,
      debug,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to parse orders',
      message: error.message,
      debug,
    });
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
