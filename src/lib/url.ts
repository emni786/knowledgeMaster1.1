// Kept in lockstep with the server-side normalizers in
// `src/lib/links.functions.ts` and `src/routes/api/public/extension/save.ts`.
// The frontend uses this for (a) the duplicate-URL guard in handleAdd and
// (b) matching realtime INSERT payloads against `recentlyAddedUrlsRef`, so
// the two implementations must produce byte-identical output for the same
// input — otherwise duplicates slip through and the user gets phantom
// "New link added" toasts on top of their own optimistic adds.
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const p of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "ref_src",
    ]) {
      u.searchParams.delete(p);
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

export function getDomain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function faviconFor(url: string): string {
  const domain = getDomain(url);
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : "";
}

export function detectContentType(
  url: string,
): "article" | "video" | "repo" | "docs" | "tool" | "thread" | "other" {
  const d = getDomain(url).toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(d)) return "video";
  if (/github\.com|gitlab\.com|bitbucket\.org/.test(d)) return "repo";
  if (/twitter\.com|x\.com|threads\.net|reddit\.com/.test(d)) return "thread";
  if (/docs\.|developer\./.test(d)) return "docs";
  if (/medium\.com|substack\.com|dev\.to/.test(d)) return "article";
  return "other";
}
