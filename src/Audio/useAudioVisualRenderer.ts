import { useCallback, useEffect, useRef, useState } from 'react';

import { MS_PER_SECOND } from './consts.ts';
import type { AudioVisualRenderer, AudioVisualRendererOptions } from './types.ts';

export const useAudioVisualRenderer = ({
  source,
  info,
  screen,
  playing,
  getElapsedMs,
  onReady,
  onVisualError,
  regionRevision = 0,
}: AudioVisualRendererOptions): AudioVisualRenderer => {
  const [ready, setReady] = useState(false);
  const timelineRef = useRef(0);
  const requestRef = useRef<(queue?: boolean) => void>(() => undefined);
  const regionRef = useRef({ source, screen, revision: regionRevision });
  const callbacksRef = useRef({ getElapsedMs, onReady, onVisualError });
  callbacksRef.current = { getElapsedMs, onReady, onVisualError };

  useEffect(() => {
    timelineRef.current += 1;
    const timeline = timelineRef.current;
    let inFlight = false;
    let repaintPending = false;
    let stopped = false;
    let sourceReady = false;
    setReady(false);

    if (source === null || info === null || screen === null) {
      requestRef.current = () => undefined;
      return;
    }

    const requestFrame = (queue = false): void => {
      let frameRequest: Promise<Uint8Array | null>;
      try {
        if (stopped || !screen.isWritable()) {
          return;
        }
        if (inFlight) {
          repaintPending ||= queue;
          return;
        }
        inFlight = true;
        frameRequest = source.getFrameAt(callbacksRef.current.getElapsedMs());
      } catch (error) {
        stopped = true;
        inFlight = false;
        callbacksRef.current.onVisualError(error);
        return;
      }
      void frameRequest
        .then((frame) => {
          if (stopped || timelineRef.current !== timeline) {
            return;
          }
          if (frame !== null) {
            screen.pushFrame(frame);
          }
          if (frame !== null && !sourceReady && !(source.isBuffering?.() ?? false)) {
            sourceReady = true;
            setReady(true);
            callbacksRef.current.onReady();
          }
        })
        .catch((error: unknown) => {
          if (stopped || timelineRef.current !== timeline) {
            return;
          }
          stopped = true;
          callbacksRef.current.onVisualError(error);
        })
        .finally(() => {
          inFlight = false;
          if (repaintPending) {
            repaintPending = false;
            requestFrame();
          }
        });
    };
    requestRef.current = requestFrame;
    requestFrame();

    return () => {
      stopped = true;
      if (requestRef.current === requestFrame) {
        requestRef.current = () => undefined;
      }
    };
  }, [info, screen, source]);

  useEffect(() => {
    if ((!playing && ready) || info === null) {
      return;
    }
    const interval = setInterval(() => requestRef.current(), Math.round(MS_PER_SECOND / info.fps));
    return () => clearInterval(interval);
  }, [info, playing, ready]);

  useEffect(() => {
    const previous = regionRef.current;
    regionRef.current = { source, screen, revision: regionRevision };
    if (
      previous.source === source &&
      previous.screen === screen &&
      previous.revision !== regionRevision
    ) {
      requestRef.current(true);
    }
  }, [regionRevision, screen, source]);

  const repaint = useCallback((): void => requestRef.current(true), []);

  return { ready, repaint };
};
