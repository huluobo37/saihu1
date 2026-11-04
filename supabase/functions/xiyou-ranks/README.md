# 西柚小时排名接口

部署此 Edge Function 后，在 Supabase 项目中设置机密变量 `XYDC_MCP_TOKEN`。该变量只保存在服务端，绝不能放入前端 `.env` 或提交到 GitHub。

函数接收已选投放关键词、我方 ASIN、可选竞品 ASIN、站点和日期，并调用西柚洞察的 `get_asin_keyword_rank_hourly`，返回小时级自然排名（OR）和 SP 广告排名。
