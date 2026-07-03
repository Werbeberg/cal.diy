import { PrismaApiKeyRepository } from "@calcom/features/api-keys-legacy/api-keys/repositories/PrismaApiKeyRepository";
import { ApiKeyService } from "@calcom/features/api-keys-legacy/api-keys/services/ApiKeyService";
import { prisma } from "@calcom/prisma";
import { McpApiKeyAuthService } from "../services/McpApiKeyAuthService";

export function getMcpApiKeyAuthService(): McpApiKeyAuthService {
  const apiKeyRepository = new PrismaApiKeyRepository(prisma);

  return new McpApiKeyAuthService({
    apiKeyService: new ApiKeyService({ apiKeyRepo: apiKeyRepository }),
    apiKeyRepository,
  });
}
