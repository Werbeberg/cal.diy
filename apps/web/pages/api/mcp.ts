import { getMcpApiKeyAuthService } from "@calcom/features/mcp/di/McpApiKeyAuthService.container";
import { getMcpToolsService } from "@calcom/features/mcp/di/McpToolsService.container";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import logger from "@calcom/lib/logger";
import { buildMcpServer } from "@lib/mcp/buildMcpServer";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NextApiRequest, NextApiResponse } from "next";

const log = logger.getSubLogger({ prefix: ["mcp-endpoint"] });

const jsonRpcError = (code: number, message: string) => ({
  jsonrpc: "2.0",
  error: { code, message },
  id: null,
});

/**
 * Stateless MCP (Model Context Protocol) endpoint, see https://modelcontextprotocol.io.
 * Authenticated with the same API keys as the REST API via `Authorization: Bearer <key>`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    // The server is stateless: no SSE streams (GET) and no sessions to delete (DELETE)
    res.setHeader("Allow", "POST");
    res.status(405).json(jsonRpcError(-32000, "Method not allowed. This MCP server only supports POST."));
    return;
  }

  const authResult = await getMcpApiKeyAuthService().authenticate(req.headers.authorization);
  if (!authResult.valid) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="cal.diy MCP"');
    res.status(401).json(jsonRpcError(-32001, authResult.error));
    return;
  }

  try {
    await checkRateLimitAndThrowError({
      rateLimitingType: "api",
      identifier: `mcp:${authResult.auth.apiKeyId}`,
    });
  } catch {
    res.status(429).json(jsonRpcError(-32002, "Rate limit exceeded. Please try again later."));
    return;
  }

  const server = buildMcpServer({ auth: authResult.auth, toolsService: getMcpToolsService() });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    log.error("Failed to handle MCP request", error);
    if (!res.headersSent) {
      res.status(500).json(jsonRpcError(-32603, "Internal server error"));
    }
  }
}
