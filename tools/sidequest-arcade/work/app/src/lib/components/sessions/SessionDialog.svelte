<script lang="ts">
  import Dialog from '../ui/Dialog.svelte';
  import RequestDetail from './RequestDetail.svelte';
  import MarkdownFileDialog from './MarkdownFileDialog.svelte';
  import { loadSession, markdownByPath, projectLabel, relativeTime, requestTitle, STATUS_MARK, stepsOf, duration, workedMs, type MarkdownFile, type Session } from '../../sessions/model';

  let { id, onclose }: { id: string | null; onclose: () => void } = $props();
  let session = $state<Session | null>(null);
  let error = $state('');
  let selected = $state<string | null>(null);
  let file = $state<MarkdownFile | null>(null);

  const ordered = $derived(session ? [...session.requests].reverse() : []);
  const current = $derived(session?.requests.find((r) => r.id === selected) ?? ordered[0] ?? null);
  const markdown = $derived(session ? markdownByPath(session) : new Map<string, MarkdownFile>());

  $effect(() => {
    const wanted = id;
    session = null;
    error = '';
    selected = null;
    if (!wanted) return;
    let stale = false;
    loadSession(wanted).then((s) => { if (!stale) session = s; }, (cause) => { if (!stale) error = cause instanceof Error ? cause.message : String(cause); });
    return () => { stale = true; };
  });

  const progress = (r: Session['requests'][number]) => {
    const { steps } = stepsOf(r, session?.requests ?? []);
    return steps.length ? `${steps.filter((s) => s.status === 'completed').length}/${steps.length}` : '';
  };
</script>

<Dialog open={id !== null} label="Session" wide class="session-dialog" onclose={onclose}>
  <div class="frame">
    <header>
      <div class="title">
        <p class="eyebrow">Session{#if session?.live} · <span class="live">at work now</span>{/if}</p>
        <h2>{session?.name ?? 'Loading…'}</h2>
        {#if session}
          <p class="meta">
            <code>{session.id}</code>
            <span title={session.cwd}>{projectLabel(session)}</span>
            {#if session.branch}<span>⎇ {session.branch}</span>{/if}
            <span title={new Date(session.startedAt).toLocaleString()}>started {relativeTime(session.startedAt)}</span>
            <span title={new Date(session.updatedAt).toLocaleString()}>last active {relativeTime(session.updatedAt)}</span>
            {#if session.costUsd !== undefined}<span>${session.costUsd.toFixed(2)}</span>{/if}
            <span title={session.from === 'glowup' ? 'recorded by glowup as the work happened' : 'read from the transcript'}>{session.requests.length} request{session.requests.length === 1 ? '' : 's'} · {session.from}</span>
          </p>
        {/if}
      </div>
      <button class="close" onclick={onclose} aria-label="Close">✕</button>
    </header>

    {#if error}
      <p class="error">Could not read this session: {error}</p>
    {:else if session && !session.requests.length}
      <p class="error">Nothing was asked in this session.</p>
    {:else if session}
      <div class="body">
        <nav class="list" aria-label="Requests">
          {#each ordered as r (r.id)}
            <button class:active={current?.id === r.id} class={`req ${r.status}`} onclick={() => (selected = r.id)}>
              <span class="mark">{STATUS_MARK[r.status]}</span>
              <span class="text"><b>#{r.n}</b> {requestTitle(r) || '(empty prompt)'}</span>
              <small>{progress(r) ? `${progress(r)} · ` : ''}{duration(workedMs(r))}</small>
            </button>
          {/each}
          {#if session.markdown.length}
            <div class="files">
              <p class="eyebrow">Markdown created</p>
              {#each session.markdown as m (m.path)}
                {#if m.href}
                  <button class="file" onclick={() => (file = m)} title={m.path}>▤ {m.name}<small>#{m.request}</small></button>
                {:else}
                  <span class="file gone" title={`${m.path} (no longer there)`}>{m.name}<small>gone</small></span>
                {/if}
              {/each}
            </div>
          {/if}
        </nav>
        <div class="detail">
          {#if current}
            <RequestDetail request={current} {session} {markdown} onfile={(m) => (file = m)} onrequest={(rid) => (selected = rid)} />
          {/if}
        </div>
      </div>
    {:else}
      <p class="error">Loading…</p>
    {/if}
  </div>
</Dialog>

<MarkdownFileDialog {file} onclose={() => (file = null)} />

<style>
  :global(dialog.session-dialog) { inline-size: min(96rem, calc(100vw - 2 * var(--dialog-gutter))); block-size: min(66rem, calc(100dvh - 2 * var(--dialog-gutter))); }
  .frame { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
  header { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
  h2 { margin: .1rem 0 .3rem; font-family: var(--font-serif); font-size: 1.35rem; }
  .eyebrow { margin: 0; color: var(--text-muted); font-size: .68rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .live { color: var(--status-doing); }
  .meta { display: flex; flex-wrap: wrap; gap: .4rem .9rem; margin: 0; color: var(--text-muted); font-size: .75rem; }
  code { font-family: var(--font-mono); font-size: .72rem; color: var(--accent); }
  .close { align-self: start; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: inherit; padding: .3rem .55rem; cursor: pointer; }
  .close:hover { border-color: var(--accent); color: var(--accent); }
  .error { padding: 2rem 1.25rem; color: var(--text-muted); }
  .body { display: grid; grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr); min-height: 0; }
  .list { display: flex; flex-direction: column; gap: .2rem; padding: .75rem; overflow-y: auto; border-right: 1px solid var(--border); background: var(--bg-deep); }
  .req { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: .45rem; padding: .5rem .55rem; border: 0; border-radius: var(--radius); background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
  .req:hover { background: var(--surface-muted); } .req.active { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
  .req .mark { grid-row: span 2; font-family: var(--font-mono); color: var(--text-muted); }
  .req.completed .mark { color: var(--success, var(--status-done)); } .req.in_progress .mark { color: var(--accent); } .req.failed .mark { color: var(--danger); }
  .req .text { overflow: hidden; font-size: .8rem; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .req small { color: var(--text-muted); font: .68rem var(--font-mono); }
  .files { display: grid; gap: .2rem; margin-top: .9rem; padding-top: .7rem; border-top: 1px solid var(--border); }
  .file { display: flex; justify-content: space-between; gap: .5rem; padding: .35rem .5rem; border: 0; border-radius: var(--radius); background: transparent; color: var(--cyan, var(--accent)); text-align: left; font: .78rem var(--font-mono); cursor: pointer; overflow: hidden; }
  .file:hover { background: var(--surface-muted); } .file small { color: var(--text-muted); } .file.gone { color: var(--text-muted); text-decoration: line-through; cursor: default; }
  .detail { min-width: 0; overflow-y: auto; padding: 1rem 1.4rem 2rem; }
  @media (max-width: 820px) { .body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); } .list { max-height: 30vh; border-right: 0; border-bottom: 1px solid var(--border); } }
</style>
