// Lightweight diagnostic — NO Claude call, just tests Gmail access + HTML extraction.
// Hit POST /api/debug-parse with { "gmail_token": "..." }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gmail_token } = req.body;
  if (!gmail_token) {
    return res.status(400).json({ error: 'No gmail_token in request body' });
  }

  const report = { steps: [], timestamp: new Date().toISOString() };

  function step(name, data) {
    report.steps.push({ step: name, ...data });
  }

  try {
    // STEP 1: Validate token
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${gmail_token}` },
    });
    const profile = await profileRes.json();
    step('1_token_check', {
      ok: profileRes.ok,
      status: profileRes.status,
      email: profile.emailAddress || null,
      error: profile.error?.message || null,
    });
    if (!profileRes.ok) {
      return res.status(200).json(report);
    }

    // STEP 2: Fetch a "Delivered:" email and check its content
    const searchQuery = 'from:walmart.com subject:delivered newer_than:120d';
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=5`;
    const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${gmail_token}` } });
    const searchData = await searchRes.json();
    const messageCount = searchData.messages?.length || 0;
    step('2_search', { query: searchQuery, found: messageCount });

    if (messageCount === 0) return res.status(200).json(report);

    // STEP 3: Fetch the second delivered email (has 22 items — good test)
    const msgId = searchData.messages[1]?.id || searchData.messages[0].id;
    const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`;
    const msgRes2 = await fetch(msgUrl, { headers: { Authorization: `Bearer ${gmail_token}` } });
    const msgData = await msgRes2.json();
    const headers = msgData.payload?.headers || [];
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';
    step('3_email', { subject, date });

    // STEP 4: Extract HTML
    let html = '';
    if (msgData.payload?.body?.data) {
      html = decodeBase64Url(msgData.payload.body.data);
    } else if (msgData.payload?.parts) {
      const partInfo = await findHtmlPart(msgData.payload.parts, msgId, gmail_token);
      html = partInfo.html;
    }

    // STEP 5: Strip to text and show content
    const cleaned = html
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
      .replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const prices = cleaned.match(/\$\d+\.\d{2}/g) || [];
    step('5_content', {
      html_length: html.length,
      text_length: cleaned.length,
      prices_count: prices.length,
      all_prices: prices.slice(0, 30),
      text_0_to_1500: cleaned.slice(0, 1500),
      text_1500_to_3000: cleaned.slice(1500, 3000),
      text_3000_to_4500: cleaned.slice(3000, 4500),
    });

    return res.status(200).json(report);
  } catch (error) {
    step('fatal_error', { error: error.message, stack: error.stack?.split('\n').slice(0, 3) });
    return res.status(200).json(report);
  }
}

function decodeBase64Url(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function deepMimeAnalysis(payload, depth = 0) {
  if (!payload) return { type: 'null' };
  const info = {
    mimeType: payload.mimeType,
    bodySize: payload.body?.size || 0,
    hasBodyData: !!(payload.body?.data),
    bodyDataLength: payload.body?.data?.length || 0,
    hasAttachmentId: !!(payload.body?.attachmentId),
    attachmentId: payload.body?.attachmentId || null,
  };
  if (payload.parts && depth < 4) {
    info.parts = payload.parts.map(p => deepMimeAnalysis(p, depth + 1));
  }
  return info;
}

async function findHtmlPart(parts, messageId, token, depth = 0) {
  // First pass: look for text/html
  for (const part of parts) {
    if (part.mimeType === 'text/html') {
      if (part.body?.data) {
        return { html: decodeBase64Url(part.body.data), method: `text/html with inline data (depth=${depth})` };
      }
      if (part.body?.attachmentId) {
        // Fetch via attachments API
        const attUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`;
        try {
          const attRes = await fetch(attUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (attRes.ok) {
            const attData = await attRes.json();
            if (attData.data) {
              return { html: decodeBase64Url(attData.data), method: `text/html via attachmentId (depth=${depth}, size=${part.body.size})` };
            }
            return { html: '', method: `text/html attachmentId fetch OK but no data (depth=${depth})` };
          }
          return { html: '', method: `text/html attachmentId fetch failed: ${attRes.status} (depth=${depth})` };
        } catch (e) {
          return { html: '', method: `text/html attachmentId fetch error: ${e.message} (depth=${depth})` };
        }
      }
      return { html: '', method: `text/html found but no data and no attachmentId (bodySize=${part.body?.size}, depth=${depth})` };
    }
  }

  // Recurse into nested parts
  for (const part of parts) {
    if (part.parts && depth < 4) {
      const found = await findHtmlPart(part.parts, messageId, token, depth + 1);
      if (found.html) return found;
    }
  }

  // Fallback: plain text
  for (const part of parts) {
    if (part.mimeType === 'text/plain') {
      if (part.body?.data) {
        return { html: decodeBase64Url(part.body.data), method: `FALLBACK: text/plain with inline data (depth=${depth})` };
      }
      if (part.body?.attachmentId) {
        const attUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`;
        try {
          const attRes = await fetch(attUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (attRes.ok) {
            const attData = await attRes.json();
            if (attData.data) return { html: decodeBase64Url(attData.data), method: `FALLBACK: text/plain via attachmentId (depth=${depth})` };
          }
        } catch {}
      }
    }
  }

  return { html: '', method: `nothing found at depth=${depth}` };
}

async function findPlainText(parts, messageId, token) {
  for (const part of parts) {
    if (part.mimeType === 'text/plain') {
      if (part.body?.data) return decodeBase64Url(part.body.data);
      if (part.body?.attachmentId) {
        const attUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`;
        try {
          const attRes = await fetch(attUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (attRes.ok) {
            const attData = await attRes.json();
            if (attData.data) return decodeBase64Url(attData.data);
          }
        } catch {}
      }
    }
    if (part.parts) {
      const found = await findPlainText(part.parts, messageId, token);
      if (found) return found;
    }
  }
  return '';
}
