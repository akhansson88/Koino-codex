const privateHostnamePattern =
  /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2\d|3[0-1])\.)|(^0\.)|(^169\.254\.)|(^::1$)/i;

export default async function linkPreviewImage(request) {
  try {
    const requestUrl = new URL(request.url);
    const rawUrl = requestUrl.searchParams.get("url") || "";
    const url = new URL(rawUrl);

    if (!["http:", "https:"].includes(url.protocol) || privateHostnamePattern.test(url.hostname)) {
      return new Response("Unsupported image URL", { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "KoinoLinkPreview/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return new Response("Preview image fetch failed", { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new Response("Unsupported image type", { status: 415 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
        "Content-Type": contentType,
      },
    });
  } catch {
    return new Response("Invalid image URL", { status: 400 });
  }
}
