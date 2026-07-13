import type { ReactElement } from 'react';
import { forwardRef } from 'react';

import { normalizeAudioVisual } from '../audioVisual/index.ts';
import { AudioPlayerView } from './AudioPlayerView.tsx';
import {
  CONTROLS_ROWS,
  DEFAULT_VISUAL_HEIGHT,
  DEFAULT_VISUAL_WIDTH,
} from './consts.ts';
import type { AudioProps, AudioRef } from './types.ts';
import { useManagedResources } from './useManagedResources.ts';
import { useManagedVisualResources } from './useManagedVisualResources.ts';

export * from './consts.ts';
export * from './types.ts';
export { AudioPlayerView } from './AudioPlayerView.tsx';
export { useAudioPlaybackClock } from './useAudioPlaybackClock.ts';
export { useManagedResources } from './useManagedResources.ts';

export const Audio = forwardRef<AudioRef, AudioProps>((props, ref): ReactElement | null => {
  const {
    autoPlay = false,
    loop = false,
    muted = false,
    controls = true,
    keyboard = false,
    children,
    onTimeUpdate,
    onLoadedMetadata,
    onPlay,
    onPause,
    onEnded,
    onError,
  } = props;
  const visualMode = normalizeAudioVisual(props.visual ?? false);
  const visualEnabled = visualMode !== 'none';
  const width = props.width ?? (visualEnabled ? DEFAULT_VISUAL_WIDTH : undefined);
  const height = props.height ?? (visualEnabled ? DEFAULT_VISUAL_HEIGHT : CONTROLS_ROWS);
  const visualHeight = Math.max(0, height - (controls ? CONTROLS_ROWS : 0));
  const managed = useManagedResources({ src: props.src, onError });
  const visual = useManagedVisualResources({
    enabled: visualEnabled && visualHeight > 0,
    src: props.src,
    probe: managed.probe,
    mode: visualMode,
    width: width ?? DEFAULT_VISUAL_WIDTH,
    height: visualHeight,
  });

  return (
    <AudioPlayerView
      ref={ref}
      audio={managed.audio}
      durationMs={managed.durationMs}
      resourceStatus={managed.status}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      controls={controls}
      keyboard={keyboard}
      width={width}
      height={height}
      visualStatus={visualEnabled && visualHeight > 0 ? visual.status : 'none'}
      visualSource={visualEnabled && visualHeight > 0 ? visual.source : null}
      visualInfo={visualEnabled && visualHeight > 0 ? visual.info : null}
      visualScreen={visualEnabled && visualHeight > 0 ? visual.screen : null}
      visualRows={visualEnabled && visualHeight > 0 ? visual.placeholderRows : []}
      visualLabel={visualEnabled && visualHeight > 0 ? visual.label : null}
      onVisualError={visual.degradeToPlaceholder}
      onLoadedMetadata={onLoadedMetadata}
      onQuit={() => {
        void managed.audio?.close().catch(() => undefined);
      }}
      onTimeUpdate={onTimeUpdate}
      onPlay={onPlay}
      onPause={onPause}
      onEnded={onEnded}
      onError={onError}
    >
      {children}
    </AudioPlayerView>
  );
});

Audio.displayName = 'Audio';
