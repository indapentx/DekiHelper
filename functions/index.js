const functions = require('firebase-functions');

const DEFAULT_ALLOWED_ORIGINS = [
  'https://deki-helper.web.app',
  'https://deki-helper.firebaseapp.com',
  'https://indapentx.github.io',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5173',
];

function resolveAllowedOrigins() {
  const configured = functions.config().deepl?.allowed_origins;
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function setCorsHeaders(req, res) {
  const origin = req.get('Origin');
  const allowedOrigins = resolveAllowedOrigins();
  const allowAny = allowedOrigins.includes('*');
  if (origin && (allowAny || allowedOrigins.includes(origin))) {
    res.set('Access-Control-Allow-Origin', origin);
  } else if (allowAny) {
    res.set('Access-Control-Allow-Origin', '*');
  } else {
    res.set('Access-Control-Allow-Origin', allowedOrigins[0] || '*');
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  const requestedHeaders = req.get('Access-Control-Request-Headers');
  if (requestedHeaders) {
    res.set('Access-Control-Allow-Headers', requestedHeaders);
  } else {
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
  res.set('Access-Control-Max-Age', '3600');
}

exports.translateWithDeepL = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use POST.' });
      return;
    }

    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (error) {
        res.status(400).json({ error: 'Invalid JSON payload.' });
        return;
      }
    }

    const { sentences, apiKey: apiKeyFromClient, targetLang, sourceLang } = payload || {};

    if (!Array.isArray(sentences) || sentences.length === 0) {
      res.status(400).json({ error: 'sentences must be a non-empty array of strings.' });
      return;
    }

    const trimmedSentences = sentences
      .map((text) => (typeof text === 'string' ? text.trim() : ''))
      .filter((text) => text.length > 0);

    if (trimmedSentences.length === 0) {
      res.status(400).json({ error: 'Provide at least one non-empty sentence to translate.' });
      return;
    }

    const configuredKey = functions.config().deepl?.key;
    const apiKey = (apiKeyFromClient || configuredKey || '').trim();

    if (!apiKey) {
      res.status(500).json({
        error: 'DeepL API key is not configured on the server and none was provided by the client.',
      });
      return;
    }

    const requestTargetLang =
      typeof targetLang === 'string' && targetLang.trim().length
        ? targetLang.trim().toUpperCase()
        : 'TR';
    const requestSourceLang =
      typeof sourceLang === 'string' && sourceLang.trim().length
        ? sourceLang.trim().toUpperCase()
        : undefined;

    const isFreeKey = apiKey.toLowerCase().endsWith(':fx');
    const deeplUrl = isFreeKey
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const params = new URLSearchParams();
    for (const text of trimmedSentences) {
      params.append('text', text);
    }
    params.append('target_lang', requestTargetLang);
    params.append('preserve_formatting', '1');
    params.append('formality', 'default');
    if (requestSourceLang) {
      params.append('source_lang', requestSourceLang);
    }

    let response;
    try {
      response = await fetch(deeplUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `DeepL-Auth-Key ${apiKey}`,
        },
        body: params.toString(),
      });
    } catch (networkError) {
      res.status(502).json({ error: 'Network error while contacting DeepL.' });
      return;
    }

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (_) {
        /* ignore */
      }

      res
        .status(response.status)
        .json({ error: `DeepL request failed (${response.status}). ${errorBody}`.trim() });
      return;
    }

    let deeplPayload;
    try {
      deeplPayload = await response.json();
    } catch (_) {
      res.status(502).json({ error: 'Unable to parse DeepL response JSON.' });
      return;
    }

    if (!deeplPayload?.translations || !Array.isArray(deeplPayload.translations)) {
      res.status(502).json({ error: 'DeepL response missing translations array.' });
      return;
    }

    const translations = deeplPayload.translations.map((item) => (item?.text || '').trim());
    res.status(200).json({ translations });
  });
