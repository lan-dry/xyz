import type { Metadata } from "next";
import Link from "next/link";

import { CodeBlock } from "@/components/code-block";
import { DOCS } from "@/lib/site";

export const metadata: Metadata = { title: "Go SDK" };

export default function SdkGoPage() {
  return (
    <>
      <h1>Go SDK</h1>
      <p className="lead">
        Module <code>github.com/salanor/salanor-go/aegis</code> — sign, ingest, and public
        transparency verification. Sources: <code>sdks/go/</code> in the Salanor monorepo.
      </p>

      <div className="callout">
        <strong>Not in Go yet:</strong> <code>wrapFetch</code> policy proxy. Use{" "}
        <Link href="/aegis/api/policy">policy evaluate HTTP</Link> or the TypeScript SDK in a Node
        sidecar.
      </div>

      <h2>Installation</h2>
      <CodeBlock
        lang="bash"
        code={`go get github.com/salanor/salanor-go/aegis`}
      />

      <h2>SignAndIngest</h2>
      <CodeBlock
        lang="go"
        title="main.go"
        code={`import (
    "os"
    "github.com/salanor/salanor-go/aegis"
)

result, err := aegis.SignAndIngest(event, privateKeyB64, keyID, aegis.IngestOptions{
    APIBaseURL:   os.Getenv("AEGIS_API_URL"), // e.g. ${DOCS.apiBaseUrl}
    IngestAPIKey: os.Getenv("AEGIS_INGEST_API_KEY"),
})
if err != nil {
    log.Fatal(err)
}
log.Println(result.EventID, result.Status)`}
      />

      <h2>Public verify</h2>
      <CodeBlock
        lang="go"
        code={`bundle, err := aegis.FetchPublicBundle("${DOCS.apiBaseUrl}", "acme-corp", eventID)
check := aegis.VerifyPublicBundle(bundle)`}
      />

      <h2>See also</h2>
      <ul>
        <li>
          <Link href="/aegis/sdk">All SDKs</Link>
        </li>
        <li>
          <Link href="/aegis/api/public">Public verify HTTP</Link>
        </li>
      </ul>
    </>
  );
}
