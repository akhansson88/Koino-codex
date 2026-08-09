const corsHeaders = {
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
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
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseVoteCount(value) {
  const match = value.match(/([\d,]+)\s+helpful\s+votes?/i);
  if (!match) return 0;
  return Number(match[1].replace(/,/g, "")) || 0;
}

function parseReferences(html) {
  const references = [];
  const seen = new Set();
  const headingPattern = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const referencePattern = /<a\b[^>]*class="[^"]*\bbibleref\b[^"]*"[^>]*>([^<]+)<\/a>/i;

  for (const headingMatch of html.matchAll(headingPattern)) {
    const heading = headingMatch[1];
    const referenceMatch = heading.match(referencePattern);
    if (!referenceMatch) continue;

    const reference = decodeHtml(referenceMatch[1]);
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    const voteIdMatch = heading.match(/\bid=["']vote_u_([0-9]+(?:-[0-9]+)?)["']/i);
    references.push({
      reference,
      votes: parseVoteCount(decodeHtml(heading.replace(/<[^>]+>/g, " "))),
      ...(voteIdMatch ? { voteId: voteIdMatch[1] } : {}),
    });
  }

  return references.sort((a, b) => b.votes - a.votes || a.reference.localeCompare(b.reference));
}

async function fetchWithTimeout(url, init, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function submitVote(request) {
  const body = await request.json().catch(() => ({}));
  const slug = topicSlug(typeof body.topic === "string" ? body.topic : "");
  const voteId = typeof body.voteId === "string" ? body.voteId.trim() : "";
  const value = body.value === -1 ? -1 : body.value === 1 ? 1 : 0;

  if (!slug || slug.length > 120 || !/^\d+(?:-\d+)?$/.test(voteId) || !value) {
    return jsonResponse({ error: "Invalid vote" }, 400);
  }

  const sourceUrl = `https://www.openbible.info/topics/${encodeURIComponent(slug)}`;
  const voteButtonId = `vote_${value === 1 ? "u" : "d"}_${voteId}`;
  const topicResponse = await fetchWithTimeout(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Cache-Control": "no-cache",
      "User-Agent": "KoinoTopicBible/2.0",
    },
    redirect: "follow",
  });
  if (!topicResponse.ok) return jsonResponse({ error: "OpenBible topic validation failed" }, 502);
  const topicHtml = (await topicResponse.text()).slice(0, 400000);
  const upVotePattern = new RegExp(`\\bid=["']vote_u_${voteId}["']`, "i");
  const downVotePattern = new RegExp(`\\bid=["']vote_d_${voteId}["']`, "i");
  if (!upVotePattern.test(topicHtml) || !downVotePattern.test(topicHtml)) {
    return jsonResponse({ error: "Passage is not available for voting" }, 400);
  }
  const databaseCode = topicHtml.match(/\bid=["']db["'][^>]*\bvalue=["']([^"']+)["']/i)?.[1] || "dy";
  const voteUrl = `https://www.openbible.info/topics/tools/vote?w=${encodeURIComponent(slug)}`;
  const response = await fetchWithTimeout(voteUrl, {
    body: new URLSearchParams({ db: databaseCode, id: voteButtonId, word: slug }).toString(),
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://www.openbible.info",
      Referer: sourceUrl,
      "User-Agent": "KoinoTopicBible/2.0",
    },
    method: "POST",
    redirect: "follow",
  });

  if (!response.ok) return jsonResponse({ error: "OpenBible vote failed" }, 502);
  return jsonResponse({ ok: true, sourceUrl });
}

export default async function bibleTopic(request) {
  try {
    if (request.method === "OPTIONS") {
      return optionsResponse();
    }

    if (request.method === "POST") {
      return await submitVote(request);
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const requestUrl = new URL(request.url);
    const rawTopic = requestUrl.searchParams.get("topic") || "";
    const slug = topicSlug(rawTopic);

    if (!slug || slug.length > 120) {
      return jsonResponse({ error: "Missing topic" }, 400);
    }

    const sourceUrl = `https://www.openbible.info/topics/${encodeURIComponent(slug)}`;
    const response = await fetchWithTimeout(sourceUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Cache-Control": "no-cache",
        "User-Agent": "KoinoTopicBible/2.0",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return jsonResponse({ error: "Topic fetch failed" }, 502);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return jsonResponse({ error: "Unsupported topic response" }, 502);
    }

    const references = parseReferences((await response.text()).slice(0, 400000));
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
