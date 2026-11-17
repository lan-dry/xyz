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
    this.privateKeyB64 = privateKeyB64; // gitleaks:allow
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
 * AWS KMS-backed provider. Calls KMS Sign when AWS credentials are available.
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
    request: SignRequest,
  ): Promise<{ sig_value_b64: string; key_id: string }> {
    if (request.key_id !== this.keyId) {
      throw new KeyProviderError(`Unknown key_id ${request.key_id}`);
    }
    try {
      const { KMSClient, SignCommand } = await import("@aws-sdk/client-kms");
      const client = new KMSClient({});
      const result = await client.send(
        new SignCommand({
          KeyId: this.kmsKeyId,
          Message: Buffer.from(request.digest),
          MessageType: "RAW",
          SigningAlgorithm: "ED25519_SHA_512",
        }),
      );
      if (!result.Signature) {
        throw new KeyProviderError(
          `AWS KMS Sign returned no signature for ${this.kmsKeyId}`,
        );
      }
      return {
        sig_value_b64: Buffer.from(result.Signature).toString("base64"),
        key_id: this.keyId,
      };
    } catch (err) {
      if (err instanceof KeyProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new KeyProviderError(
        `AwsKmsKeyProvider.sign failed for ${this.kmsKeyId}: ${msg}. Ensure AWS credentials and kms:Sign on the key.`,
      );
    }
  }
}

/** GCP Cloud KMS asymmetric Sign (requires GCP_KMS_ACCESS_TOKEN or ADC via fetch token). */
export class GcpKmsKeyProvider implements KeyProvider {
  readonly name = "gcp_kms";
  constructor(
    private readonly keyId: string,
    private readonly publicKeyB64: string,
    private readonly keyVersionName: string,
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
    const accessToken = process.env.GCP_KMS_ACCESS_TOKEN?.trim();
    if (!accessToken) {
      throw new KeyProviderError(
        "GcpKmsKeyProvider.sign refused: GCP_KMS_ACCESS_TOKEN is not set",
      );
    }
    const url = `https://cloudkms.googleapis.com/v1/${this.keyVersionName}:asymmetricSign`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        digest: { sha256: Buffer.from(request.digest).toString("base64") },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new KeyProviderError(
        `GcpKmsKeyProvider.sign failed (${response.status}): ${body.slice(0, 200)}`,
      );
    }
    const json = (await response.json()) as { signature?: string };
    if (!json.signature) {
      throw new KeyProviderError("GCP KMS sign returned no signature");
    }
    return { sig_value_b64: json.signature, key_id: this.keyId };
  }
}

/** HashiCorp Vault transit Sign (requires VAULT_ADDR + VAULT_TOKEN). */
export class VaultKeyProvider implements KeyProvider {
  readonly name = "vault";
  constructor(
    private readonly keyId: string,
    private readonly publicKeyB64: string,
    private readonly transitKey: string,
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
    const vaultAddr = process.env.VAULT_ADDR?.trim()?.replace(/\/$/, "");
    const vaultToken = process.env.VAULT_TOKEN?.trim();
    if (!vaultAddr || !vaultToken) {
      throw new KeyProviderError(
        "VaultKeyProvider.sign refused: VAULT_ADDR and VAULT_TOKEN are required",
      );
    }
    const keyName = this.transitKey
      .replace(/^transit\//, "")
      .replace(/^keys\//, "");
    const response = await fetch(
      `${vaultAddr}/v1/transit/sign/${encodeURIComponent(keyName)}`,
      {
        method: "POST",
        headers: {
          "X-Vault-Token": vaultToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: Buffer.from(request.digest).toString("base64"),
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new KeyProviderError(
        `VaultKeyProvider.sign failed (${response.status}): ${body.slice(0, 200)}`,
      );
    }
    const json = (await response.json()) as {
      data?: { signature?: string };
    };
    const vaultSig = json.data?.signature;
    if (!vaultSig) {
      throw new KeyProviderError("Vault transit sign returned no signature");
    }
    const raw = vaultSig.includes(":") ? vaultSig.split(":").pop()! : vaultSig;
    return { sig_value_b64: raw, key_id: this.keyId };
  }
}
