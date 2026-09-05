<aside>
    {#if $$slots.header}
        <header><slot name="header"></slot></header>
    {/if}
    <div class="content">
        <slot></slot>
    </div>
</aside>

<style lang="scss">
    aside {
        position: absolute;
        top: 0;
        left: 50px;
        height: 100vh;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        overflow: hidden;
        border-left: 0.25px solid rgba(255,255,255,0.25);
        padding: 1rem 0.75rem 0 2rem;
        z-index: 100;
        font-weight: 100;
    }

    header {
        flex-shrink: 0;
    }

    .content {
        // A flex child's min-height defaults to the size of its content,
        // which would stretch this past the viewport instead of scrolling -
        // 0 lets it shrink so overflow-y actually kicks in.
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        overflow-y: auto;
        // Consumers that manage their own horizontal scroll (e.g. Circuit)
        // shouldn't get a second one wrapped around them here.
        overflow-x: hidden;
    }
</style>
