<script lang="ts">
  import { onMount } from 'svelte';
  import type { BoardState } from '../../state/board.svelte';
  import { filterSessions, loadIndex, projectLabel, relativeTime, type SessionIndex } from '../../sessions/model';
  import SessionDialog from './SessionDialog.svelte';

  let { state: board }: { state: BoardState } = $props();
  let index = $state<SessionIndex | null>(null);
  let error = $state('');
  let loading = $state(false);
  let open = $state<string | null>(null);
  let copied = $state<string | null>(null);
  let now = $state(Date.now());

  // The search box is in the page header (Toolbar), which shows only the title and this search in the sessions view.
  const searching = $derived(board.sessionSearch.trim() !== '');
  const shown = $derived(index ? filterSessions(index.sessions, board.sessionSearch) : []);

  async function refresh() {
    loading = true;
    try {
      index = await loadIndex();
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
      now = Date.now();
    }
  }

  async function copyId(id: string) {
    try { await navigator.clipboard.writeText(id); copied = id; setTimeout(() => { if (copied === id) copied = null; }, 1400); } catch { /* the id stays selectable */ }
  }

  onMount(() => {
    void refresh();
    // the data is rebuilt after every turn of every session; the list follows it while it is open
    const timer = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(timer);
  });
</script>

<section class="sessions panel" aria-label="Claude sessions">
  <p class="note">
    {#if index}{searching ? `${shown.length} of ` : ''}{index.sessions.length} session{index.sessions.length === 1 ? '' : 's'} · updated {relativeTime(index.generatedAt, now)}{:else if loading}Loading…{/if}
  </p>

  {#if error}
    <div class="empty"><span>!</span><h3>No session data</h3><p>The list is built by <code>~/.claude/sidequest-sessions/build.mjs</code> when a session starts and after each turn ({error}). Run <code>node ~/.claude/sidequest-sessions/build.mjs</code> once; this page checks again every 20 seconds.</p></div>
  {:else if index && !shown.length}
    <div class="empty"><span>□</span><h3>{searching ? 'Nothing matches' : 'No sessions yet'}</h3><p>{searching ? 'Try fewer words.' : 'Sessions show here once Claude Code has run one.'}</p></div>
  {:else}
    <div class="rows" role="list">
      {#each shown as s (s.id)}
        <article role="listitem" class:live={s.live}>
          <button class="open" onclick={() => (open = s.id)} title="Show what was done in this session">
            <span class="name">{#if s.live}<i class="dot" title="at work now"></i>{/if}{s.name}</span>
            <span class="prompt">{s.lastPrompt || 'Nothing asked'}</span>
          </button>
          <button class="sid" onclick={() => copyId(s.id)} title="Copy the session id">{copied === s.id ? 'copied' : s.id}</button>
          <span class="project" title={s.cwd}>{projectLabel(s)}{#if s.branch}<small>{s.branch}</small>{/if}</span>
          <span class="count" title={`${s.done} done of ${s.requests}${s.working ? `, ${s.working} at work` : ''}`}><span><b>{s.done}</b>/{s.requests}</span>{#if s.markdown}<small title="markdown files created">{s.markdown} md</small>{/if}</span>
          <time datetime={new Date(s.updatedAt).toISOString()} title={new Date(s.updatedAt).toLocaleString()}>{relativeTime(s.updatedAt, now)}</time>
        </article>
      {/each}
    </div>
  {/if}
</section>

<SessionDialog id={open} onclose={() => (open = null)} />

<style>
  .sessions { padding: 1.25rem; }
  h3, p { margin: 0; }
  .note { padding-bottom: .8rem; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: .78rem; }
  button { border: 1px solid var(--border); border-radius: var(--radius); padding: .45rem .65rem; background: var(--surface); color: inherit; font: inherit; font-size: .78rem; cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); } button:disabled { opacity: .6; cursor: default; }
  .rows { display: grid; }
  article { display: grid; grid-template-columns: minmax(14rem, 1fr) auto minmax(8rem, 14rem) 5.5rem 6rem; align-items: center; gap: .9rem; padding: .7rem 0; border-bottom: 1px solid var(--border); }
  .open { display: grid; gap: .2rem; padding: .35rem .5rem; border: 0; text-align: left; background: transparent; min-width: 0; }
  .open:hover { background: var(--surface-muted); color: inherit; }
  .name { display: flex; align-items: center; gap: .45rem; font-weight: 700; font-size: .9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prompt { color: var(--text-muted); font-size: .76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { flex: none; width: .5rem; height: .5rem; border-radius: 999px; background: var(--status-doing); box-shadow: 0 0 .5rem var(--status-doing); }
  .sid { padding: .2rem .45rem; border: 1px dashed var(--border); background: transparent; color: var(--text-muted); font: .68rem var(--font-mono); }
  .project { display: grid; color: var(--text-muted); font-size: .76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project small, .count small { color: var(--text-muted); font: .66rem var(--font-mono); }
  .count { display: grid; justify-items: end; font: .8rem var(--font-mono); color: var(--text-muted); } .count b { color: var(--success, var(--accent)); }
  time { color: var(--text-muted); font: .72rem var(--font-mono); text-align: right; }
  .empty { display: grid; justify-items: center; gap: .45rem; padding: 4rem 1rem; text-align: center; }
  .empty span { color: var(--accent); font-size: 2rem; } .empty p { max-width: 30rem; color: var(--text-muted); line-height: 1.5; }
  code { font-family: var(--font-mono); font-size: .8em; }
  @media (max-width: 900px) { article { grid-template-columns: minmax(0, 1fr) auto auto; } .sid, .project { display: none; } }
</style>
