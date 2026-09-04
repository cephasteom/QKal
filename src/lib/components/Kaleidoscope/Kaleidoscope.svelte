<script lang="ts">
  import { onMount } from 'svelte';
  import { t, objects, isPlaying, size, blur, segments, webcamOpacity } from '$lib/stores/kaleidoscope';
  import { segmentDimensions } from '$lib/utils';
  import {
    superformulaPoints,
    clipPolygonToWedge,
    drawPolygon,
    rotatePoints,
    translatePoints,
    mirrorPointsX,
    compositeWebcamWedges
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

    let webcamVideo: (HTMLVideoElement & { ready?: boolean }) | null = null;
    let webcamBuffer: any = null;
    let currentWebcamOpacity = 0;

    function stopWebcam() {
      const stream = webcamVideo?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      webcamVideo?.remove();
      webcamVideo = null;
      webcamBuffer?.remove();
      webcamBuffer = null;
    }

    const unsubObjects = objects.subscribe((v) => (currentObjects = v));
    const unsubBlur = blur.subscribe((v) => (currentBlur = v));
    const unsubSize = size.subscribe((v) => {
      currentSize = v;
      q?.resizeCanvas(v, v);
      // recreated rather than resized - the buffer stayed stuck at its
      // creation-time dimensions when using q5's own resizeCanvas() here,
      // so this sidesteps whatever that mismatch was.
      if (webcamBuffer && q) {
        webcamBuffer.remove();
        webcamBuffer = q.createGraphics(v, v, 'c2d');
      }
    });
    const unsubSegments = segments.subscribe((v) => (currentSegments = v));
    const unsubPlaying = isPlaying.subscribe((v) => {
      playing = v;
      v ? q?.loop() : q?.noLoop();
    });
    const unsubWebcamOpacity = webcamOpacity.subscribe((opacity) => {
      currentWebcamOpacity = opacity;
      if (!q) return;
      if (opacity <= 0) {
        stopWebcam();
        return;
      }
      if (webcamVideo) return;

      (async () => {
        try {
          webcamVideo = await q.createCapture('video');
          // q5 auto-appends captured elements as a visible sibling of the
          // canvas (see createElement in q5.js) - it's only used as a texture
          // source here, so pull it out of layout and hide it.
          Object.assign(webcamVideo.style, {
            position: 'absolute',
            width: '1px',
            height: '1px',
            opacity: '0',
            pointerEvents: 'none'
          });
          webcamBuffer = q.createGraphics(currentSize, currentSize, 'c2d');
        } catch (err) {
          console.error('Webcam capture failed', err);
          stopWebcam();
          webcamOpacity.set(0);
        }
      })();
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

        // drawn before the shapes below so it sits behind them, and after
        // q.background() so it inherits the same translucent-clear trailing.
        if (webcamVideo && webcamBuffer) {
          compositeWebcamWedges(
            webcamBuffer.drawingContext,
            webcamVideo,
            currentSegments,
            currentSize,
            wedgeWidth,
            currentWebcamOpacity
          );
          webcamBuffer.modified = true;
          // q5's WebGPU renderer has (0,0) at the canvas centre (see
          // resetMatrix() -> translate(halfWidth, halfHeight) in q5.js),
          // unlike the offscreen 2D buffer's top-left origin, so the corner
          // must be offset by half the size to keep the two centred together.
          q.image(webcamBuffer, -currentSize / 2, -currentSize / 2, currentSize, currentSize);
        }

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
      unsubWebcamOpacity();
      stopWebcam();
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
