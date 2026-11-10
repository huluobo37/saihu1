const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MarketRequest = { asins: string[]; country?: string; operation?: "product_detail" | "product_report" };

function parseMcpText(raw: string): unknown {
  const event = raw.split("\n").find((line) => line.startsWith("data: "));
  const payload = JSON.parse((event ? event.slice(6) : raw).trim());
  const text = payload?.result?.content?.find((item: { type?: string }) => item.type === "text")?.text;
  if (typeof text === "string") {
    try { return JSON.parse(text); } catch { return text; }
  }
  return payload?.result ?? payload;
}

async function callSorftime(endpoint: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } }),
  });
  if (!response.ok) throw new Error(`Sorftime API returned ${response.status}`);
  return parseMcpText(await response.text());
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });
  const endpoint = Deno.env.get("SORFTIME_MCP_URL");
  if (!endpoint) return Response.json({ error: "SORFTIME_MCP_URL is not configured" }, { status: 500, headers: corsHeaders });
  try {
    const body = (await request.json()) as MarketRequest;
    const asins = [...new Set((body.asins ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean))];
    const country = body.country || "US";
    const operation = body.operation === "product_report" ? "product_report" : "product_detail";
    if (!asins.length || asins.length > 20 || asins.some((asin) => !/^[A-Z0-9]{10}$/.test(asin))) throw new Error("请输入 1-20 个有效 ASIN");
    const results = await Promise.all(asins.map(async (asin) => {
      try {
        const data = await callSorftime(endpoint, operation, { asin, amz_site: country });
        return { asin, data, fetchedAt: new Date().toISOString() };
      } catch (error) {
        return { asin, data: null, error: error instanceof Error ? error.message : "Sorftime 查询失败", fetchedAt: new Date().toISOString() };
      }
    }));
    return Response.json({ results, source: "sorftime", operation }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
