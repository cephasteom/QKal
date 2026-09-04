<script lang="ts">
  import { onMount } from 'svelte';
  import { t, objects, qubitObjects, isPlaying, size, blurAmount, segments, webcamOpacity } from '$lib/stores/kaleidoscope';
  import { segmentDimensions } from '$lib/utils';
  import {
    SUPERFORMULA_POINT_COUNT,
    writeBasePoints,
    flatToPoints,
    clipPolygonToWedge,
    drawPolygon,
    drawPolygonFlat,
    mirrorPointsX,
    compositeWebcamWedges,
    applyMatrix,
    applyMatrixInto,
    segmentMatrix,
    wedgeStatusFlat,
    type Matrix2D
  } from '$lib/utils/draw';

  let containerEl: HTMLDivElement;

  onMount(() => {
    let q: any;
    let cancelled = false;

    let currentObjects: any[] = [];
    let currentQubitObjects: any[] = [];
    let currentBlur = 0;
    let currentSize = 0;
    let currentSegments = 0;
    let playing = true;

    let webcamVideo: (HTMLVideoElement & { ready?: boolean }) | null = null;
    let webcamBuffer: any = null;
    let currentWebcamOpacity = 0;

    // Pooled per-object point buffers, reused frame over frame instead of
    // allocating a fresh Point[] per object per frame - see QKAL_PLAN.md
    // step 2. Rebuilt only when the object count changes (i.e. the circuit's
    // qubit count changes), which is rare. scratchBuffer holds the one
    // in-flight transformed shape passed to drawPolygonFlat on the hot
    // "entirely inside the wedge" path.
    let baseBuffers: Float32Array[] = [];
    const scratchBuffer = new Float32Array(SUPERFORMULA_POINT_COUNT * 2);

    function stopWebcam() {
      const stream = webcamVideo?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      webcamVideo?.remove();
      webcamVideo = null;
      webcamBuffer?.remove();
      webcamBuffer = null;
    }

    const unsubObjects = objects.subscribe((v) => (currentObjects = v));
    const unsubQubitObjects = qubitObjects.subscribe((v) => (currentQubitObjects = v));
    const unsubBlur = blurAmount.subscribe((v) => (currentBlur = v));
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
        // instead of once per segment x object pair. The per-qubit ring
        // (currentQubitObjects) is drawn through the same pipeline, just
        // concatenated onto the basis-state shapes.
        const renderObjects = currentQubitObjects.length
          ? currentObjects.concat(currentQubitObjects)
          : currentObjects;
        if (baseBuffers.length !== renderObjects.length) {
          baseBuffers = renderObjects.map(() => new Float32Array(SUPERFORMULA_POINT_COUNT * 2));
        }
        const prepared = renderObjects.map((obj: any, i: number) => {
          const offsetX = obj.x - wedgeWidth / 2;
          const offsetY = obj.y;
          const basePoints = baseBuffers[i];
          writeBasePoints(basePoints, obj.size, obj.sf, obj.rot, offsetX, offsetY);
          return { obj, basePoints, status: wedgeStatusFlat(basePoints, halfWedgeAngle) };
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

            if (status === 'in') {
              // entirely inside the wedge cone - no clip needed, mirror +
              // rotate collapse into a single matrix pass, written into the
              // shared scratch buffer rather than allocating a new one.
              applyMatrixInto(scratchBuffer, basePoints, placementMatrix);
              drawPolygonFlat(q, scratchBuffer, obj.fill, obj.stroke);
            } else {
              // boundary-crossing shape - still needs the real clip, done in
              // the same mirror-then-clip-then-rotate order as before; q5 has
              // no scissor/clip primitive of its own. Rare enough that
              // falling back to the allocating Point[] pipeline is fine.
              let clipped = mirrored ? mirrorPointsX(flatToPoints(basePoints)) : flatToPoints(basePoints);
              clipped = clipPolygonToWedge(clipped, halfWedgeAngle);
              if (clipped.length < 3) continue;
              const points = applyMatrix(clipped, rotationMatrix);
              drawPolygon(q, points, obj.fill, obj.stroke);
            }
          }
        }
      };
    })();

    return () => {
      cancelled = true;
      unsubObjects();
      unsubQubitObjects();
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
