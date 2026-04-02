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

    // STEP 2: Search for order emails
    const searchQuery = 'from:walmart.com subject:"Thanks for your delivery order" newer_than:120d';
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=10`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${gmail_token}` },
    });
    const searchData = await searchRes.json();
    const messageCount = searchData.messages?.length || 0;
    step('2_search', {
      ok: searchRes.ok,
      query: searchQuery,
      messages_found: messageCount,
      estimated_total: searchData.resultSizeEstimate || 0,
      error: searchData.error?.message || null,
    });
    if (messageCount === 0) {
      return res.status(200).json(report);
    }

    // STEP 3: Fetch first email — full format
    const msgId = searchData.messages[0].id;
    const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`;
    const msgRes = await fetch(msgUrl, {
      headers: { Authorization: `Bearer ${gmail_token}` },
    });
    const msgData = await msgRes.json();

    const headers = msgData.payload?.headers || [];
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

    step('3_fetch_email', {
      ok: msgRes.ok,
      message_id: msgId,
      subject,
      date,
      passes_subject_filter: subject.includes('Thanks for your delivery order'),
    });

    // STEP 4: Analyze MIME structure in detail
    const mimeInfo = deepMimeAnalysis(msgData.payload);
    step('4_mime_structure', mimeInfo);

    // STEP 5: Try to extract HTML body
    let html = '';
    let extractionMethod = 'none';

    if (msgData.payload?.body?.data) {
      html = decodeBase64Url(msgData.payload.body.data);
      extractionMethod = 'payload.body.data (direct)';
    } else if (msgData.payload?.parts) {
      const partInfo = await findHtmlPart(msgData.payload.parts, msgId, gmail_token);
      html = partInfo.html;
      extractionMethod = partInfo.method;
    }

    step('5_html_extraction', {
      method: extractionMethod,
      html_length: html.length,
      html_first_200: html.slice(0, 200),
      has_html_tags: html.includes('<'),
      has_table_tags: (html.match(/<table/gi) || []).length,
      has_dollar_signs: html.includes('$'),
      has_price_pattern: /\$\d+\.\d{2}/.test(html),
    });

    if (!html) {
      return res.status(200).json(report);
    }

    // STEP 6: Clean HTML and report stats
    const cleanedHtml = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s*(style|class|id|width|height|align|valign|bgcolor|cellpadding|cellspacing|border|role|aria-\w+|data-\w+)="[^"]*"/gi, '')
      .replace(/\s*(style|class|id|width|height|align|valign|bgcolor|cellpadding|cellspacing|border|role|aria-\w+|data-\w+)='[^']*'/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract all dollar amounts found in the cleaned HTML
    const priceMatches = cleanedHtml.match(/\$\d+\.\d{2}/g) || [];

    // Strip ALL tags to get pure text content — this shows us what's actually in the email
    const textContent = cleanedHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&dollar;/g, '$')
      .replace(/&#36;/g, '$')
      .replace(/&zwnj;/g, '')
      .replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract all dollar amounts
    const priceMatches = textContent.match(/\$\d+\.\d{2}/g) || [];

    step('6_content_analysis', {
      raw_html_length: html.length,
      cleaned_html_length: cleanedHtml.length,
      text_content_length: textContent.length,
      prices_found: priceMatches.length,
      all_prices: priceMatches,
      // Show multiple sections of the text to find where items are
      text_0_to_1000: textContent.slice(0, 1000),
      text_1000_to_2000: textContent.slice(1000, 2000),
      text_2000_to_3000: textContent.slice(2000, 3000),
      text_3000_to_4000: textContent.slice(3000, 4000),
      text_4000_to_5000: textContent.slice(4000, 5000),
      text_last_1000: textContent.slice(-1000),
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
