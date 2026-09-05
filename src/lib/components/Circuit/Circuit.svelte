<script lang="ts">
    import GateButton from './Gate.svelte';
    import { circuit, gates, updateParams, circuitParams, activePreset, loadPreset, type Gate } from '$lib/stores/circuit';
    import { presets } from '$lib/stores/presets';
    import { onMount } from 'svelte';
    import { areTouching, arraysAreEqual, clamp } from '$lib/utils';
    import SidePanel from '$lib/components/SidePanel/SidePanel.svelte';
    import { showCircuit } from '$lib/stores/kaleidoscope';
    import Button from '$lib/components/Button/Button.svelte';
    import { faEraser } from '@fortawesome/free-solid-svg-icons';

    let svg: string = "";
    let thisSvg: HTMLDivElement;
    let thisContainer: HTMLElement;
    let selectedGateId: string;
    let selectedGateConnector: number;
    let isClicked: boolean = false;
    let isMoving: boolean = false;

    const getWireIndex = (x: number, y: number) => {
        return clamp(Math.floor((y - 38 + thisContainer.scrollTop) / 80), 0, 7);
    }

    const getColumnIndex = (x: number) => {
        const svg = thisSvg.querySelector('svg')?.getBoundingClientRect()
        if(!svg) return -1;
        return clamp(Math.floor((x - svg.x) / 75), 0, 7);
    }

    const updateSVG = () => {
        svg = circuit.exportSVG(true)
        
        const gates = Array.from(thisSvg?.querySelectorAll(`[data-id]`) || []);
        gates.forEach(el => el.classList.remove('gate--selected'));
        const selectedGate = thisSvg?.querySelector(`[data-id="${selectedGateId}"]`);
        selectedGate && selectedGate.classList.toggle('gate--selected');
    };

    // handle dropping the gate onto the svg
    const handleDragEnd = (i: number, pointerX: number, pointerY: number) => {
        if(!thisSvg) return;
        const {x, y, width, height} = thisSvg.getBoundingClientRect();
        const svg = {x: x + window.scrollX, y: y + window.scrollY, width: width, height: height};
        const pointer = {x: pointerX, y: pointerY, width: 20, height: 20};

        if(!areTouching(pointer, svg)) return;

        const gate = $gates[i];
        const wire = getWireIndex(pointerX, pointerY);
        const column = getColumnIndex(pointerX);
        const wires = Array.from({ length: gate.qubits }, (_, i) => clamp(wire + i, 0, 5));
        const options = gate.params.length
            ? { params: gate.params.reduce((acc, param) => ({ ...acc, [param.name]: param.default }), {}) }
            : {};

        wires.length > 1
            ? circuit.insertGate(gate.symbol, column, wires, options)
            : circuit.addGate(gate.symbol, column, wires, options);
        
        updateSVG() 
        updateParams()

        selectedGateId = ''
    }

    // handle selecting a gate on the svg
    const handleMouseDown = (e: MouseEvent) => {
        isClicked = true;
        const target = e.target as HTMLElement;
        const parent = target?.parentElement;
        
        selectedGateId = target?.dataset?.id || parent?.dataset.id || '';
        if(!selectedGateId) return;

        const wire = getWireIndex(e.clientX, e.clientY);
        const wires = circuit.getGateById(selectedGateId).wires
        const connector = wires.findIndex((w: number) => w === wire);
        selectedGateConnector = connector === -1 ? 0 : connector;
        
        updateSVG();
    }

    // handle moving gates on the svg
    const handleMouseMove = () => {
        if(!isClicked) return;
        isMoving = true;
    }

    // handle updating gates on the svg
    const handleMouseUp = (e: MouseEvent) => {
        if(!isClicked) return;
        
        const gate = circuit.getGateById(selectedGateId);
        if(!gate) return
        const wire = getWireIndex(e.clientX, e.clientY - 75)
        const column = getColumnIndex(e.clientX - 20);
        
        const wires = gate.wires.map((w: number, i: number) => (i === selectedGateConnector) ? wire : w);
        
        isClicked = false;
        isMoving = false;

        if(arraysAreEqual(gate.wires, wires) && gate.column === column) return;
        
        circuit.removeGate(selectedGateId);
        circuit.addGate(gate.name, column, wires, gate.options);
        
        updateSVG();
        updateParams()

        selectedGateId = ''
    }

    const clearCircuit = () => {
        circuit.clear()
        circuit.numQubits = 1
        updateSVG()
        updateParams()
    };

    onMount(() => {        
        updateSVG()

        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                circuit.removeGate(selectedGateId);
                updateSVG();
                updateParams()
            }
        }

        window.addEventListener('keydown', handleKeydown);
        const unsubscribeCircuitParams = circuitParams.subscribe(() => updateSVG());

        return () => {
            window.removeEventListener('keydown', handleKeydown)
            unsubscribeCircuitParams()
        };
    });

    let focusedGate: null | Gate = null;
</script>

<svelte:window on:mouseup={() => {
    isClicked = false
    isMoving = false
}} />

{#if $showCircuit}
<SidePanel>
    <section 
        class="circuit-designer"
        bind:this={thisContainer}
    >
        <aside class="circuit-designer__palette">
            <div class="circuit-designer__header">
                <h2 class="title">Circuit</h2>
                <select
                    class="circuit-designer__preset"
                    value={$activePreset}
                    on:change={(e) => {
                        loadPreset((e.target as HTMLSelectElement).value);
                        selectedGateId = '';
                        updateSVG();
                    }}
                >
                    {#each presets as preset}
                        <option value={preset.id}>{preset.name}</option>
                    {/each}
                </select>
            </div>
            <div
                class="circuit-designer__gates"
            >
                {#each $gates as gate, i}
                    <GateButton 
                        id={i}
                        symbol={gate.symbol}
                        mouseover={() => focusedGate = gate}
                        mouseout={() => focusedGate = null}
                        dragend={(data: { id: number, x: number, y: number }) => {
                            const { id, x, y } = data;
                            handleDragEnd(id, x, y)
                        }}
                    />
                {/each}
            </div>
            <Button 
                onClick={clearCircuit}
                icon={faEraser}
                style="height: 2rem; border-radius: 5px; width: 4rem;"
            />
        </aside>
        <div class="circuit-designer__circuit">
            {#if svg}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-mouse-events-have-key-events -->
                <div 
                    bind:this={thisSvg}
                    class="circuit-designer__svg"
                    class:circuit-designer__svg--moving={isMoving}
                    on:mousedown={handleMouseDown}
                    on:mouseover={handleMouseMove}
                    on:mouseup={handleMouseUp}
                    on:mouseleave={handleMouseUp}
                >
                    {@html svg}
                </div>
            {/if}
        </div>
    </section>
</SidePanel>
{/if}

<style lang="scss">
    .buttons {
        &__inner {
            padding: 1rem;
            display: flex;
            justify-content: flex-end;
            @media (min-width: 1200px) {
                padding: 1rem 2rem;
            }
        }

        @media (min-width: 1200px) {
            padding-bottom: 1.5rem;
        }
	}

    .title {
        color: white;
        margin: 0;
    }

    .circuit-designer {
        &__header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        &__preset {
            background: transparent;
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.4);
            border-radius: 1px;
            padding: 0.25rem 0.5rem;
            font-size: 0.65rem;
            max-width: 8rem;

            &:focus {
                outline: none;
                background-color: white;
                color: black;
            }

            option {
                color: black;
            }
        }

        display: flex;
        gap: 1rem;
        min-height: 76vh;
        height: 100%;
        width: calc(100vw - 50px);
        overflow-y: scroll;

        &__palette {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        &__circuit {
            margin-top: 3.3rem;
            width: 100%;
        }

        &__gates {
            display: flex;
            flex-direction: column;
            flex-wrap: wrap;
            width: 100%;
            gap: 0.5rem;
            width: 4rem;

            & button {
                width: 100%;
            }
        }

        &__circuit {
            width: 100%;
        }

        &__input {
            display: flex;
            flex-direction: column;
            margin-bottom: 1rem;
        }

        &__svg {
            height: 100%;
            &--moving {
                cursor: grabbing;
                z-index: 1000;
            }
        }

        :global(.qc-circuit line) {
            stroke: white!important;
        }

        :global(.qc-circuit text) {
            font-size: 0.65rem;
            color: white!important;
            fill: white!important;
            stroke: white!important;
            user-select: none;
        }
        :global(.qc-circuit ellipse),
        :global(.qc-circuit text), 
        :global(.qc-circuit circle) {
            fill: transparent!important;
            stroke: white!important;
        }

        // :global(.qc-circuit ellipse), 
        :global(.qc-circuit rect), 
        :global(.qc-circuit path) {
            fill: transparent!important;
            stroke: white!important;
            cursor: grab;
        }

        :global(.gate--selected rect),
        :global(.gate--selected ellipse),
        :global(.gate--selected circle),
        :global(.gate--selected line){
            stroke: white!important;
            stroke-width: 2px!important;
        }
    }
</style>