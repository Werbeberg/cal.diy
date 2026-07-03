import { hashAPIKey } from "@calcom/features/api-keys-legacy/api-keys/lib/apiKeys";
import type { PrismaApiKeyRepository } from "@calcom/features/api-keys-legacy/api-keys/repositories/PrismaApiKeyRepository";
import type { ApiKeyService } from "@calcom/features/api-keys-legacy/api-keys/services/ApiKeyService";
import { describe, expect, it, vi } from "vitest";
import { McpApiKeyAuthService } from "./McpApiKeyAuthService";

const buildService = ({
  verifyResult,
}: {
  verifyResult: Awaited<ReturnType<ApiKeyService["verifyKeyByHashedKey"]>>;
}) => {
  const apiKeyService = {
    verifyKeyByHashedKey: vi.fn().mockResolvedValue(verifyResult),
  };
  const apiKeyRepository = {
    updateLastUsedAt: vi.fn().mockResolvedValue(undefined),
  };
  const service = new McpApiKeyAuthService({
    apiKeyService: apiKeyService as unknown as ApiKeyService,
    apiKeyRepository: apiKeyRepository as unknown as PrismaApiKeyRepository,
  });
  return { service, apiKeyService, apiKeyRepository };
};

const validVerifyResult = {
  valid: true as const,
  apiKeyId: "key-1",
  userId: 42,
  user: { uuid: "uuid-1", role: "USER", locked: false, email: "owner@example.com" },
};

describe("McpApiKeyAuthService", () => {
  it("rejects requests without an Authorization header", async () => {
    const { service, apiKeyService } = buildService({ verifyResult: validVerifyResult });

    const result = await service.authenticate(undefined);

    expect(result.valid).toBe(false);
    expect(apiKeyService.verifyKeyByHashedKey).not.toHaveBeenCalled();
  });

  it("rejects non-bearer Authorization headers", async () => {
    const { service } = buildService({ verifyResult: validVerifyResult });

    const result = await service.authenticate("Basic dXNlcjpwYXNz");

    expect(result.valid).toBe(false);
  });

  it("rejects invalid API keys with the verification error", async () => {
    const { service, apiKeyRepository } = buildService({
      verifyResult: { valid: false, error: "Your API key is not valid." },
    });

    const result = await service.authenticate("Bearer cal_invalid");

    expect(result).toEqual({ valid: false, error: "Your API key is not valid." });
    expect(apiKeyRepository.updateLastUsedAt).not.toHaveBeenCalled();
  });

  it("strips the configured key prefix before hashing", async () => {
    const { service, apiKeyService } = buildService({ verifyResult: validVerifyResult });

    await service.authenticate("Bearer cal_secret123");

    expect(apiKeyService.verifyKeyByHashedKey).toHaveBeenCalledWith(hashAPIKey("secret123"));
  });

  it("returns a user-scoped auth context and updates lastUsedAt for regular users", async () => {
    const { service, apiKeyRepository } = buildService({ verifyResult: validVerifyResult });

    const result = await service.authenticate("Bearer cal_secret123");

    expect(result).toEqual({
      valid: true,
      auth: {
        apiKeyId: "key-1",
        userId: 42,
        userEmail: "owner@example.com",
        scope: "user",
      },
    });
    expect(apiKeyRepository.updateLastUsedAt).toHaveBeenCalledWith({ id: "key-1" });
  });

  it("grants global scope to keys of instance admins", async () => {
    const { service } = buildService({
      verifyResult: {
        ...validVerifyResult,
        user: { ...validVerifyResult.user, role: "ADMIN" },
      },
    });

    const result = await service.authenticate("Bearer cal_secret123");

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.auth.scope).toBe("global");
    }
  });
});
