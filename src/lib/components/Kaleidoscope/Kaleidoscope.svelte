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
    compositeWebcamWedges,
    applyMatrix,
    segmentMatrix,
    wedgeStatus,
    type Matrix2D
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
          // @ts-ignore
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
      // @ts-ignore
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

        // A shape's own spin + position is identical in every wedge - only
        // the per-segment mirror/placement differs - so it's generated once
        // per object per frame here and reused across all N segments below,
        // instead of once per segment x object pair.
        const prepared = currentObjects.map((obj: any) => {
          const offsetX = obj.x - wedgeWidth / 2;
          const offsetY = obj.y;
          const basePoints = translatePoints(
            rotatePoints(superformulaPoints(obj.size, obj.sf), obj.rot),
            offsetX,
            offsetY
          );
          return { obj, basePoints, status: wedgeStatus(basePoints, halfWedgeAngle) };
        });

        // Per-segment mirror + final rotate is a linear map that depends only
        // on the segment's index/count, not on any object - precomputed once
        // per frame as a single matrix instead of two ops rebuilt per object.
        const placementMatrices: Matrix2D[] = [];
        const rotationMatrices: Matrix2D[] = [];
        for (let i = 0; i < currentSegments; i++) {
          const mirrored = i % 2 !== 0;
          const wedgeAngle = halfWedgeAngle + i * ((Math.PI * 2) / currentSegments);
          placementMatrices.push(segmentMatrix(wedgeAngle, mirrored));
          rotationMatrices.push(segmentMatrix(wedgeAngle, false));
        }

        for (let i = 0; i < currentSegments; i++) {
          const mirrored = i % 2 !== 0;
          const placementMatrix = placementMatrices[i];
          const rotationMatrix = rotationMatrices[i];

          for (const { obj, basePoints, status } of prepared) {
            if (status === 'out') continue;

            let points;
            if (status === 'in') {
              // entirely inside the wedge cone - no clip needed, mirror +
              // rotate collapse into a single matrix pass
              points = applyMatrix(basePoints, placementMatrix);
            } else {
              // boundary-crossing shape - still needs the real clip, done in
              // the same mirror-then-clip-then-rotate order as before; q5 has
              // no scissor/clip primitive of its own.
              let clipped = mirrored ? mirrorPointsX(basePoints) : basePoints;
              clipped = clipPolygonToWedge(clipped, halfWedgeAngle);
              if (clipped.length < 3) continue;
              points = applyMatrix(clipped, rotationMatrix);
            }

            drawPolygon(q, points, obj.fill, obj.stroke);
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
