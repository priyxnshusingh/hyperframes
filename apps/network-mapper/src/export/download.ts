export type DownloadResult = "saved" | "declined";

/**
 * Hands a file to the viewer. Inside a claude.ai Artifact the frame blocks
 * page-started downloads, so the save goes through the `downloads` capability,
 * which asks the viewer to confirm; elsewhere a plain object-URL link is used.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<DownloadResult> {
  const runtime = window.claude;
  if (runtime) {
    const downloads = await runtime.use("downloads");
    if (!downloads) throw new Error("Saving files isn't available in this view.");
    try {
      await downloads.save({ filename, data: blob });
      return "saved";
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err ? err.code : null;
      if (code === "declined") return "declined";
      throw err instanceof Error ? err : new Error(`Saving failed (${String(code ?? "unknown")}).`);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
}

export function downloadText(
  text: string,
  filename: string,
  type: string,
): Promise<DownloadResult> {
  return downloadBlob(new Blob([text], { type }), filename);
}

export function dateStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
