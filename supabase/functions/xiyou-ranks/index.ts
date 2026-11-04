const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type RankRequest = { ownAsin: string; competitorAsins?: string[]; country: string; date: string; keywords: string[] };

async function callMcp(token: string, args: Record<string, unknown>) {
  const response = await fetch('https://mcp.xydc.com/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call', params: { name: 'get_asin_keyword_rank_hourly', arguments: args } }),
  });
  if (!response.ok) throw new Error(`西柚洞察请求失败：${response.status}`);
  const payload = await response.json();
  const content = payload?.result?.content;
  const text = Array.isArray(content) ? content.find((item) => item?.type === 'text')?.text : undefined;
  if (!text) throw new Error('西柚洞察未返回排名数据');
  return JSON.parse(text);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: '仅支持 POST 请求' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const token = Deno.env.get('XYDC_MCP_TOKEN');
  if (!token) return new Response(JSON.stringify({ error: '未配置 XYDC_MCP_TOKEN' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const body = await request.json() as RankRequest;
    const ownAsin = body.ownAsin?.trim().toUpperCase();
    const keywords = [...new Set((body.keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean))];
    const asins = [...new Set([ownAsin, ...(body.competitorAsins ?? []).map((asin) => asin.trim().toUpperCase()).filter(Boolean)])];
    if (!/^[A-Z0-9]{10}$/.test(ownAsin) || !keywords.length || !body.country || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new Error('请求参数不完整或格式不正确');
    if (keywords.length > 20) throw new Error('单次最多抓取 20 个关键词，请分批分析');
    if (asins.some((asin) => !/^[A-Z0-9]{10}$/.test(asin))) throw new Error('ASIN 必须为 10 位字符');
    const userTask = '关键词排名分析：按已选择的广告活动投放关键词查询我方与竞品的小时自然排名和 SP 广告排名。';
    const results = await Promise.all(asins.flatMap((asin) => keywords.map(async (keyword) => {
      try {
        const result = await callMcp(token, { asin, keyword, country: body.country, date: body.date, user_task: userTask, intent_summary: '获取所选关键词在指定 ASIN 下的小时自然排名与 SP 广告排名。' });
        return { asin, keyword, ...(result.data ?? result), error: result.data?.error ? result.data.message : undefined };
      } catch (error) { return { asin, keyword, trends: [], error: error instanceof Error ? error.message : '排名抓取失败' }; }
    })));
    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : '请求失败' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
