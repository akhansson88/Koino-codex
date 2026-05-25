const privateHostnamePattern =
  /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2\d|3[0-1])\.)|(^0\.)|(^169\.254\.)|(^::1$)/i;

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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function tagAttributes(tag) {
  const attributes = {};
  const attrPattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const match of tag.matchAll(attrPattern)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] || match[3] || match[4] || "");
  }
  return attributes;
}

function metaContent(html, keys) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const attributes = tagAttributes(match[0]);
    const key = (attributes.property || attributes.name || attributes.itemprop || "").toLowerCase();
    if (keySet.has(key) && attributes.content) return attributes.content;
  }
  return "";
}

function linkHref(html, rels) {
  const linkTags = [...html.matchAll(/<link\s+[^>]*>/gi)].map((match) => tagAttributes(match[0]));
  for (const rel of rels) {
    const targetRel = rel.toLowerCase();
    const match = linkTags.find((attributes) => (attributes.rel || "").toLowerCase().split(/\s+/).includes(targetRel) && attributes.href);
    if (match?.href) return match.href;
  }
  return "";
}

function legacyMetaContent(html, keys) {
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const propertyFirst = new RegExp(`<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`, "i");
    const match = html.match(propertyFirst) || html.match(contentFirst);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (!hostname.endsWith("youtube.com")) return "";
    const watchId = url.searchParams.get("v");
    if (watchId) return watchId;
    const [kind, id] = url.pathname.split("/").filter(Boolean);
    return ["embed", "shorts", "live"].includes(kind) ? id || "" : "";
  } catch {
    return "";
  }
}

function fallbackImageForUrl(value) {
  const youtubeId = youtubeVideoId(value);
  if (youtubeId) return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function previewWithFallback(data, url) {
  const fallbackImage = fallbackImageForUrl(url);
  if (data) {
    const youtubeId = youtubeVideoId(url);
    return {
      ...data,
      image: data.image || fallbackImage,
      type: data.type || (youtubeId ? "video" : "website"),
      siteName: data.siteName || (youtubeId ? "YouTube" : undefined),
    };
  }
  if (!fallbackImage) return null;
  const youtubeId = youtubeVideoId(url);
  return {
    url,
    image: fallbackImage,
    siteName: youtubeId ? "YouTube" : undefined,
    type: youtubeId ? "video" : "website",
  };
}

async function oEmbedPreview(url) {
  const youtubeId = youtubeVideoId(url);
  if (!youtubeId) return null;

  const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;

  const data = await response.json();
  return {
    url,
    title: data.title || "",
    description: data.author_name || "",
    image: data.thumbnail_url || fallbackImageForUrl(url),
    siteName: data.provider_name || "YouTube",
    type: data.type || "video",
  };
}

function absoluteUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function parsePreviewHtml(html, url) {
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const title = metaContent(html, ["og:title", "twitter:title"]) || (titleTag ? decodeHtml(titleTag) : "");
  const description = metaContent(html, ["og:description", "twitter:description", "description"]);
  const image = absoluteUrl(
    metaContent(html, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src", "thumbnail", "thumbnailUrl"]) ||
      legacyMetaContent(html, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src", "thumbnail", "thumbnailUrl"]) ||
      linkHref(html, ["image_src", "apple-touch-icon", "icon"]),
    url,
  );
  const siteName = metaContent(html, ["og:site_name", "application-name"]);
  const type = metaContent(html, ["og:type", "twitter:card"]);

  if (!title && !description && !image) return null;
  return { url, title, description, image, siteName, type };
}

export default async function linkPreview(request) {
  try {
    const requestUrl = new URL(request.url);
    const rawUrl = requestUrl.searchParams.get("url") || "";
    const url = new URL(rawUrl);

    if (!["http:", "https:"].includes(url.protocol) || privateHostnamePattern.test(url.hostname)) {
      return jsonResponse({ error: "Unsupported URL" }, 400);
    }

    const embeddedPreview = await oEmbedPreview(url.toString()).catch(() => null);
    if (embeddedPreview) return jsonResponse(embeddedPreview);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "KoinoLinkPreview/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return jsonResponse({ error: "Preview fetch failed" }, 502);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return jsonResponse({ error: "Unsupported content type" }, 415);
    }

    const html = (await response.text()).slice(0, 180000);
    return jsonResponse(previewWithFallback(parsePreviewHtml(html, url.toString()), url.toString()));
  } catch {
    return jsonResponse({ error: "Invalid URL" }, 400);
  }
}
