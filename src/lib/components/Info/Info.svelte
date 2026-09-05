<script lang="ts">
    import { 
        showInfo,
    } from "$lib/stores/kaleidoscope";
    import SidePanel from "$lib/components/SidePanel/SidePanel.svelte";
</script>

{#if $showInfo}
    <SidePanel>
        <article>
            <h2>Kaleidoscope</h2>
            <p>A generative kaleidoscope that transforms the state vector of a simulated quantum circuit into shapes and colours on a mirrored canvas.</p>
            <p>Each basis state is a shape placed on a lattice shaped like the circuit's qubits - states one flip apart sit next to each other, so the layout reflects structure. A state's phase sets its colour and its probability sets its size and opacity. The pattern evolves continuously as the circuit's gates act on the state, one step at a time.</p>
            <p>
                Open the circuit menu to pick a preset or drag gates onto the wires to build your own. The parameters menu adjusts each gate's angle alongside global rendering and evolution-speed controls, and responds to a connected MIDI device.
            </p>
            <p>
                Built by CephasTeom using <a href="https://svelte.dev/" target="_blank">Svelte</a> and <a href="https://www.npmjs.com/package/quantum-circuit" target="_blank">quantum-circuit</a>.
            </p>
        </article>
    </SidePanel>
{/if}

<style>
    article {
        color: white;
        max-width: 20rem;
    }

    a {
        color: white;
    }
</style>