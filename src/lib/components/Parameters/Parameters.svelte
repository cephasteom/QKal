<script lang="ts">
    import { 
        elementMaxSize, 
        fillOpacity,
        strokeOpacity,
        speed,
        momentRate,
        showControls,
        blur,
        midiInput,
        size,
        webcamOpacity
    } from "$lib/stores/kaleidoscope";
    import { circuitParams } from "$lib/stores/circuit";
    import SidePanel from "$lib/components/SidePanel/SidePanel.svelte";
</script>

{#if $showControls}
    <SidePanel>
        <h2>Parameters</h2>
        
        <div class="parameter">
            <label for="size">Size</label>
            <input class="track" type="range" id="size" bind:value={$size} min="700" max="2000" step="1" />
            <output for="size">{$size}</output>
        </div>
        <div class="parameter">
            <label for="elementMaxSize">Zoom</label>
            <input class="track" type="range" id="elementMaxSize" bind:value={$elementMaxSize} min="0" max="1" step="0.001" />
            <output for="elementMaxSize">{$elementMaxSize}</output>
        </div>
        <div class="parameter">
            <label for="fillOpacity">Fill</label>
            <input class="track" type="range" id="fillOpacity" bind:value={$fillOpacity} min="0" max="1" step="0.001" />
            <output for="fillOpacity">{$fillOpacity.toFixed(2)}</output>
        </div>
        <div class="parameter">
            <label for="strokeOpacity">Outline</label>
            <input class="track" type="range" id="strokeOpacity" bind:value={$strokeOpacity} min="0" max="1" step="0.01" />
            <output for="strokeOpacity">{$strokeOpacity.toFixed(2)}</output>
        </div>
        <div class="parameter">
            <label for="blur">Blur</label>
            <input class="track" type="range" id="blur" bind:value={$blur} min="0" max="1" step="0.01" />
            <output for="blur">{$blur.toFixed(2)}</output>
        </div>
        <div class="parameter">
            <label for="speed">Noise</label>
            <input class="track" type="range" id="speed" bind:value={$speed} min="0.01" max="1" step="0.01"/>
            <output for="speed">{$speed.toFixed(2)}</output>
        </div>
        <div class="parameter">
            <label for="momentRate">Evolution</label>
            <input class="track" type="range" id="momentRate" bind:value={$momentRate} min="0" max="1" step="0.001"/>
            <output for="momentRate">{$momentRate.toFixed(2)}</output>
        </div>
        <div class="parameter">
            <label for="midiInput">Midi Input</label>
            <input class="track" type="range" id="midiInput" bind:value={$midiInput} min="0" max="1" step="0.01"/>
            <output for="midiInput">{$midiInput.toFixed(2)}</output>
        </div>
        <div class="parameter">
            <label for="webcamOpacity">Webcam</label>
            <input class="track" type="range" id="webcamOpacity" bind:value={$webcamOpacity} min="0" max="1" step="0.01" />
            <output for="webcamOpacity">{$webcamOpacity.toFixed(2)}</output>
        </div>

        <hr />

        {#each $circuitParams as param}
            <div class="parameter">
                <label for={param.name}>{param.name}</label>
                <input 
                    class="track" 
                    type="range" 
                    id={param.name} 
                    bind:value={param.value} 
                    min={0} 
                    max={param.param === 'theta' ? Math.PI : Math.PI * 2} 
                    step={0.01} 
                />
                <output for={param.name}>
                    { Math.round(param.value* 100) / 100 } 
                </output>
            </div>
        {/each}
    </SidePanel>

{/if}

<style>

    hr {
        border: 0;
        height: 1px;
        background: rgba(255, 255, 255, 0.2);
        margin: 1rem 0;
    }
    .parameter {
        display: grid;
        grid-template-columns: 2fr 4fr 2fr;
        gap: 1rem;
    }

    label, output {
        color: white;
    }

    input[type=range] {
        width: 100%;
        -webkit-appearance: none;  /* Override default CSS styles */
        appearance: none;
        background: transparent;  /* Otherwise white in Chrome */
        outline: none; 
        margin: 0;
        height: 2px;
    }

    input[type=range].track {
        background: white;
        transform: translateY(0.7rem);
    }

    input[type=range]::-moz-range-progress {
        background-color: transparent;
    }
    
    /* Annoyingly, lots of repeated css, but doesn't work otherwise */
    .min::-webkit-slider-thumb, .max::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 8px;
        height: 16px;
        background: linear-gradient(to left, #000, #000 35%, grey 35%, grey 65%, #000 65%);
        border-radius: 0;
        cursor: pointer;
        position: relative;
        z-index: 10;
    }

    .min::-webkit-slider-thumb {
        top: 2px;
    }

    .max::-webkit-slider-thumb {
        top: -2px;
    }

    .min::-moz-range-thumb, .max::-moz-range-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 8px;
        height: 16px;
        background: linear-gradient(to left, grey, grey 33%, grey 34%, grey 66%, var(--color-grey-dark) 66%);
        border-radius: 0;
        position: absolute;
    }

    .min::-moz-range-thumb {
        transform: translateY(2px);
    }

    .max::-moz-range-thumb {
        transform: translateY(-2px);
    }

    .track::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 2px;
        height: 16px;
        border-radius: 0;
        background: white;
        cursor: pointer;
        z-index: -10;
    }

    .track::-moz-range-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 2px;
        height: 16px;
        background: white;
        cursor: pointer;
        z-index: -10;
    }
</style>