export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // If in preview/dev container (run.app, localhost, ai.studio, etc.), route relatively to hit this container's Express server
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('localhost') ||
     window.location.hostname.includes('run.app') ||
     window.location.hostname.includes('127.0.0.1') ||
     window.location.hostname.includes('aistudio'))
  ) {
    return cleanPath;
  }

  return `https://api.gran7help.com${cleanPath}`;
}

