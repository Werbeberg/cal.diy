import { describe, expect, it, vi } from "vitest";
import type { PrismaApiKeyRepository } from "../repositories/PrismaApiKeyRepository";
import { ApiKeyService } from "./ApiKeyService";

const buildService = (apiKey: unknown) => {
  const apiKeyRepo = {
    findByHashedKey: vi.fn().mockResolvedValue(apiKey),
  };
  return new ApiKeyService({ apiKeyRepo: apiKeyRepo as unknown as PrismaApiKeyRepository });
};

const validApiKey = {
  id: "key-1",
  hashedKey: "hashed",
  userId: 42,
  expiresAt: null,
  user: { uuid: "uuid-1", role: "USER", locked: false, email: "owner@example.com" },
};

describe("ApiKeyService", () => {
  it("rejects unknown keys", async () => {
    const service = buildService(null);

    const result = await service.verifyKeyByHashedKey("hashed");

    expect(result).toEqual({ valid: false, error: "Your API key is not valid." });
  });

  it("rejects expired keys", async () => {
    const service = buildService({
      ...validApiKey,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const result = await service.verifyKeyByHashedKey("hashed");

    expect(result).toEqual({ valid: false, error: "This API key is expired." });
  });

  it("rejects keys without a user", async () => {
    const service = buildService({ ...validApiKey, userId: null, user: null });

    const result = await service.verifyKeyByHashedKey("hashed");

    expect(result).toEqual({ valid: false, error: "No user found for this API key." });
  });

  it("rejects keys of locked users", async () => {
    const service = buildService({
      ...validApiKey,
      user: { ...validApiKey.user, locked: true },
    });

    const result = await service.verifyKeyByHashedKey("hashed");

    expect(result).toEqual({
      valid: false,
      error: "The user account for this API key is locked.",
    });
  });

  it("returns key and user details for valid keys", async () => {
    const service = buildService(validApiKey);

    const result = await service.verifyKeyByHashedKey("hashed");

    expect(result).toEqual({
      valid: true,
      apiKeyId: "key-1",
      userId: 42,
      user: validApiKey.user,
    });
  });

  it("accepts keys that expire in the future", async () => {
    const inOneYear = new Date();
    inOneYear.setFullYear(inOneYear.getFullYear() + 1);
    const service = buildService({ ...validApiKey, expiresAt: inOneYear });

    const result = await service.verifyKeyByHashedKey("hashed");

    expect(result.valid).toBe(true);
  });
});
