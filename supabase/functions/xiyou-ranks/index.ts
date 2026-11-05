const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RankRequest = {
  operation?: "rank" | "asin_keywords";
  ownAsin: string;
  competitorAsins?: string[];
  country: string;
  date: string;
  keywords: string[];
  mode?: "hourly" | "daily";
  startDate?: string;
  endDate?: string;
};

async function callXiyou(token: string, name: string, args: Record<string, unknown>) {
  const response = await fetch("https://mcp.xydc.com/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!response.ok) throw new Error(`XiYou API returned ${response.status}`);
  const payload = await response.json();
  const content = payload?.result?.content;
  const text = Array.isArray(content)
    ? content.find((item) => item?.type === "text")?.text
    : undefined;

  if (!text) throw new Error("XiYou returned no ranking data");
  return JSON.parse(text);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });
  }

  const token = Deno.env.get("XYDC_MCP_TOKEN");
  if (!token) {
    return Response.json({ error: "XYDC_MCP_TOKEN is not configured" }, { status: 500, headers: corsHeaders });
  }

  try {
    const body = (await request.json()) as RankRequest;
    // XiYou's daily-trend tool still requires a `date` argument. Use the
    // server's China-time date so a browser clock or selected report date
    // cannot make the request invalid.
    const systemDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ownAsin = body.ownAsin?.trim().toUpperCase();
    if (body.operation === "asin_keywords") {
      if (!/^[A-Z0-9]{10}$/.test(ownAsin) || !body.country) throw new Error("Invalid ASIN or country");
      const result = await callXiyou(token, "get_asin_keywords", {
        asin: ownAsin,
        country: body.country,
        page: 1,
        page_size: 100,
        sort_field: "traffic",
        sort_order: "desc",
        user_task: "Query the ASIN's recent traffic keywords.",
        intent_summary: "Return the ASIN's recent organic and advertising traffic keywords ordered by total traffic.",
      });
      const response = result.data ?? result;
      if (response?.error || Number(response?.status) >= 400) {
        return Response.json({ trafficKeywords: [], total: 0, error: response?.message ?? "XiYou returned no traffic keywords" }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return Response.json({ trafficKeywords: Array.isArray(response?.list) ? response.list : [], total: response?.total ?? 0, searchTermCount: response?.searchTermCount ?? [] }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const keywords = [...new Set((body.keywords ?? []).map((value) => value.trim()).filter(Boolean))];
    const mode = body.mode === "daily" ? "daily" : "hourly";
    const asins = [...new Set([
      ownAsin,
      ...(body.competitorAsins ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean),
    ])];

    if (!/^[A-Z0-9]{10}$/.test(ownAsin) || !keywords.length || !body.country || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      throw new Error("Invalid request parameters");
    }
    if (keywords.length > 20) throw new Error("Select up to 20 keywords per request");
    if (asins.some((asin) => !/^[A-Z0-9]{10}$/.test(asin))) {
      throw new Error("Each ASIN must contain 10 letters or digits");
    }

    const results = await Promise.all(asins.flatMap((asin) => keywords.map(async (keyword) => {
      try {
        const result = await callXiyou(token, "get_asin_keyword_rank_hourly", mode === "daily" ? {
          asin,
          keyword,
          country: body.country,
          date: systemDate,
          start_date: body.startDate ?? body.date,
          end_date: body.endDate ?? body.date,
          user_task: "Retrieve daily organic and SP ad ranking trends for a selected keyword.",
          intent_summary: "Return daily organic ranking and SP advertising ranking trends.",
        } : {
          asin,
          keyword,
          country: body.country,
          date: body.date,
          user_task: "Retrieve hourly organic and SP ad ranking for a selected keyword.",
          intent_summary: "Return hourly organic ranking and SP advertising ranking.",
        });
        const response = result.data ?? result;
        if (response?.error || Number(response?.status) >= 400) {
          return {
            asin,
            keyword,
            trends: [],
            error: response?.message ?? "XiYou has no hourly ranking data for this keyword and date",
          };
        }
        const trends = Array.isArray(response?.trends) ? response.trends : Array.isArray(response?.data) ? response.data : [];
        return { asin, keyword, ...(response ?? {}), trends };
      } catch (error) {
        return { asin, keyword, trends: [], error: error instanceof Error ? error.message : "Ranking request failed" };
      }
    })));

    return Response.json({ results }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
