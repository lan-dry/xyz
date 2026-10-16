import net from "node:net";

const DEFAULT_PORT = 3310;

export async function scanBufferWithClamAv(
  buffer: Buffer,
): Promise<{ clean: true } | { clean: false; virus: string }> {
  const host = process.env.STOA_CLAMAV_HOST?.trim();
  if (!host) {
    return { clean: true };
  }
  const port = Number(process.env.STOA_CLAMAV_PORT ?? DEFAULT_PORT);
  const timeoutMs = Number(process.env.STOA_CLAMAV_TIMEOUT_MS ?? 30_000);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write("zINSTREAM\0");
      let offset = 0;
      while (offset < buffer.length) {
        const chunk = buffer.subarray(offset, offset + 2048);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length, 0);
        socket.write(len);
        socket.write(chunk);
        offset += chunk.length;
      }
      socket.write(Buffer.alloc(4));
    });

    let response = "";
    socket.setTimeout(timeoutMs);
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      const line = response.trim();
      if (/\bOK\b/.test(line) && !/\bFOUND\b/.test(line)) {
        resolve({ clean: true });
        return;
      }
      if (/\bFOUND\b/.test(line)) {
        const virus = line.replace(/.*?: /, "").replace(/\s+FOUND.*$/i, "").trim();
        resolve({ clean: false, virus: virus || "unknown" });
        return;
      }
      reject(new Error(`ClamAV unexpected response: ${line.slice(0, 200)}`));
    };

    socket.on("data", (d) => {
      response += d.toString("utf8");
      if (/\bOK\b/.test(response) || /\bFOUND\b/.test(response)) {
        socket.end();
      }
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("ClamAV scan timed out"));
    });
    socket.on("error", (err) => {
      reject(err);
    });
    socket.on("end", finish);
    socket.on("close", () => {
      if (response.trim()) {
        finish();
      }
    });
  });
}

export function clamAvRequired(): boolean {
  return process.env.STOA_CLAMAV_REQUIRED === "1";
}

export function clamAvConfigured(): boolean {
  return Boolean(process.env.STOA_CLAMAV_HOST?.trim());
}
