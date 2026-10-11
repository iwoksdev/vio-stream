import { forwardRef, lazy, Suspense } from "react";
import type { VideoHTMLAttributes } from "react";
import { I18nProvider } from "@videojs/react/i18n";
import "@videojs/react/i18n/locales/fa/register";
import { Video, VideoPlayer, NeutralVideoSkin } from "@videojs/react/video";
const HlsJsVideo = lazy(() =>
  import("@videojs/react/media/hlsjs-video").then((module) => ({
    default: module.HlsJsVideo,
  })),
);
import "@videojs/react/video/neutral-skin.css";
import type { StreamSource } from "./types";

const AdvancedVideo = forwardRef<
  HTMLVideoElement,
  Omit<VideoHTMLAttributes<HTMLVideoElement>, "preload"> & {
    preload?: "auto" | "none" | "metadata";
    source: StreamSource;
  }
>(({ source, children, ...props }, ref) => {
  const hls = source.type === "hls" || /\.m3u8(?:\?|$)/i.test(source.url);
  const tracks = source.textTracks?.map((track) => (
    <track
      key={track.url}
      kind="subtitles"
      src={track.url}
      srcLang={track.language}
      label={track.label}
      default={track.default}
    />
  ));
  return (
    <I18nProvider locale="fa">
      <VideoPlayer poster={props.poster}>
        <NeutralVideoSkin className="vio-video-skin">
          {hls ? (
            <Suspense
              fallback={
                <div className="player-loading" role="status">
                  آماده‌سازی HLS…
                </div>
              }
            >
              <HlsJsVideo
                {...props}
                crossOrigin={
                  source.textTracks?.length ? "anonymous" : undefined
                }
                ref={ref}
                source={{
                  src: source.url,
                  type: "application/vnd.apple.mpegurl",
                }}
              >
                {tracks}
                {children}
              </HlsJsVideo>
            </Suspense>
          ) : (
            <Video
              {...props}
              crossOrigin={source.textTracks?.length ? "anonymous" : undefined}
              ref={ref}
              src={source.url}
            >
              {tracks}
              {children}
            </Video>
          )}
        </NeutralVideoSkin>
      </VideoPlayer>
    </I18nProvider>
  );
});
AdvancedVideo.displayName = "AdvancedVideo";
export default AdvancedVideo;
