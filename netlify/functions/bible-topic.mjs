function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": status === 200 ? "public, max-age=3600" : "no-store",
      "Content-Type": "application/json",
    },
  });
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function topicSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseReferences(html) {
  const references = [];
  const seen = new Set();
  const headingPattern = /<h3[^>]*>\s*<a\b[^>]*>([^<]+)<\/a>/gi;

  for (const match of html.matchAll(headingPattern)) {
    const reference = decodeHtml(match[1]);
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    references.push(reference);
  }

  return references;
}

export default async function bibleTopic(request) {
  try {
    const requestUrl = new URL(request.url);
    const rawTopic = requestUrl.searchParams.get("topic") || "";
    const slug = topicSlug(rawTopic);

    if (!slug) {
      return jsonResponse({ error: "Missing topic" }, 400);
    }

    const sourceUrl = `https://www.openbible.info/topics/${encodeURIComponent(slug)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "KoinoTopicLookup/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return jsonResponse({ error: "Topic fetch failed" }, 502);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return jsonResponse({ error: "Unsupported topic response" }, 502);
    }

    const references = parseReferences((await response.text()).slice(0, 260000));
    if (references.length === 0) {
      return jsonResponse({ error: "No Bible references found" }, 502);
    }

    return jsonResponse({
      topic: slug.replace(/_/g, " "),
      sourceUrl,
      references,
      count: references.length,
    });
  } catch {
    return jsonResponse({ error: "Topic lookup failed" }, 502);
  }
}
