# Third-party notices — VIO 2

VIO integrates existing projects as packages or independent services. Their names/trademarks belong to their owners; VIO is not an official Video.js, Jellyfin, aria2, YTS or Apple product. No claim of affiliation is made.

| Component | How used | License / repository |
|---|---|---|
| `@videojs/react`, `@videojs/core`, `@videojs/media`, icons and HLS adapter, 10.0.1 | Actual player dependency and bundled frontend code | Apache-2.0; [videojs/video.js](https://github.com/videojs/video.js) |
| hls.js | Adaptive playback engine, loaded lazily | Apache-2.0; [video-dev/hls.js](https://github.com/video-dev/hls.js) |
| Jellyfin server | Optional independent container/server, accessed through REST | GPL-2.0; [jellyfin/jellyfin](https://github.com/jellyfin/jellyfin) |
| aria2 daemon | Independent download service, accessed through private JSON-RPC | GPL-2.0; [aria2/aria2](https://github.com/aria2/aria2) |
| Caddy | Optional independent HTTPS reverse proxy | Apache-2.0; [caddyserver/caddy](https://github.com/caddyserver/caddy) |
| better-sqlite3 | Persistent account/session/watchlist/progress/job storage | MIT; [WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| React / React DOM | Frontend | MIT |
| Express | Backend | MIT |
| Motion | Animation | MIT |
| Lucide | Interface icons | ISC |
| Vazirmatn | Bundled Persian fonts | SIL Open Font License 1.1; actual OFL retained |
| Sintel official trailer / poster | Licensed playback/download demonstration | © Blender Foundation, CC BY 3.0; see ASSET-CREDITS.md |
| Film posters / cinematic backdrops | Design-only prototype artwork | Original owners retain rights; not covered by VIO's source license |

The Video.js copyright/trademark notice, full Apache-2.0 text, aria2 and Jellyfin GPL texts, better-sqlite3 MIT license, hls.js notice and font OFL are retained under `licenses/`. Node package distributions retain their own license files in `node_modules` after installation. GPL services are not linked into the browser/player bundle; Dockerfiles install/download those services separately. If distributing their binaries or modified images, follow the respective source-distribution obligations and notices.

No Jellyfin SDK, WebTorrent library, Vidstack or Plyr package was copied or installed. The Jellyfin REST adapter, queue ownership, accounts and VIO interface are original application code. The Movie placeholder SVG and informational (non-dialogue) VTT captions are original VIO assets.
