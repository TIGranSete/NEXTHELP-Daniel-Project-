export function getApiUrl(path: string): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    // If the frontend is running on gran7help.com (or www.gran7help.com),
    // point API requests to api.gran7help.com
    if (hostname === "gran7help.com" || hostname === "www.gran7help.com") {
      return `https://api.gran7help.com${path}`;
    }
  }
  return path;
}
