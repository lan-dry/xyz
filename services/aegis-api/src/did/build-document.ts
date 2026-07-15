/** DID:agent v0.1 — minimal W3C DID document for Salanor agents. */
export function buildDidDocument(input: {
  did: string;
  agentId: string;
  publicKeyB64: string;
  organizationSlug: string;
}): Record<string, unknown> {
  const verificationMethodId = `${input.did}#key-1`;
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: input.did,
    controller: input.did,
    alsoKnownAs: [input.agentId],
    verificationMethod: [
      {
        id: verificationMethodId,
        type: "Ed25519VerificationKey2020",
        controller: input.did,
        publicKeyBase64: input.publicKeyB64,
      },
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    service: [
      {
        id: `${input.did}#aegis`,
        type: "AegisWitness",
        serviceEndpoint: `/v1/public/orgs/${input.organizationSlug}/verify`,
      },
    ],
  };
}
