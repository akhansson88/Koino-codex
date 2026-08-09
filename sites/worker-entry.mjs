import bibleTopic from "./functions/bible-topic.mjs";
import linkPreview from "./functions/link-preview.mjs";

const htmlRequest = (request, pathname) => {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.headers.get("accept")?.includes("text/html")) return true;
  return !pathname.split("/").at(-1)?.includes(".");
};

function indexRequest(request) {
  const indexUrl = new URL("/index.html", request.url);
  return new Request(indexUrl, {
    headers: request.headers,
    method: request.method === "HEAD" ? "HEAD" : "GET",
  });
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);

    if (url.pathname === "/api/bible-topic" || url.pathname === "/.netlify/functions/bible-topic") {
      return bibleTopic(request);
    }
    if (url.pathname === "/api/link-preview" || url.pathname === "/.netlify/functions/link-preview") {
      return linkPreview(request);
    }

    if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("Static asset service unavailable", { status: 503 });
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || !htmlRequest(request, url.pathname)) return asset;
    return env.ASSETS.fetch(indexRequest(request));
  },
};
