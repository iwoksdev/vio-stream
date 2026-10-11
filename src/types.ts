export type Torrent = {
  url: string;
  hash: string;
  quality: string;
  type: string;
  size: string;
  seeds: number;
  video_codec?: string;
  audio_channels?: string;
};
export type Movie = {
  id: number;
  imdb_code: string;
  title: string;
  title_fa?: string;
  year: number;
  rating: number;
  runtime: number;
  genres: string[];
  summary?: string;
  description_full?: string;
  description_fa?: string;
  director?: string;
  tagline?: string;
  poster?: string;
  backdrop?: string;
  large_cover_image?: string;
  medium_cover_image?: string;
  background_image?: string;
  yt_trailer_code?: string;
  torrents?: Torrent[];
  source?: string;
  libraryId?: string;
  downloadGid?: string;
  mediaQuality?: string;
  kind?: "movie" | "episode";
  seriesName?: string;
  cast?: { name: string; character_name: string; url_small_image?: string }[];
};
export type StreamSource = {
  url: string;
  label: string;
  type?: "mp4" | "hls";
  license?: string;
  textTracks?: {
    url: string;
    language: string;
    label: string;
    default?: boolean;
  }[];
};
export type PlayerState = {
  movie: Movie;
  mode: "trailer" | "stream";
  source?: StreamSource;
};
export type FilterState = { quality: string; rating: number; year: string };
export type Progress = { time: number; duration: number; updatedAt: number };
export type Page =
  | "home"
  | "explore"
  | "collections"
  | "watchlist"
  | "library"
  | "downloads";

export type AccountUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: number;
};
export type ServiceHealth = {
  configured: boolean;
  available: boolean;
  message: string;
  version?: string;
  name?: string;
};
export type PlatformStatus = {
  version: string;
  mode?: string;
  player: { name: string; version: string; available: boolean };
  accounts: { available: boolean; storage: string; registration: boolean };
  downloads: ServiceHealth;
  library: ServiceHealth;
};
export type DownloadJob = {
  gid: string;
  title: string;
  movie: Movie | null;
  status: string;
  total: number;
  completed: number;
  progress: number;
  speed: number;
  uploadSpeed: number;
  peers: number;
  error: string;
  filename: string;
  createdAt: number;
  playable: boolean;
};
export type DownloadDraft = { url: string; title: string; movie?: Movie };
