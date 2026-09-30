import { stdin, stdout } from "node:process";

/**
 * Ask for a passphrase without echoing it. When stdin isn't a terminal (the
 * local end-to-end test pipes input in), each call takes the next line.
 */

let piped: string[] | null = null;

async function pipedLines(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

export async function readPassphrase(label: string): Promise<string> {
  if (!stdin.isTTY) {
    process.stderr.write(label);
    piped ??= await pipedLines();
    return piped.shift() ?? "";
  }
  stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl+C: restore the terminal before leaving.
          finish();
          reject(new Error("ยกเลิกแล้ว"));
          return;
        }
        if (ch === "\u0008" || ch === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
