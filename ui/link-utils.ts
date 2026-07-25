export type LinkPart = {
  text: string;
  url?: string;
};

const urlPattern = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const trailingPunctuationPattern = /[),.;:!?]+$/;

export function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function splitLinkText(value: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(urlPattern)) {
    const rawMatch = match[0];
    const start = match.index ?? 0;
    const stripped = rawMatch.replace(trailingPunctuationPattern, "");
    const trailing = rawMatch.slice(stripped.length);
    const url = normalizeUrl(stripped);

    if (start > lastIndex) {
      parts.push({ text: value.slice(lastIndex, start) });
    }

    if (url) {
      parts.push({ text: stripped, url });
    } else {
      parts.push({ text: stripped });
    }

    if (trailing) {
      parts.push({ text: trailing });
    }

    lastIndex = start + rawMatch.length;
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex) });
  }

  return parts.length ? parts : [{ text: value }];
}

export function visibleLinkParts(value: string, hiddenUrl?: string) {
  const normalizedHiddenUrl = hiddenUrl ? normalizeUrl(hiddenUrl) : "";
  if (!normalizedHiddenUrl) return splitLinkText(value);

  let hidden = false;
  return splitLinkText(value).filter((part) => {
    if (!hidden && part.url === normalizedHiddenUrl) {
      hidden = true;
      return false;
    }
    return true;
  });
}

export function hasVisibleLinkText(value: string, hiddenUrl?: string) {
  return visibleLinkParts(value, hiddenUrl).some((part) => /\S/.test(part.text));
}

export function firstUrl(value?: string) {
  if (!value) return "";
  return splitLinkText(value).find((part) => part.url)?.url ?? "";
}
