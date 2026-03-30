// End-to-end test endpoint for Gmail order parsing.
// Tests each step independently and reports exactly where things break.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gmail_token } = req.body;
  if (!gmail_token) {
    return res.status(400).json({ error: 'No Gmail token' });
  }

  const report = {
    test_time: new Date().toISOString(),
    tests: [],
  };

  // TEST 1: Is the token valid?
  try {
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${gmail_token}` },
    });
    const profile = await profileRes.json();
    report.tests.push({
      name: 'Token validity',
      pass: profileRes.ok,
      detail: profileRes.ok ? `Token valid for ${profile.emailAddress}` : `Token error: ${profile.error?.message || 'unknown'}`,
    });
    if (!profileRes.ok) {
      return res.status(200).json(report);
    }
  } catch (e) {
    report.tests.push({ name: 'Token validity', pass: false, detail: e.message });
    return res.status(200).json(report);
  }

  // TEST 2: Try multiple search queries and see which ones find emails
  const queries = [
    { label: 'Exact order subject', q: 'from:walmart.com subject:"Thanks for your delivery order" newer_than:120d' },
    { label: 'Broader order subject', q: 'from:walmart.com subject:"delivery order" newer_than:120d' },
    { label: 'Thanks + walmart', q: 'from:walmart.com subject:Thanks newer_than:120d' },
    { label: 'help@walmart.com only', q: 'from:help@walmart.com newer_than:120d' },
    { label: 'All from walmart.com', q: 'from:walmart.com newer_than:120d' },
  ];

  let bestQuery = null;
  let bestMessages = [];

  for (const { label, q } of queries) {
    try {
      const searchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10`,
        { headers: { Authorization: `Bearer ${gmail_token}` } }
      );
      const data = await searchRes.json();
      const count = data.messages?.length || 0;
      const total = data.resultSizeEstimate || 0;

      // Get subjects of found emails
      const subjects = [];
      if (data.messages) {
        for (const msg of data.messages.slice(0, 5)) {
          const mRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`,
            { headers: { Authorization: `Bearer ${gmail_token}` } }
          );
          const mData = await mRes.json();
          const h = mData.payload?.headers || [];
          subjects.push({
            subject: h.find(x => x.name === 'Subject')?.value,
            date: h.find(x => x.name === 'Date')?.value,
            from: h.find(x => x.name === 'From')?.value,
          });
        }
      }

      const test = { name: `Search: ${label}`, pass: count > 0, found: count, estimated_total: total, sample_subjects: subjects };
      report.tests.push(test);

      // Pick the best query that finds actual order confirmations
      if (!bestQuery && count > 0) {
        const orderEmails = subjects.filter(s =>
          s.subject && (
            s.subject.includes('Thanks for your delivery order') ||
            s.subject.includes('Thanks for your order')
          )
        );
        if (orderEmails.length > 0) {
          bestQuery = q;
          bestMessages = data.messages;
        }
      }
    } catch (e) {
      report.tests.push({ name: `Search: ${label}`, pass: false, detail: e.message });
    }
  }

  // TEST 3: If we found order emails, try to read one fully
  if (bestMessages.length > 0) {
    try {
      const msgId = bestMessages[0].id;
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${gmail_token}` } }
      );
      const msgData = await msgRes.json();

      const headers = msgData.payload?.headers || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';

      // Try to extract body
      let body = '';
      if (msgData.payload?.body?.data) {
        body = decodeBase64Url(msgData.payload.body.data);
      } else if (msgData.payload?.parts) {
        body = extractBodyFromParts(msgData.payload.parts);
      }

      // Clean HTML
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
        .trim();

      report.tests.push({
        name: 'Read email body',
        pass: textBody.length > 0,
        subject: subject,
        body_length: textBody.length,
        body_preview: textBody.slice(0, 500),
        has_price_signs: textBody.includes('$'),
        mime_structure: describeMime(msgData.payload),
      });
    } catch (e) {
      report.tests.push({ name: 'Read email body', pass: false, detail: e.message });
    }
  } else {
    report.tests.push({
      name: 'Read email body',
      pass: false,
      detail: 'No order confirmation emails found to test with. Best query was: ' + (bestQuery || 'none matched'),
    });
  }

  // TEST 4: Summary and recommendation
  const orderQueryResults = report.tests.filter(t => t.name.startsWith('Search:') && t.pass);
  report.summary = {
    token_valid: report.tests[0]?.pass,
    queries_with_results: orderQueryResults.length,
    best_query: bestQuery,
    total_order_emails: bestMessages.length,
    recommendation: bestQuery
      ? `Use query: ${bestQuery}`
      : 'No query found order confirmation emails. Check if Walmart emails are in a different Gmail account or if the subject line format is different.',
  };

  return res.status(200).json(report);
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

function describeMime(payload) {
  if (!payload) return 'empty';
  const parts = [];
  if (payload.mimeType) parts.push(payload.mimeType);
  if (payload.body?.size > 0) parts.push(`body:${payload.body.size}bytes`);
  if (payload.parts) {
    parts.push(`parts:[${payload.parts.map(p => describeMime(p)).join(', ')}]`);
  }
  return parts.join(' ');
}
