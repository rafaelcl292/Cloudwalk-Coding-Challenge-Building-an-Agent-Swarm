export type TextChunk = {
  text: string;
  tokenCount: number;
  index: number;
};

export function extractTitle(html: string) {
  const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1];

  return title ? decodeHtml(title).trim() : null;
}

export function normalizeHtml(html: string) {
  return decodeHtml(
    html
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

export function chunkText(text: string, chunkSize = 900, overlap = 120): TextChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: TextChunk[] = [];

  if (words.length === 0) {
    return chunks;
  }

  for (let start = 0; start < words.length; start += chunkSize - overlap) {
    const slice = words.slice(start, start + chunkSize);

    chunks.push({
      text: slice.join(" "),
      tokenCount: slice.length,
      index: chunks.length,
    });

    if (start + chunkSize >= words.length) {
      break;
    }
  }

  return chunks;
}

export function checksumContent(contents: string) {
  return new Bun.CryptoHasher("sha256").update(contents).digest("hex");
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
