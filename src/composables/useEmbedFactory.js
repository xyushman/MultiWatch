/**
 * useEmbedFactory
 * Detects video platform from a URL and produces embed metadata.
 * Adding a new platform = adding one entry to PARSERS.
 */

const DOMAIN = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

// ─── Helpers ────────────────────────────────────────────────────────────────

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isHost(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isYouTubeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(id);
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    // Standard: youtube.com/watch?v=ID
    if (u.searchParams.has('v')) {
      const id = u.searchParams.get('v');
      if (isYouTubeId(id)) return id;
    }
    // Short: youtu.be/ID
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      if (isYouTubeId(id)) return id;
    }
    // Embed: youtube.com/embed/ID or youtube-nocookie.com/embed/ID
    if (u.pathname.startsWith('/embed/')) {
      const id = u.pathname.split('/embed/')[1].split('/')[0];
      if (isYouTubeId(id)) return id;
    }
    // Live: youtube.com/live/ID
    if (u.pathname.startsWith('/live/')) {
      const id = u.pathname.split('/live/')[1].split('/')[0];
      if (isYouTubeId(id)) return id;
    }
    // Shorts: youtube.com/shorts/ID
    if (u.pathname.startsWith('/shorts/')) {
      const id = u.pathname.split('/shorts/')[1].split('/')[0];
      if (isYouTubeId(id)) return id;
    }
    // Legacy: youtube.com/v/ID
    if (u.pathname.startsWith('/v/')) {
      const id = u.pathname.split('/v/')[1].split('/')[0];
      if (isYouTubeId(id)) return id;
    }
  } catch {
    // fallback for malformed URLs
    const vParam = url.match(/[?&]v=([^&]+)/);
    if (vParam && isYouTubeId(vParam[1])) return vParam[1];
    const shortUrl = url.match(/youtu\.be\/([^/?&]+)/);
    if (shortUrl && isYouTubeId(shortUrl[1])) return shortUrl[1];
  }
  return null;
}

function extractTwitchInfo(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // VOD: twitch.tv/videos/ID
    if (parts[0] === 'videos' && parts[1]) {
      return { subtype: 'vod', id: parts[1] };
    }
    // Clip: twitch.tv/clip/SLUG or twitch.tv/CHANNEL/clip/SLUG
    if (parts[parts.length - 2] === 'clip') {
      return { subtype: 'clip', id: parts[parts.length - 1] };
    }
    // Channel: twitch.tv/CHANNEL. Reserved site pages are not channels and
    // would otherwise embed a player for a non-existent name.
    const reserved = ['directory', 'search', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops', 'friends', 'downloads', 'turbo'];
    if (parts[0] && !reserved.includes(parts[0].toLowerCase()) && parts[0] !== 'videos') {
      return { subtype: 'channel', id: parts[0] };
    }
  } catch { /* fall through */ }
  return null;
}

function extractKickSlug(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // kick.com/video/ID, kick.com/category/... and the like are not channels.
    // VODs are not supported by the public channel embed, so reject them
    // instead of embedding a channel literally named "video".
    const reserved = ['video', 'category', 'categories', 'browse', 'following', 'search', 'dashboard', 'settings'];
    if (parts[0] && !reserved.includes(parts[0].toLowerCase())) return parts[0];
  } catch { /* fall through */ }
  return null;
}

// ─── Parser Registry ─────────────────────────────────────────────────────────

const PARSERS = [
  {
    name: 'youtube',
    label: 'YouTube',
    color: '#ff0000',
    test: (url) => {
      const host = hostOf(url);
      return host === 'youtu.be'
        || isHost(host, 'youtube.com')
        || isHost(host, 'youtube-nocookie.com');
    },
    parse(url) {
      const id = extractYouTubeId(url);
      return id ? { type: 'youtube', sourceId: id } : null;
    },
    buildEmbed(sourceId) {
      // loop=1 needs playlist=<id> on the YouTube embed API for a single video.
      // enablejsapi lets the panel mute/unmute without reloading the player.
      const origin = ORIGIN && ORIGIN !== 'null'
        ? `&origin=${encodeURIComponent(ORIGIN)}`
        : '';
      return `https://www.youtube.com/embed/${sourceId}?autoplay=1&mute=1&rel=0&playsinline=1&loop=1&playlist=${sourceId}&enablejsapi=1${origin}`;
    },
    buildTitle(sourceId) {
      return `YouTube video ${sourceId}`;
    },
  },
  {
    name: 'twitch',
    label: 'Twitch',
    color: '#9146ff',
    test: (url) => isHost(hostOf(url), 'twitch.tv'),
    parse(url) {
      const info = extractTwitchInfo(url);
      if (!info) return null;
      return { type: 'twitch', sourceId: info.id, subtype: info.subtype };
    },
    buildEmbed(sourceId, meta = {}) {
      const parent = DOMAIN || 'localhost';
      const muted = meta.muted === false ? 'false' : 'true';
      if (meta.subtype === 'vod') {
        return `https://player.twitch.tv/?video=${sourceId}&parent=${parent}&autoplay=true&muted=${muted}`;
      }
      if (meta.subtype === 'clip') {
        return `https://clips.twitch.tv/embed?clip=${sourceId}&parent=${parent}&autoplay=true&muted=${muted}`;
      }
      // channel (default)
      return `https://player.twitch.tv/?channel=${sourceId}&parent=${parent}&autoplay=true&muted=${muted}`;
    },
    buildTitle(sourceId) {
      return `Twitch: ${sourceId}`;
    },
  },
  {
    name: 'kick',
    label: 'Kick',
    color: '#53fc18',
    test: (url) => isHost(hostOf(url), 'kick.com'),
    parse(url) {
      const slug = extractKickSlug(url);
      return slug ? { type: 'kick', sourceId: slug } : null;
    },
    buildEmbed(sourceId, meta = {}) {
      const muted = meta.muted === false ? 'false' : 'true';
      return `https://player.kick.com/${sourceId}?autoplay=true&muted=${muted}`;
    },
    buildTitle(sourceId) {
      return `Kick: ${sourceId}`;
    },
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

export function useEmbedFactory() {
  /**
   * Parse a raw URL into embed metadata.
   * Returns null if no parser matches or parsing fails.
   */
  function parseUrl(rawUrl) {
    const url = rawUrl.trim();
    if (!url) return null;

    for (const parser of PARSERS) {
      if (parser.test(url)) {
        const result = parser.parse(url);
        if (result) {
          return {
            ...result,
            rawUrl: url,
            label: parser.label,
            color: parser.color,
          };
        }
      }
    }
    return null;
  }

  /**
   * Build the iframe src from stored embed data.
   */
  function buildEmbedUrl(video) {
    const parser = PARSERS.find((p) => p.name === video.type);
    if (!parser || !video?.sourceId) return '';
    return parser.buildEmbed(video.sourceId, {
      subtype: video.subtype,
      muted: video.muted !== false,
    });
  }

  /**
   * Get a human-readable title for a video.
   */
  function buildTitle(video) {
    const parser = PARSERS.find((p) => p.name === video.type);
    if (!parser) return video.sourceId;
    return parser.buildTitle(video.sourceId);
  }

  /**
   * Returns the list of supported platform names.
   */
  function getSupportedPlatforms() {
    return PARSERS.map((p) => ({ name: p.name, label: p.label, color: p.color }));
  }

  return { parseUrl, buildEmbedUrl, buildTitle, getSupportedPlatforms };
}
