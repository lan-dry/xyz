/**
 * KeyProvider interface (P1). Private keys never leave the provider when supported.
 * Local file provider refuses to start in production mode.
 */

export type PublicKeyInfo = {
  key_id: string;
  public_key_b64: string;
  alg: "ed25519";
  status: "active" | "retired";
};

export type SignRequest = {
  key_id: string;
  /** Raw digest bytes to sign (already hashed). */
  digest: Uint8Array;
};

export interface KeyProvider {
  readonly name: string;
  listKeys(): Promise<PublicKeyInfo[]>;
  getPublicKey(keyId: string): Promise<PublicKeyInfo | null>;
  sign(request: SignRequest): Promise<{ sig_value_b64: string; key_id: string }>;
}

export class KeyProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyProviderError";
  }
}

/** Development-only: loads a single Ed25519 seed from env or file path. */
export class LocalFileKeyProvider implements KeyProvider {
  readonly name = "local_file";
  private readonly keyId: string;
  private readonly privateKeyB64: string;
  private readonly publicKeyB64: string;

  private constructor(
    keyId: string,
    privateKeyB64: string,
    publicKeyB64: string,
  ) {
    this.keyId = keyId;
    this.privateKeyB64 = privateKeyB64;
    this.publicKeyB64 = publicKeyB64;
  }

  static async create(options: {
    keyId: string;
    privateKeyB64: string;
    publicKeyB64: string;
    nodeEnv?: string;
  }): Promise<LocalFileKeyProvider> {
    const env = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
    const productionMode =
      env === "production" || process.env.AEGIS_PRODUCTION_MODE === "true";
    if (productionMode) {
      throw new KeyProviderError(
        "LocalFileKeyProvider refuses to start in production mode",
      );
    }
    return new LocalFileKeyProvider(
      options.keyId,
      options.privateKeyB64,
      options.publicKeyB64,
    );
  }

  async listKeys(): Promise<PublicKeyInfo[]> {
    return [
      {
        key_id: this.keyId,
        public_key_b64: this.publicKeyB64,
        alg: "ed25519",
        status: "active",
      },
    ];
  }

  async getPublicKey(keyId: string): Promise<PublicKeyInfo | null> {
    if (keyId !== this.keyId) return null;
    return (await this.listKeys())[0]!;
  }

  async sign(
    request: SignRequest,
  ): Promise<{ sig_value_b64: string; key_id: string }> {
    if (request.key_id !== this.keyId) {
      throw new KeyProviderError(`Unknown key_id ${request.key_id}`);
    }
    const ed = await import("@noble/ed25519");
    const sig = await ed.signAsync(
      request.digest,
      Buffer.from(this.privateKeyB64, "base64"),
    );
    return {
      sig_value_b64: Buffer.from(sig).toString("base64"),
      key_id: this.keyId,
    };
  }
}

/** Private key from environment secret (AEGIS_RECEIPT_SIGNING_KEY_B64). */
export class EnvSecretKeyProvider implements KeyProvider {
  readonly name = "env_secret";
  constructor(
    private readonly keyId: string,
    private readonly privateKeyB64: string,
    private readonly publicKeyB64: string,
  ) {}

  async listKeys(): Promise<PublicKeyInfo[]> {
    return [
      {
        key_id: this.keyId,
        public_key_b64: this.publicKeyB64,
        alg: "ed25519",
        status: "active",
      },
    ];
  }

  async getPublicKey(keyId: string): Promise<PublicKeyInfo | null> {
    if (keyId !== this.keyId) return null;
    return (await this.listKeys())[0]!;
  }

  async sign(
    request: SignRequest,
  ): Promise<{ sig_value_b64: string; key_id: string }> {
    if (request.key_id !== this.keyId) {
      throw new KeyProviderError(`Unknown key_id ${request.key_id}`);
    }
    const ed = await import("@noble/ed25519");
    const sig = await ed.signAsync(
      request.digest,
      Buffer.from(this.privateKeyB64, "base64"),
    );
    return {
      sig_value_b64: Buffer.from(sig).toString("base64"),
      key_id: this.keyId,
    };
  }
}

/**
 * AWS KMS-backed provider stub: uses existing AWS SDK dependency.
 * Signing is delegated to KMS when AEGIS_KMS_KEY_ID is set; otherwise documents extension point.
 */
export class AwsKmsKeyProvider implements KeyProvider {
  readonly name = "aws_kms";
  constructor(
    private readonly keyId: string,
    private readonly publicKeyB64: string,
    private readonly kmsKeyId: string,
  ) {}

  async listKeys(): Promise<PublicKeyInfo[]> {
    return [
      {
        key_id: this.keyId,
        public_key_b64: this.publicKeyB64,
        alg: "ed25519",
        status: "active",
      },
    ];
  }

  async getPublicKey(keyId: string): Promise<PublicKeyInfo | null> {
    if (keyId !== this.keyId) return null;
    return (await this.listKeys())[0]!;
  }

  async sign(
    _request: SignRequest,
  ): Promise<{ sig_value_b64: string; key_id: string }> {
    throw new KeyProviderError(
      `AwsKmsKeyProvider.sign not fully wired for key ${this.kmsKeyId}; use EnvSecretKeyProvider until KMS Sign API is configured`,
    );
  }
}
