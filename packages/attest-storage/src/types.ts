/** FR-ATT-LEDGER-OBJ — pluggable content-addressed blob store. */
export interface BlobStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  has(key: string): Promise<boolean>;
}

export interface BlobStorePutResult {
  key: string;
  sha256: string;
}
