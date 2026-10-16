import React, { useEffect, useId, useRef, useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { COLORS } from '../../constants/theme';
import { useOpaqueGlass } from '../../lib/glass-preferences';
import { createLensMap } from '../../lib/glass-lens';
import { useAppAppearance } from '../../lib/appearance';

type Material = 'clear' | 'regular' | 'sheet';

/** Real backdrop displacement in Chromium; honest frosted fallback elsewhere. */
export function GlassBackdrop({ radius = 28, material = 'regular' }: { radius?: number; material?: Material }) {
  const dark = useAppAppearance(state => state.scheme === 'dark');
  const preferOpaque = useOpaqueGlass();
  const [supportsGlass, setSupportsGlass] = useState(false);
  const opaque = preferOpaque || !supportsGlass;
  const ref = useRef<HTMLDivElement>(null);
  const id = `pantry-lens-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [lens, setLens] = useState<{ src: string; width: number; height: number } | null>(null);
  const [refracts, setRefracts] = useState(false);

  useEffect(() => {
    setSupportsGlass(typeof CSS !== 'undefined' && (
      CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
    ));
    // CSS.supports accepts SVG URLs even on engines that do not render them.
    // Restrict displacement to the engine with working backdrop SVG filters.
    setRefracts(/Chrome|Chromium|Edg\//.test(navigator.userAgent) && !/EdgiOS|CriOS/.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || opaque || !refracts || material !== 'clear') { setLens(null); return; }
    let frame = 0;
    let previous = '';
    const update = () => {
      const { width, height } = node.getBoundingClientRect();
      if (!width || !height) return;
      const key = `${Math.round(width)}:${Math.round(height)}:${radius}`;
      if (key === previous) return;
      previous = key;
      const map = createLensMap(width, height, radius);
      const canvas = document.createElement('canvas');
      canvas.width = map.width;
      canvas.height = map.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      const image = context.createImageData(map.width, map.height);
      image.data.set(map.pixels);
      context.putImageData(image, 0, 0);
      setLens({ src: canvas.toDataURL(), width, height });
    };
    update();
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    observer?.observe(node);
    window.addEventListener('resize', onResize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', onResize); cancelAnimationFrame(frame); };
  }, [opaque, refracts, radius, material]);

  const clear = material === 'clear';
  const filter = opaque ? 'none' : clear && lens
    ? `url("#${id}") saturate(1.08)`
    : `blur(${clear ? 16 : 28}px) saturate(1.08)`;

  return (
    <div ref={ref} aria-hidden="true" data-glass-material={opaque ? 'opaque' : lens ? 'refractive' : 'frosted'}
      style={{ position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none' }}>
      {lens && !opaque && (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <filter id={id} x="0" y="0" width={lens.width} height={lens.height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceGraphic" stdDeviation={clear ? 3 : 5} result="soft" />
              <feImage href={lens.src} x="0" y="0" width={lens.width} height={lens.height} preserveAspectRatio="none" result="normals" />
              <feDisplacementMap in="soft" in2="normals" scale={clear ? 38 : 28} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
      )}
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius,
        backdropFilter: filter, WebkitBackdropFilter: filter,
        background: opaque ? COLORS.cardSurface : dark
          ? (material === 'sheet' ? 'rgba(35,33,30,0.97)' : 'rgba(35,33,30,0.90)')
          : (material === 'sheet' ? 'rgba(250,249,247,0.97)' : 'rgba(250,249,247,0.90)'),
        boxShadow: opaque ? `inset 0 0 0 1px ${COLORS.borderStrong}`
          : 'inset 0 1px 1px rgba(255,255,255,0.08), 0 6px 24px rgba(0,0,0,0.10)',
      }} />
      {!opaque && <div style={{ position: 'absolute', inset: 0, borderRadius: radius,
        background: dark ? 'linear-gradient(135deg,rgba(255,255,255,0.04),transparent 45%,rgba(255,255,255,0.01))' : 'linear-gradient(135deg,rgba(255,255,255,0.08),transparent 45%,rgba(255,255,255,0.02))',
        border: dark ? '1px solid rgba(255,255,255,0.26)' : '1px solid rgba(80,70,60,0.30)', boxSizing: 'border-box',
      }} />}
    </div>
  );
}

export function GlassSurface({ children, style, ...props }: ViewProps) {
  return <View {...props} style={[styles.surface, style]}><GlassBackdrop material="regular" />{children}</View>;
}

const styles = StyleSheet.create({ surface: { borderRadius: 28 } });
