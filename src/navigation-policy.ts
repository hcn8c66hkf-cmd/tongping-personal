export function assertModelNavigationUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Model navigation requires an absolute HTTP or HTTPS URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Model navigation is limited to HTTP and HTTPS pages.");
  }
  return url;
}

export function assertModelReadablePageUrl(currentUrl: string): void {
  // Chromium's initial empty tab is safe; a model-supplied about: URL is not.
  if (currentUrl === "about:blank") return;
  if (currentUrl.startsWith("chrome-error:")) {
    // Tell the model how to recover instead of implying it misused a tool.
    throw new Error(
      "The page failed to load (the last navigation did not finish). Call browser_open with an http(s) URL to try again.",
    );
  }
  assertModelNavigationUrl(currentUrl);
}
