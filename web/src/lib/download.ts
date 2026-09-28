import { ApiError } from "./api";

/** Downloads a gated export; surfaces the server's reason (e.g. approval required) instead of a broken file. */
export async function download(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const b = (await res.json()) as { detail?: string };
      if (b.detail) msg = b.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? url.split("/").pop() ?? "export";
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
