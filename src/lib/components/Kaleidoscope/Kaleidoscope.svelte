<script lang="ts">
  import { onMount } from 'svelte';
  import { t, objects, isPlaying, size, blur, segments } from '$lib/stores/kaleidoscope';
  import { segmentDimensions } from '$lib/utils';
  import {
    superformulaPoints,
    clipPolygonToWedge,
    drawPolygon,
    rotatePoints,
    translatePoints,
    mirrorPointsX
  } from '$lib/utils/draw';

  let containerEl: HTMLDivElement;

  onMount(() => {
    let q: any;
    let cancelled = false;

    let currentObjects: any[] = [];
    let currentBlur = 0;
    let currentSize = 0;
    let currentSegments = 0;
    let playing = true;

    const unsubObjects = objects.subscribe((v) => (currentObjects = v));
    const unsubBlur = blur.subscribe((v) => (currentBlur = v));
    const unsubSize = size.subscribe((v) => {
      currentSize = v;
      q?.resizeCanvas(v, v);
    });
    const unsubSegments = segments.subscribe((v) => (currentSegments = v));
    const unsubPlaying = isPlaying.subscribe((v) => {
      playing = v;
      v ? q?.loop() : q?.noLoop();
    });

    (async () => {
      await import('q5');
      const Q5 = (window as any).Q5;
      if (cancelled) return;

      q = await Q5.WebGPU('instance', containerEl);
      await q.createCanvas(currentSize, currentSize);
      if (!playing) q.noLoop();

      q.draw = () => {
        if (playing) t.update((v) => v + 1);

        q.background(0, 0, 0, (1 - currentBlur) * 0.2);

        const { width: wedgeWidth } = segmentDimensions(currentSegments, currentSize);
        const halfWedgeAngle = Math.PI / currentSegments;

        // All wedge placement, mirroring and per-object spin is computed as
        // plain point math (not via q.rotate/q.scale) - see draw.ts for why.
        for (let i = 0; i < currentSegments; i++) {
          const mirrored = i % 2 !== 0;
          const wedgeAngle = halfWedgeAngle + i * ((Math.PI * 2) / currentSegments);

          for (const obj of currentObjects) {
            const offsetX = obj.x - wedgeWidth / 2;
            const offsetY = obj.y;

            // 1. the shape's own spin + position, in canonical wedge-local space
            let points = translatePoints(
              rotatePoints(superformulaPoints(obj.size, obj.sf), obj.rot),
              offsetX,
              offsetY
            );

            // 2. alternate wedges are true mirror reflections - reflecting the
            // already-spun shape naturally reverses its apparent spin too.
            if (mirrored) points = mirrorPointsX(points);

            // 3. clip to the wedge boundary before placing it on the circle -
            // q5 has no scissor/clip primitive of its own.
            points = clipPolygonToWedge(points, halfWedgeAngle);
            if (points.length < 3) continue;

            // 4. rotate the (already mirrored + clipped) content into place
            drawPolygon(q, rotatePoints(points, wedgeAngle), obj.fill, obj.stroke);
          }
        }
      };
    })();

    return () => {
      cancelled = true;
      unsubObjects();
      unsubBlur();
      unsubSize();
      unsubSegments();
      unsubPlaying();
      q?.remove();
    };
  });
</script>

<div class="kaleidoscope" bind:this={containerEl} style={`width: ${$size}px; height: ${$size}px;`}></div>

<style lang="scss">
  .kaleidoscope {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    border-radius: 50%;
  }
</style>
