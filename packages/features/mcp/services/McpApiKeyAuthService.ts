import process from "node:process";
import { hashAPIKey } from "@calcom/features/api-keys-legacy/api-keys/lib/apiKeys";
import type { PrismaApiKeyRepository } from "@calcom/features/api-keys-legacy/api-keys/repositories/PrismaApiKeyRepository";
import type { ApiKeyService } from "@calcom/features/api-keys-legacy/api-keys/services/ApiKeyService";
import type { McpAuthResult } from "../types";

export interface IMcpApiKeyAuthServiceDeps {
  apiKeyService: ApiKeyService;
  apiKeyRepository: PrismaApiKeyRepository;
}

/**
 * Authenticates MCP requests with the same API keys that are used for the REST API.
 * Keys owned by an instance admin act as "global" keys: they may read data of any
 * user, while regular keys are scoped to their owner.
 */
export class McpApiKeyAuthService {
  constructor(private readonly deps: IMcpApiKeyAuthServiceDeps) {}

  async authenticate(authorizationHeader: string | string[] | undefined): Promise<McpAuthResult> {
    const apiKey = this.extractApiKey(authorizationHeader);
    if (!apiKey) {
      return {
        valid: false,
        error: "Missing API key. Provide it via the 'Authorization: Bearer <api key>' header.",
      };
    }

    const apiKeyPrefix = process.env.API_KEY_PREFIX ?? "cal_";
    const keyWithoutPrefix = apiKey.startsWith(apiKeyPrefix) ? apiKey.slice(apiKeyPrefix.length) : apiKey;
    const hashedKey = hashAPIKey(keyWithoutPrefix);

    const result = await this.deps.apiKeyService.verifyKeyByHashedKey(hashedKey);
    if (!result.valid) {
      return { valid: false, error: result.error };
    }

    await this.deps.apiKeyRepository.updateLastUsedAt({ id: result.apiKeyId });

    return {
      valid: true,
      auth: {
        apiKeyId: result.apiKeyId,
        userId: result.userId,
        userEmail: result.user.email,
        scope: result.user.role === "ADMIN" ? "global" : "user",
      },
    };
  }

  private extractApiKey(authorizationHeader: string | string[] | undefined): string | null {
    if (!authorizationHeader || Array.isArray(authorizationHeader)) return null;

    const [scheme, token] = authorizationHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;

    return token.trim();
  }
}
