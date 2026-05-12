// Vercel Serverless Function: /api/web-search?q=...
// 可使用 Tavily 或 Brave Search 作為真正的全網搜尋工具。
// 在 Vercel Project Settings → Environment Variables 設定下列任一金鑰：
// 1. TAVILY_API_KEY      （Tavily 官方 Search API，通常以 tvly- 開頭）
// 2. BRAVE_SEARCH_API_KEY

function json(res, status, payload) {
  res.status(status).json(payload);
}

function normalizeSecret(value) {
  return String(value || '').trim().replace(/^['\"]|['\"]$/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { error: '只支援 GET' });

  const q = String(req.query.q || '').trim();
  if (req.query.health === '1') {
    const tavilyKey = normalizeSecret(process.env.TAVILY_API_KEY);
    const braveKey = normalizeSecret(process.env.BRAVE_SEARCH_API_KEY);
    return json(res, 200, {
      ok: true,
      configured: {
        tavily: Boolean(tavilyKey),
        brave: Boolean(braveKey),
      },
      tavily_key_prefix_hint: tavilyKey ? tavilyKey.slice(0, 5) + '...' : '',
      note: '此端點只顯示是否有設定金鑰，不會洩漏完整金鑰。',
    });
  }
  if (!q) return json(res, 400, { error: '缺少 q 查詢參數' });

  try {
    const tavilyKey = normalizeSecret(process.env.TAVILY_API_KEY);
    if (tavilyKey) {
      if (!tavilyKey.startsWith('tvly-')) {
        return json(res, 401, {
          error: 'TAVILY_API_KEY 看起來不是 Tavily 官方金鑰。',
          hint: 'Tavily 金鑰通常以 tvly- 開頭。請確認您貼的是 app.tavily.com 取得的 Tavily key，不是 Apify、Google 或其他服務的 token。',
        });
      }

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${tavilyKey}`,
        },
        body: JSON.stringify({
          query: q,
          search_depth: 'basic',
          max_results: 5,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; }
      catch (e) { data = { raw }; }

      if (!response.ok) {
        return json(res, response.status, {
          error: `Tavily 搜尋失敗：HTTP ${response.status}`,
          detail: data.error || data.message || data.detail || raw.slice(0, 600),
          hint: response.status === 401
            ? '401 通常表示 Tavily API key 無效、貼錯服務的 token，或 Vercel 尚未重新部署套用新環境變數。'
            : '請到 Tavily dashboard 檢查額度與 key 狀態。',
        });
      }

      return json(res, 200, {
        source: 'tavily',
        query: q,
        answer: data.answer || '',
        summary: data.answer || '',
        results: (data.results || []).map(item => ({
          title: item.title || '',
          url: item.url || '',
          snippet: item.content || '',
        })),
      });
    }

    const braveKey = normalizeSecret(process.env.BRAVE_SEARCH_API_KEY);
    if (braveKey) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', q);
      url.searchParams.set('count', '5');
      url.searchParams.set('country', 'TW');
      url.searchParams.set('search_lang', 'zh-hant');

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': braveKey,
        },
      });

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; }
      catch (e) { data = { raw }; }

      if (!response.ok) {
        return json(res, response.status, {
          error: `Brave Search 失敗：HTTP ${response.status}`,
          detail: data.error || data.message || raw.slice(0, 600),
        });
      }

      const results = (data.web?.results || []).map(item => ({
        title: item.title || '',
        url: item.url || '',
        snippet: item.description || '',
      }));

      return json(res, 200, {
        source: 'brave',
        query: q,
        summary: results.map((item, i) => `${i + 1}. ${item.title}：${item.snippet}`).join('\n'),
        results,
      });
    }

    return json(res, 501, {
      error: '尚未設定搜尋服務金鑰。請在 Vercel 設定 TAVILY_API_KEY 或 BRAVE_SEARCH_API_KEY。',
      query: q,
      results: [],
    });
  } catch (error) {
    return json(res, 500, { error: error.message || '搜尋時發生未知錯誤' });
  }
}
