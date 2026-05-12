// Vercel Serverless Function: /api/web-search?q=...
// 可使用 Tavily 或 Brave Search 作為真正的全網搜尋工具。
// 在 Vercel Project Settings → Environment Variables 設定下列任一金鑰：
// 1. TAVILY_API_KEY
// 2. BRAVE_SEARCH_API_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: '只支援 GET' });

  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: '缺少 q 查詢參數' });

  try {
    if (process.env.TAVILY_API_KEY) {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
        },
        body: JSON.stringify({
          query: q,
          search_depth: 'basic',
          max_results: 5,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `Tavily 搜尋失敗：${text}` });
      }

      const data = await response.json();
      return res.status(200).json({
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

    if (process.env.BRAVE_SEARCH_API_KEY) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', q);
      url.searchParams.set('count', '5');
      url.searchParams.set('country', 'TW');
      url.searchParams.set('search_lang', 'zh-hant');

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `Brave Search 失敗：${text}` });
      }

      const data = await response.json();
      const results = (data.web?.results || []).map(item => ({
        title: item.title || '',
        url: item.url || '',
        snippet: item.description || '',
      }));

      return res.status(200).json({
        source: 'brave',
        query: q,
        summary: results.map((item, i) => `${i + 1}. ${item.title}：${item.snippet}`).join('\n'),
        results,
      });
    }

    return res.status(501).json({
      error: '尚未設定搜尋服務金鑰。請在 Vercel 設定 TAVILY_API_KEY 或 BRAVE_SEARCH_API_KEY。',
      query: q,
      results: [],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || '搜尋時發生未知錯誤' });
  }
}
