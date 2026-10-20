<script lang="ts">
  import Dialog from '../ui/Dialog.svelte';
  import { codeCopy, renderMarkdown } from '../ticket/markdown';
  import { loadMarkdown, type MarkdownFile } from '../../sessions/model';

  let { file, onclose }: { file: MarkdownFile | null; onclose: () => void } = $props();
  let text = $state<string | null>(null);
  let error = $state('');
  let raw = $state(false);
  let copied = $state(false);

  $effect(() => {
    const wanted = file;
    text = null;
    error = '';
    raw = false;
    if (!wanted?.href) return;
    let stale = false;
    loadMarkdown(wanted.href).then((t) => { if (!stale) text = t; }, (cause) => { if (!stale) error = cause instanceof Error ? cause.message : String(cause); });
    return () => { stale = true; };
  });

  async function copyPath() {
    if (!file) return;
    try { await navigator.clipboard.writeText(file.path); copied = true; setTimeout(() => (copied = false), 1400); } catch { /* the path stays selectable */ }
  }
</script>

<Dialog open={file !== null} label={file?.name ?? 'Markdown file'} wide onclose={onclose}>
  <div class="frame">
    <header>
      <div>
        <p class="eyebrow">Markdown file · request #{file?.request}</p>
        <h2>{file?.name}</h2>
        <button class="path" onclick={copyPath} title="Copy the path">{copied ? 'copied' : file?.path}</button>
      </div>
      <div class="actions">
        <button onclick={() => (raw = !raw)}>{raw ? 'Rendered' : 'Source'}</button>
        <button onclick={onclose} aria-label="Close">✕</button>
      </div>
    </header>
    <div class="content">
      {#if error}<p class="muted">Could not open it: {error}</p>
      {:else if text === null}<p class="muted">Loading…</p>
      {:else if raw}<pre>{text}</pre>
      {:else}<div class="markdown" use:codeCopy>{@html renderMarkdown(text)}</div>{/if}
    </div>
  </div>
</Dialog>

<style>
  .frame { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
  header { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
  h2 { margin: .1rem 0 .25rem; font-family: var(--font-serif); font-size: 1.25rem; }
  .eyebrow { margin: 0; color: var(--text-muted); font-size: .68rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .path { padding: 0; border: 0; background: none; color: var(--text-muted); font: .72rem var(--font-mono); cursor: pointer; text-align: left; overflow-wrap: anywhere; }
  .actions { display: flex; gap: .4rem; align-items: start; }
  .actions button { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: inherit; padding: .35rem .6rem; font: inherit; font-size: .78rem; cursor: pointer; }
  .actions button:hover { border-color: var(--accent); color: var(--accent); }
  .content { overflow-y: auto; padding: 1.2rem 1.5rem 2rem; }
  pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: .78rem/1.5 var(--font-mono); }
  .muted { color: var(--text-muted); }
</style>
