import { useEffect, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Image, Platform, Pressable, Text, View } from "react-native";

import { firstUrl } from "@/ui/link-utils";
import { useOpenExternalLink } from "@/ui/in-app-browser";
import { colors, radius } from "@/ui/theme";

type LinkPreviewData = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
};

const previewCache = new Map<string, LinkPreviewData | null>();

function youtubeVideoId(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!hostname.endsWith("youtube.com")) return "";
    const watchId = url.searchParams.get("v");
    if (watchId) return watchId;
    const [kind, id] = url.pathname.split("/").filter(Boolean);
    return ["embed", "shorts", "live"].includes(kind) ? id ?? "" : "";
  } catch {
    return "";
  }
}

function fallbackImageForUrl(value: string) {
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

function displayImageUrl(value: string, direct: boolean) {
  if (!value || direct || Platform.OS !== "web") return value;
  if (/^(data|blob):/i.test(value)) return value;
  return `/.netlify/functions/link-preview-image?url=${encodeURIComponent(value)}`;
}

function previewWithFallback(data: LinkPreviewData | null, url: string): LinkPreviewData | null {
  const fallbackImage = fallbackImageForUrl(url);
  if (data) {
    const videoId = youtubeVideoId(url);
    return {
      ...data,
      image: data.image || fallbackImage,
      type: data.type || (videoId ? "video" : "website"),
      siteName: data.siteName || (videoId ? "YouTube" : undefined),
    };
  }
  if (!fallbackImage) return null;
  const videoId = youtubeVideoId(url);
  return {
    url,
    image: fallbackImage,
    siteName: videoId ? "YouTube" : undefined,
    type: videoId ? "video" : "website",
  };
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function tagAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const attrPattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const match of tag.matchAll(attrPattern)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function metaContent(html: string, keys: string[]) {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const attributes = tagAttributes(match[0]);
    const key = (attributes.property || attributes.name || attributes.itemprop || "").toLowerCase();
    if (keySet.has(key) && attributes.content) return attributes.content;
  }
  return "";
}

function linkHref(html: string, rels: string[]) {
  const linkTags = [...html.matchAll(/<link\s+[^>]*>/gi)].map((match) => tagAttributes(match[0]));
  for (const rel of rels) {
    const targetRel = rel.toLowerCase();
    const match = linkTags.find((attributes) => (attributes.rel || "").toLowerCase().split(/\s+/).includes(targetRel) && attributes.href);
    if (match?.href) return match.href;
  }
  return "";
}

function legacyMetaContent(html: string, keys: string[]) {
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const propertyFirst = new RegExp(`<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`, "i");
    const match = html.match(propertyFirst) ?? html.match(contentFirst);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function absoluteUrl(value: string, baseUrl: string) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function parsePreviewHtml(html: string, url: string): LinkPreviewData | null {
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

  return {
    url,
    title,
    description,
    image,
    siteName,
    type,
  };
}

async function fetchPreview(url: string, signal: AbortSignal) {
  const endpoint = Platform.OS === "web" ? `/.netlify/functions/link-preview?url=${encodeURIComponent(url)}` : url;
  const response = await fetch(endpoint, {
    headers: Platform.OS === "web" ? undefined : { Accept: "text/html,application/xhtml+xml" },
    signal,
  });
  if (!response.ok) throw new Error(`Preview request failed with ${response.status}`);

  if (Platform.OS === "web") {
    const data = (await response.json()) as LinkPreviewData | null;
    return previewWithFallback(data?.url ? data : null, url);
  }

  const html = await response.text();
  return previewWithFallback(parsePreviewHtml(html.slice(0, 180000), url), url);
}

function isVideoPreview(preview: LinkPreviewData) {
  const haystack = `${preview.type ?? ""} ${preview.url}`.toLowerCase();
  return haystack.includes("video") || haystack.includes("youtube.com") || haystack.includes("youtu.be") || haystack.includes("vimeo.com");
}

export function LinkPreview({ text }: { text?: string }) {
  const openExternalLink = useOpenExternalLink();
  const url = useMemo(() => firstUrl(text), [text]);
  const [preview, setPreview] = useState<LinkPreviewData | null>();
  const [imageFailed, setImageFailed] = useState(false);
  const [directImage, setDirectImage] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setDirectImage(false);
    if (!url) {
      setPreview(null);
      return;
    }

    if (previewCache.has(url)) {
      setPreview(previewCache.get(url));
      return;
    }

    const controller = new AbortController();
    setPreview(undefined);

    fetchPreview(url, controller.signal)
      .then((data) => {
        previewCache.set(url, data);
        setPreview(data);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        const fallback = previewWithFallback(null, url);
        previewCache.set(url, fallback);
        setPreview(fallback);
      });

    return () => controller.abort();
  }, [url]);

  if (!url || preview === null) return null;

  const host = (() => {
    try {
      return new URL(preview?.url ?? url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const video = preview ? isVideoPreview(preview) : false;
  const imageUri = preview?.image && !imageFailed ? displayImageUrl(preview.image, directImage) : "";

  return (
    <Pressable
      accessibilityRole="link"
      onPress={(event) => {
        event.stopPropagation();
        openExternalLink(preview?.url ?? url);
      }}
      style={{
        backgroundColor: colors.input,
        borderColor: colors.line,
        borderRadius: radius.lg,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 82,
        overflow: "hidden",
      }}
    >
      {imageUri ? (
        <View style={{ backgroundColor: colors.line, height: 96, position: "relative", width: 116 }}>
          <Image
            accessibilityIgnoresInvertColors
            onError={() => {
              if (Platform.OS === "web" && !directImage) {
                setDirectImage(true);
                return;
              }
              setImageFailed(true);
            }}
            resizeMode="cover"
            source={{ uri: imageUri }}
            style={{ height: "100%", width: "100%" }}
          />
          {video ? (
            <View
              style={{
                alignItems: "center",
                backgroundColor: "rgba(11, 18, 32, 0.38)",
                borderRadius: 999,
                height: 38,
                justifyContent: "center",
                left: 39,
                position: "absolute",
                top: 29,
                width: 38,
              }}
            >
              <Feather name="play" size={18} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ alignItems: "center", backgroundColor: colors.accentSubtle, justifyContent: "center", width: 72 }}>
          <Feather name={video ? "play-circle" : "link"} size={24} color={colors.olive} />
        </View>
      )}
      <View style={{ flex: 1, gap: 4, justifyContent: "center", paddingVertical: 10, paddingRight: 12 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 5 }}>
          <Feather name={video ? "play-circle" : "globe"} size={12} color={colors.gold} />
          <Text numberOfLines={1} style={{ color: colors.gold, flex: 1, fontSize: 11, fontWeight: "900", textTransform: "uppercase" }}>
            {preview?.siteName || host || "Link"}
          </Text>
        </View>
        <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 14, fontWeight: "900", lineHeight: 19 }}>
          {preview?.title || host || url}
        </Text>
        {preview?.description ? (
          <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12, fontWeight: "600", lineHeight: 16 }}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
