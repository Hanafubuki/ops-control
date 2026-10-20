<script lang="ts">
  import { codeCopy, renderMarkdown } from '../ticket/markdown';
  import { currentMilestone, duration, forYou, MILESTONE_MARK, MILESTONE_WORD, standing, STATUS_MARK, stepsOf, totals, workedMs, type MarkdownFile, type Session, type SessionRequest } from '../../sessions/model';

  let { request: r, session, markdown, onfile, onrequest }: {
    request: SessionRequest;
    session: Session;
    markdown: Map<string, MarkdownFile>;
    onfile: (file: MarkdownFile) => void;
    onrequest: (id: string) => void;
  } = $props();

  const steps = $derived(stepsOf(r, session.requests));
  const at = $derived(currentMilestone(steps.steps));
  const done = $derived(steps.steps.filter((s) => s.status === 'completed').length);
  const you = $derived(forYou(r, session.requests));
  const lines = $derived(totals(r));
  const host = $derived(r.foldedInto ? session.requests.find((x) => x.id === r.foldedInto) : undefined);
  const where = (path: string) => (session.cwd && path.startsWith(session.cwd.replace(/\/+$/, '') + '/') ? path.slice(session.cwd.replace(/\/+$/, '').length + 1) : path);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<article class="request">
  <header>
    <p class="eyebrow">Request #{r.n}</p>
    <p class="prompt">{r.text || '(empty prompt)'}</p>
    {#if host}<p class="muted">Sent while <button class="link" onclick={() => onrequest(host.id)}>#{host.n}</button> ran; that turn answered both.</p>{/if}
  </header>

  <dl class="facts">
    <dt>Status</dt>
    <dd><span class={`status ${r.status}`}>{STATUS_MARK[r.status]} {standing(r, session.requests)}</span></dd>
    <dt>Objective</dt>
    <dd class:muted={!(r.objective ?? host?.objective)}>{r.objective ?? host?.objective ?? (r.text.split('\n').find((l) => l.trim()) ?? '')}</dd>
    {#if at >= 0}
      <dt>Now</dt>
      <dd><b class="now">{steps.steps[at].title}</b>{#if steps.steps[at].doing}{` — ${steps.steps[at].doing}`}{/if}</dd>
    {/if}
    <dt>Milestones</dt>
    <dd>{#if steps.steps.length}{done} of {steps.steps.length} done{#if steps.from} <span class="muted">(from <button class="link" onclick={() => onrequest(steps.from!.id)}>#{steps.from.n}</button>{steps.fromTasks ? `'s task list` : ''})</span>{:else if steps.fromTasks} <span class="muted">(from the task list)</span>{/if}{:else}<span class="muted">none reported</span>{/if}</dd>
  </dl>

  {#if steps.steps.length}
    <section>
      <h3>Milestones</h3>
      <ol class="milestones">
        {#each steps.steps as s, i (i)}
          <li class={s.status} class:current={i === at}>
            <span class="mark" title={MILESTONE_WORD[s.status]}>{MILESTONE_MARK[s.status]}</span>
            <div>
              <span class="title">{s.title}</span>
              {#if (s.status === 'blocked' || s.status === 'waiting') && s.blocker}<small class="note">{s.status}: {s.blocker}</small>
              {:else if i === at && s.doing}<small class="note">{s.doing}</small>
              {:else if s.status === 'completed' && s.evidence}<small class="note">{s.evidence}</small>{/if}
            </div>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <section>
    <h3>What was done</h3>
    <p class="chips">
      {#if r.files.length}<span class="chip edit">✎ {plural(r.files.length, 'file')} <b class="add">+{lines.add}</b> <b class="del">−{lines.del}</b></span>{/if}
      {#if r.commandCount}<span class="chip">$ {plural(r.commandCount, 'command')}</span>{/if}
      {#if r.commits}<span class="chip">{plural(r.commits, 'commit')}</span>{/if}
      {#if r.test}<span class={`chip ${r.test.passed ? 'pass' : 'fail'}`}>{r.test.passed ? '✓ tests pass' : '✗ tests fail'}</span>{/if}
      {#if r.agents.length}<span class="chip">◆ {plural(r.agents.length, 'agent')}</span>{/if}
      <span class="chip muted">{plural(r.tools, 'tool call')}</span>
    </p>
    {#if !r.turns.length}
      <p class="muted">{r.status === 'in_progress' ? 'Working on it…' : r.status === 'pending' ? 'Waiting for its turn.' : 'Nothing was said.'}</p>
    {/if}
    {#each r.turns as turn, i (i)}
      {#if r.turns.length > 1}<p class="turn">Turn {i + 1} · {duration(turn.durationMs)}{turn.reason !== 'answer' ? ` · ${turn.reason === 'aborted' ? 'interrupted' : 'stopped'}` : ''}</p>{/if}
      {#if turn.answer}
        <div class="markdown answer" use:codeCopy>{@html renderMarkdown(turn.answer)}</div>
      {:else}
        <p class="muted">{turn.reason === 'aborted' ? 'Interrupted before an answer.' : turn.reason === 'answer' ? 'Claude said nothing more.' : 'Stopped before an answer.'}</p>
      {/if}
    {/each}
    {#if r.status === 'in_progress' && r.turns.length}<p class="muted">Working on it again…</p>{/if}
  </section>

  <section class="for-you">
    <h3>For you</h3>
    {#if you.empty}<p class="muted">{r.status === 'in_progress' ? 'Nothing asked of you so far.' : 'Nothing was asked of you.'}</p>{/if}
    {#if you.asked.length}
      <h4>Asked during the work</h4>
      <ul>{#each you.asked as q, i (i)}<li><span class="q">?</span> {q.question}<small class={q.answer === undefined ? 'open' : ''}>{q.answer !== undefined ? `you answered: ${q.answer}` : 'not answered'}</small></li>{/each}</ul>
    {/if}
    {#if you.questions.length}
      <h4>Questions</h4>
      <ul>{#each you.questions as q, i (i)}<li><span class="q">?</span> {q}</li>{/each}</ul>
    {/if}
    {#if you.actions.length}
      <h4>Action items</h4>
      <ul class="actions">{#each you.actions as a, i (i)}<li><span class="box">□</span> {a}</li>{/each}</ul>
    {/if}
  </section>

  {#if r.files.length}
    <section>
      <h3>Files · {r.files.length}</h3>
      <ul class="files">
        {#each r.files as f (f.path)}
          {@const md = markdown.get(f.path)}
          <li>
            {#if md}<button class="link" onclick={() => onfile(md)} title="Open">{where(f.path)}</button>{:else}<span title={f.path}>{where(f.path)}</span>{/if}
            {#if f.how === 'new'}<small class="new">new</small>{/if}
            <span class="lines"><b class="add">+{f.add}</b> <b class="del">−{f.del}</b></span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}


  {#if r.agents.length}
    <section>
      <h3>Agents · {r.agents.length}</h3>
      <ul>{#each r.agents as a, i (i)}<li><b class="agent">◆ {a.name}</b> {a.task}</li>{/each}</ul>
    </section>
  {/if}

  {#if !steps.fromTasks && r.tasks.length}
    <section>
      <h3>Tasks · {r.tasks.filter((t) => t.status === 'completed').length}/{r.tasks.length}</h3>
      <ul>{#each r.tasks as t (t.id)}<li class={t.status}><span class="mark">{t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '◉' : '○'}</span> {t.title}</li>{/each}</ul>
    </section>
  {/if}

  <p class="muted foot">{duration(workedMs(r))} worked{#if r.startedAt} · started {new Date(r.startedAt).toLocaleString()}{/if}{#if r.endedAt} · ended {new Date(r.endedAt).toLocaleString()}{/if}</p>
</article>

<style>
  .request { display: grid; gap: 1.1rem; }
  header { display: grid; gap: .35rem; }
  .eyebrow { margin: 0; color: var(--text-muted); font-size: .68rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .prompt { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-weight: 700; font-size: .95rem; line-height: 1.45; max-height: 14rem; overflow-y: auto; }
  .muted { color: var(--text-muted); }
  p { margin: 0; }
  .facts { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: .35rem .8rem; margin: 0; padding: .8rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); font-size: .84rem; }
  dt { color: var(--text-muted); font-size: .72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding-top: .1rem; } dd { margin: 0; overflow-wrap: anywhere; }
  .status { font-weight: 700; } .status.completed { color: var(--success, var(--status-done)); } .status.in_progress { color: var(--accent); } .status.failed { color: var(--danger); } .status.interrupted, .status.pending { color: var(--text-muted); }
  .now { color: var(--accent); }
  section { display: grid; gap: .55rem; }
  h3 { margin: 0; color: var(--accent); font-size: .78rem; letter-spacing: .1em; text-transform: uppercase; }
  h4 { margin: .3rem 0 0; font-size: .8rem; }
  ul, ol { display: grid; gap: .3rem; margin: 0; padding: 0; list-style: none; font-size: .84rem; }
  .milestones li { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr); gap: .3rem; padding: .3rem .4rem; border-radius: var(--radius); }
  .milestones li.current { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
  .milestones .mark { font-family: var(--font-mono); text-align: center; color: var(--text-muted); }
  .milestones .completed .mark { color: var(--success, var(--status-done)); } .milestones .completed .title, .milestones .skipped .title { color: var(--text-muted); }
  .milestones .in_progress .mark, .milestones .verifying .mark, .milestones .current .title { color: var(--accent); }
  .milestones .blocked .mark, .milestones .failed .mark { color: var(--danger); }
  .milestones .current .title { font-weight: 700; }
  .note { display: block; color: var(--text-muted); font-size: .76rem; } .blocked .note { color: var(--danger); }
  .chips { display: flex; flex-wrap: wrap; gap: .4rem; }
  .chip { padding: .2rem .55rem; border: 1px solid var(--border); border-radius: 999px; font: .74rem var(--font-mono); }
  .chip.pass { color: var(--success, var(--status-done)); } .chip.fail { color: var(--danger); }
  .add { color: var(--success, var(--status-done)); font-weight: 400; } .del { color: var(--danger); font-weight: 400; }
  .turn { color: var(--text-muted); font: .72rem var(--font-mono); margin-top: .4rem; }
  .answer { padding: .8rem 1rem; border-left: 3px solid var(--accent); background: var(--surface); border-radius: var(--radius); }
  .for-you ul li { padding: .1rem 0; } .q { color: var(--accent); font-weight: 700; } .box { color: var(--warning, var(--accent)); }
  .for-you small { display: block; margin-left: 1.1rem; color: var(--text-muted); font-size: .76rem; } .for-you small.open { color: var(--warning, var(--accent)); }
  .files li { display: flex; align-items: baseline; gap: .5rem; font: .78rem var(--font-mono); overflow-wrap: anywhere; } .files .lines { margin-left: auto; white-space: nowrap; }
  .new { flex: none; padding: 0 .35rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: .66rem; white-space: nowrap; }
  .agent { color: var(--agent, var(--accent)); }
  .link { padding: 0; border: 0; background: none; color: var(--cyan, var(--accent)); font: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; text-align: left; }
  .foot { font-size: .72rem; }
</style>
