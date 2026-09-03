<script lang="ts">
    import { onMount } from "svelte";
    import { closeAllControls, toggleIsPlaying } from "$lib/stores/kaleidoscope";
    import Kaleidoscope from "$lib/components/Kaleidoscope/Kaleidoscope.svelte";
    import Parameters from "$lib/components/Parameters/Parameters.svelte";
    import Sidebar from "$lib/components/Sidebar/Sidebar.svelte";
    import Info from "$lib/components/Info/Info.svelte";
    import Circuit from "$lib/components/Circuit/Circuit.svelte";
    import "./styles.css";

    onMount(() => {
        window.addEventListener("keydown", (e) => e.key === "Escape" && closeAllControls());
        window.addEventListener("keydown", (e) => e.key === "Enter" && toggleIsPlaying());
        return () => {
            window.removeEventListener("keydown", (e) => e.key === "Escape" && closeAllControls());
            window.removeEventListener("keydown", (e) => e.key === "Enter" && toggleIsPlaying());
        };
    });
</script>

<svelte:head>
  <title>CephasTeom: Kaleidosope</title>
  <meta name="description" content="A generative kaleidoscope that transforms the state vector of a simulated quantum circuit into dynamic shapes and colours on a canvas." />
</svelte:head>

<main>
    <Sidebar />
    <Parameters />
    <Info />
    <Circuit />
    
    <Kaleidoscope />

    <footer>
        <!-- copyright cephas teom current year -->
        <p>&copy; <a href="https://cephasteom.co.uk/">CephasTeom</a> {new Date().getFullYear()}</p>
    </footer>
</main>

<style lang="scss">
    :global(body) {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        width: 100vw;
        background-color: black;
        margin: 0;
        overflow: hidden;
        position: relative;
    }

    :global(main) {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: row;
        overflow: hidden;
        width: 100vw;
        padding: 1rem;
    }

    footer {
        position: fixed;
        bottom: 0;
        color: white;
        font-size: 0.75rem;
        font-weight: 100;
        right: 0;
        padding: 0.75rem 1.5rem;

        a {
            color: white;
            text-decoration: none!important;
        }
    }
</style>
