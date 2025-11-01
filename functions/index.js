const functions = require('firebase-functions');

/**
 * Callable function that proxies DeepL translate requests so we avoid CORS
 * and keep the API key out of client-side code.
 */
exports.translateWithDeepL = functions
  .region('us-central1')
  .https.onCall(async (data) => {
    const { sentences, apiKey: apiKeyFromClient, targetLang, sourceLang } = data || {};

    if (!Array.isArray(sentences) || sentences.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'sentences must be a non-empty array of strings.'
      );
    }

    const trimmedSentences = sentences
      .map((text) => (typeof text === 'string' ? text.trim() : ''))
      .filter((text) => text.length > 0);

    if (trimmedSentences.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Provide at least one non-empty sentence to translate.'
      );
    }

    const configuredKey = functions.config().deepl?.key;
    const apiKey = (apiKeyFromClient || configuredKey || '').trim();

    if (!apiKey) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'DeepL API key is not configured on the server and none was provided by the client.'
      );
    }

    const requestTargetLang = typeof targetLang === 'string' && targetLang.trim().length
      ? targetLang.trim().toUpperCase()
      : 'TR';
    const requestSourceLang = typeof sourceLang === 'string' && sourceLang.trim().length
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

    const response = await fetch(deeplUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (_) {
        /* ignore */
      }

      const message = `DeepL request failed (${response.status}). ${errorBody}`.trim();
      throw new functions.https.HttpsError('internal', message || 'DeepL request failed.');
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new functions.https.HttpsError('internal', 'Unable to parse DeepL response JSON.');
    }

    if (!payload?.translations || !Array.isArray(payload.translations)) {
      throw new functions.https.HttpsError('internal', 'DeepL response missing translations array.');
    }

    const translations = payload.translations.map((item) => (item?.text || '').trim());

    return { translations };
  });
