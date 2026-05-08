export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export async function searchWeb(query: string, limit = 5): Promise<WebSearchResult[]> {
  const [htmlResults, instantResults] = await Promise.all([
    searchDuckDuckGoHtml(query, limit).catch(() => []),
    searchDuckDuckGoInstantAnswer(query, limit).catch(() => []),
  ]);

  return dedupeSearchResults([...htmlResults, ...instantResults]).slice(0, limit);
}

async function searchDuckDuckGoHtml(query: string, limit: number) {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      "user-agent": "CloudWalkAgentSwarmChallenge/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTML search failed with status ${response.status}`);
  }

  const html = await response.text();
  const results: WebSearchResult[] = [];
  const resultPattern =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(resultPattern)) {
    const rawUrl = decodeHtml(match[1] ?? "");
    const title = stripHtml(match[2] ?? "");
    const snippet = stripHtml(match[3] ?? "");
    const normalizedUrl = normalizeDuckDuckGoUrl(rawUrl);

    if (title && normalizedUrl) {
      results.push({
        title,
        url: normalizedUrl,
        snippet,
      });
    }

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

async function searchDuckDuckGoInstantAnswer(query: string, limit: number) {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_redirect", "1");
  url.searchParams.set("no_html", "1");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`DuckDuckGo instant answer failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };
  const results: WebSearchResult[] = [];

  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.Heading || data.AbstractURL,
      url: data.AbstractURL,
      snippet: data.AbstractText,
    });
  }

  for (const topic of data.RelatedTopics ?? []) {
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.split(" - ")[0] ?? topic.FirstURL,
        url: topic.FirstURL,
        snippet: topic.Text,
      });
    }

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

function dedupeSearchResults(results: WebSearchResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    if (seen.has(result.url)) {
      return false;
    }

    seen.add(result.url);
    return true;
  });
}

function normalizeDuckDuckGoUrl(rawUrl: string) {
  if (!rawUrl) {
    return null;
  }

  if (rawUrl.startsWith("//duckduckgo.com/l/?")) {
    const url = new URL(`https:${rawUrl}`);
    return url.searchParams.get("uddg");
  }

  return rawUrl;
}

function stripHtml(value: string) {
  return decodeHtml(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
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
