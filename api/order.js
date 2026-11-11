const ALLOWED_VERCEL_ORIGIN_RE = /^https:\/\/sheon-chemise(?:-[a-z0-9-]+)?\.vercel\.app$/i;
const LOCAL_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(?::\d+)?$/i;
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function getRequestOrigin(req) {
  const origin = req.headers?.origin;
  if (typeof origin === 'string' && origin.trim()) {
    return origin.trim();
  }
  const referer = req.headers?.referer;
  if (typeof referer === 'string' && referer.trim()) {
    try {
      return new URL(referer).origin;
    } catch {
      return '';
    }
  }
  return '';
}

function isAllowedOrigin(req) {
  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) {
    return process.env.VERCEL !== '1';
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(requestOrigin);
  } catch {
    return false;
  }

  const forwardedHost = req.headers?.['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : (forwardedHost || req.headers?.host || '');
  const currentHost = String(rawHost).split(',')[0].trim().toLowerCase();

  if (currentHost && parsedOrigin.host.toLowerCase() === currentHost) {
    return true;
  }

  if (ALLOWED_VERCEL_ORIGIN_RE.test(parsedOrigin.origin)) {
    return true;
  }

  if (process.env.VERCEL !== '1' && LOCAL_ORIGIN_RE.test(parsedOrigin.origin)) {
    return true;
  }

  return false;
}

async function readJsonBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'object' && req.body !== null) {
      return req.body;
    }
    if (typeof req.body === 'string') {
      return JSON.parse(req.body);
    }
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Payload too large');
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function toCleanString(value, maxLen = 300) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function sanitizeOrderPayload(data) {
  if (!data || typeof data !== 'object') {
    return { error: 'Invalid order payload' };
  }

  const customerName = toCleanString(data.customerName, 150);
  const phone = toCleanString(data.phone, 20);
  const address = toCleanString(data.address, 500);
  const bundleName = toCleanString(data.bundleName, 150);
  const subtotal = Number(data.subtotal);
  const shipping = Number(data.shipping);
  const total = Number(data.total);

  if (!customerName || !address || !bundleName) {
    return { error: 'Missing required customer or bundle fields' };
  }
  if (!/^01[0125]\d{8}$/.test(phone)) {
    return { error: 'Invalid Egyptian phone number' };
  }
  if (!Number.isFinite(subtotal) || subtotal <= 0 || !Number.isFinite(shipping) || shipping < 0 || !Number.isFinite(total) || total <= 0) {
    return { error: 'Invalid order totals' };
  }

  return {
    payload: {
      orderCode: toCleanString(data.orderCode, 30) || 'SH-0000',
      timestamp: toCleanString(data.timestamp, 100) || new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
      customerName,
      phone,
      governorate: toCleanString(data.governorate, 150),
      address,
      bundleName,
      chosenColors: toCleanString(data.chosenColors, 250),
      paymentMethod: toCleanString(data.paymentMethod, 150),
      subtotal,
      shipping,
      total,
      notes: toCleanString(data.notes, 300) || 'بدون ملاحظات',
      status: toCleanString(data.status, 100) || 'جديد (قيد التأكيد)',
    },
  };
}

/**
 * Proxies validated order submissions from the site to the private Google Sheets Web App URL.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { result: 'error', message: 'Method not allowed' });
  }

  if (!isAllowedOrigin(req)) {
    return sendJson(res, 403, { result: 'error', message: 'Forbidden origin' });
  }

  const webhookUrl = process.env.GOOGLE_SHEETS_WEBAPP_URL;
  if (!webhookUrl) {
    return sendJson(res, 500, { result: 'error', message: 'Google Sheets webhook is not configured' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const statusCode = err?.message === 'Payload too large' ? 413 : 400;
    return sendJson(res, statusCode, { result: 'error', message: 'Invalid JSON request body' });
  }

  const { payload, error } = sanitizeOrderPayload(body);
  if (error) {
    return sendJson(res, 400, { result: 'error', message: error });
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    const responseText = await upstream.text();
    let parsedUpstream = null;
    try {
      parsedUpstream = JSON.parse(responseText);
    } catch {
      parsedUpstream = null;
    }

    if (!upstream.ok || parsedUpstream?.result === 'error') {
      return sendJson(res, 502, {
        result: 'error',
        message: parsedUpstream?.message || 'Upstream Google Sheets error',
      });
    }

    return sendJson(res, 200, {
      result: 'success',
      orderCode: payload.orderCode,
    });
  } catch {
    return sendJson(res, 502, { result: 'error', message: 'Failed to reach Google Sheets webhook' });
  }
}

