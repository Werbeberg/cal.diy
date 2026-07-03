import type { PrismaApiKeyRepository } from "../repositories/PrismaApiKeyRepository";

type Deps = {
  apiKeyRepo: PrismaApiKeyRepository;
};

type VerifyKeyResult =
  | {
      valid: true;
      apiKeyId: string;
      userId: number;
      user: {
        uuid: string;
        role: string;
        locked: boolean;
        email: string;
      };
    }
  | {
      valid: false;
      error: string;
    };

export class ApiKeyService {
  constructor(private readonly deps: Deps) {}

  async verifyKeyByHashedKey(hashedKey: string): Promise<VerifyKeyResult> {
    const apiKey = await this.deps.apiKeyRepo.findByHashedKey(hashedKey);

    if (!apiKey) {
      return { valid: false, error: "Your API key is not valid." };
    }

    if (apiKey.expiresAt && this.isExpired(apiKey.expiresAt)) {
      return { valid: false, error: "This API key is expired." };
    }

    if (!apiKey.userId || !apiKey.user) {
      return { valid: false, error: "No user found for this API key." };
    }

    if (apiKey.user.locked) {
      return { valid: false, error: "The user account for this API key is locked." };
    }

    return {
      valid: true,
      apiKeyId: apiKey.id,
      userId: apiKey.userId,
      user: apiKey.user,
    };
  }

  private isExpired(expiresAt: Date): boolean {
    const now = new Date();
    return now.setHours(0, 0, 0, 0) > expiresAt.setHours(0, 0, 0, 0);
  }
}
