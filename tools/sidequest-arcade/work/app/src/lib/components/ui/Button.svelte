<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children, variant = 'secondary', type = 'button', disabled = false, onclick }: { children: Snippet; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; type?: 'button' | 'submit' | 'reset'; disabled?: boolean; onclick?: (event: MouseEvent) => void } = $props();
</script>

<button class={`ui-button ${variant}`} {type} {disabled} {onclick}>
  {@render children()}
</button>

<style>
  .ui-button { display:inline-flex; min-height:2.25rem; align-items:center; justify-content:center; gap:.4rem; border:var(--border-width) solid var(--border); border-radius:var(--radius); padding:.45rem .75rem; background:var(--surface-muted); color:var(--text); font:700 .76rem var(--font-sans); letter-spacing:.02em; }
  .ui-button:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }
  .ui-button.primary { border-color:var(--accent); background:var(--accent); color:var(--text-on-accent); }
  .ui-button.primary:hover:not(:disabled) { color:var(--text-on-accent); box-shadow:var(--glow); }
  .ui-button.quiet { border-color:transparent; background:transparent; color:var(--text-muted); }
  .ui-button.danger { color:var(--danger); } .ui-button.danger:hover:not(:disabled) { border-color:var(--danger); color:var(--danger); }
  .ui-button:disabled { cursor:not-allowed; opacity:.55; }
</style>
