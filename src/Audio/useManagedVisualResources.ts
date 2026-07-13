import { useCallback, useEffect, useRef, useState } from 'react';

import { openAudioVisual, resolveAudioPlaceholderLabel } from '../audioVisual/index.ts';
import type { FrameSource } from '../frameSource/index.ts';
import { computeEmbeddedRegion } from '../playerLayout/index.ts';
import { canDisplayVideo, createManagedScreen } from '../Video/managedScreen.ts';
import type { PlayerScreen } from '../Video/index.tsx';
import { INITIAL_MANAGED_AUDIO_VISUAL_RESOURCES } from './consts.ts';
import type {
  ManagedAudioVisualResources,
  ManagedAudioVisualResourcesOptions,
} from './types.ts';

interface OwnedVisualResources {
  source: FrameSource;
  screen: PlayerScreen | null;
  released: boolean;
}

const releaseVisualResources = (owned: OwnedVisualResources): void => {
  if (owned.released) {
    return;
  }
  owned.released = true;
  try {
    owned.screen?.dispose();
  } catch {
    // Continue releasing the source when screen disposal fails.
  }
  void Promise.resolve()
    .then(() => owned.source.close())
    .catch(() => undefined);
};

export const useManagedVisualResources = ({
  enabled,
  src,
  probe,
  mode,
  width,
  height,
}: ManagedAudioVisualResourcesOptions): ManagedAudioVisualResources => {
  const [resources, setResources] = useState<ManagedAudioVisualResources>(
    INITIAL_MANAGED_AUDIO_VISUAL_RESOURCES,
  );
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const ownedRef = useRef<OwnedVisualResources | null>(null);
  const labelRef = useRef<string | null>(null);

  const degradeToPlaceholder = useCallback((): void => {
    const owned = ownedRef.current;
    if (owned !== null) {
      releaseVisualResources(owned);
      ownedRef.current = null;
    }
    setResources({
      status: 'placeholder',
      label: labelRef.current,
      source: null,
      info: null,
      screen: null,
      placeholderRows: [],
      regionRevision: 0,
      degradeToPlaceholder,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let owned: OwnedVisualResources | null = null;

    if (!enabled || mode === 'none') {
      labelRef.current = null;
      setResources({
        status: 'none',
        label: null,
        source: null,
        info: null,
        screen: null,
        placeholderRows: [],
        regionRevision: 0,
        degradeToPlaceholder,
      });
      return;
    }
    if (probe === null) {
      setResources({ ...INITIAL_MANAGED_AUDIO_VISUAL_RESOURCES, degradeToPlaceholder });
      return;
    }

    const fallbackLabel = resolveAudioPlaceholderLabel(src, probe.title);
    labelRef.current = fallbackLabel;
    setResources({ ...INITIAL_MANAGED_AUDIO_VISUAL_RESOURCES, degradeToPlaceholder });
    let selectedLabel = fallbackLabel;
    void Promise.resolve()
      .then(() => openAudioVisual({ filePath: src, probe, mode }))
      .then((selection) => {
        if (cancelled) {
          if (selection.kind === 'source') {
            void Promise.resolve()
              .then(() => selection.source.close())
              .catch(() => undefined);
          }
          return;
        }
        if (selection.kind === 'none') {
          labelRef.current = null;
          setResources({
            status: 'none',
            label: null,
            source: null,
            info: null,
            screen: null,
            placeholderRows: [],
            regionRevision: 0,
            degradeToPlaceholder,
          });
          return;
        }
        labelRef.current = selection.label;
        selectedLabel = selection.label;
        if (selection.kind === 'placeholder') {
          setResources({
            status: 'placeholder',
            label: selection.label,
            source: null,
            info: null,
            screen: null,
            placeholderRows: [],
            regionRevision: 0,
            degradeToPlaceholder,
          });
          return;
        }

        owned = { source: selection.source, screen: null, released: false };
        if (!canDisplayVideo()) {
          releaseVisualResources(owned);
          setResources({
            status: 'placeholder',
            label: selection.label,
            source: null,
            info: null,
            screen: null,
            placeholderRows: [],
            regionRevision: 0,
            degradeToPlaceholder,
          });
          return;
        }
        const region = computeEmbeddedRegion({
          cols: sizeRef.current.width,
          rows: sizeRef.current.height,
          sourceWidth: selection.info.width,
          sourceHeight: selection.info.height,
        });
        const screen = createManagedScreen({
          region,
          sourceWidth: selection.info.width,
          sourceHeight: selection.info.height,
          colorSpace: selection.info.colorSpace,
        });
        owned.screen = screen;
        ownedRef.current = owned;
        setResources({
          status: 'ready',
          label: selection.label,
          source: selection.source,
          info: selection.info,
          screen,
          placeholderRows: screen.getPlaceholderRows(),
          regionRevision: 0,
          degradeToPlaceholder,
        });
      })
      .catch(() => {
        if (owned !== null) {
          releaseVisualResources(owned);
          if (ownedRef.current === owned) {
            ownedRef.current = null;
          }
        }
        if (cancelled) {
          return;
        }
        labelRef.current = selectedLabel;
        setResources({
          status: 'placeholder',
          label: selectedLabel,
          source: null,
          info: null,
          screen: null,
          placeholderRows: [],
          regionRevision: 0,
          degradeToPlaceholder,
        });
      });

    return () => {
      cancelled = true;
      if (owned !== null) {
        releaseVisualResources(owned);
      }
      if (ownedRef.current === owned) {
        ownedRef.current = null;
      }
    };
  }, [degradeToPlaceholder, enabled, mode, probe, src]);

  useEffect(() => {
    if (resources.screen === null || resources.info === null) {
      return;
    }
    const screen = resources.screen;
    const owned = ownedRef.current;
    if (owned === null || owned.released || owned.screen !== screen) {
      return;
    }
    try {
      screen.setRegion(
        computeEmbeddedRegion({
          cols: width,
          rows: height,
          sourceWidth: resources.info.width,
          sourceHeight: resources.info.height,
        }),
      );
      const placeholderRows = screen.getPlaceholderRows();
      setResources((current) =>
        current.screen === screen && ownedRef.current === owned && !owned.released
          ? { ...current, placeholderRows, regionRevision: current.regionRevision + 1 }
          : current,
      );
    } catch {
      if (ownedRef.current === owned) {
        degradeToPlaceholder();
      }
    }
  }, [degradeToPlaceholder, height, resources.info, resources.screen, width]);

  return resources;
};
