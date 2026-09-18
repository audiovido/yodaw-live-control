import React,{useEffect,useMemo,useRef,useState} from "react";
import { createRoot } from "react-dom/client";
import { motion,AnimatePresence } from "motion/react";
import {
  Activity, Bot, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDot,
  Clock3, Code2, Copy, Cpu, FileCode2, FlaskConical, GitBranch,
  GitCommitHorizontal, ListTodo, Loader2, PanelRightClose, PanelRightOpen,
  Play, RotateCcw, Search, ShieldCheck, Sparkles, Square, Terminal as TerminalIcon,
  X, XCircle
} from "lucide-react";
import "./kodgar.css";
import { api } from "./api.js";
import { isTerminal, useKodgarTasks, useTaskStream } from "./useKodgarTasks.js";

// ---------------------------------------------------------------- theme
const PHASE_META = {
  PLANNING:  { label:"Planning",  tone:"plan"  },
  PLANNED:   { label:"Planned",   tone:"plan"  },
  PREPARING: { label:"Preparing", tone:"plan"  },
  CODING:    { label:"Coding",    tone:"run"   },
  TESTING:   { label:"Testing",   tone:"run"   },
  VERIFYING: { label:"Verifying", tone:"run"   },
  COMMITTING:{ label:"Committing",tone:"run"   },
  COMPLETED: { label:"Completed", tone:"ok"    },
  BLOCKED:   { label:"Blocked",   tone:"warn"  },
  FAILED:    { label:"Failed",    tone:"err"   },
  CANCELLED: { label:"Cancelled", tone:"err"   },
  QUEUED:    { label:"Queued",    tone:"idle"  },
  CANCELLING:{ label:"Cancelling",tone:"warn"  },
  UNKNOWN:   { label:"…",         tone:"idle"  },
};

const EXECUTOR_LABEL = {
  "claude-code":"Claude Code",
  "codex":"Codex",
  "grok-cli":"Grok CLI",
  "kodgar-native":"Kodgar Native",
  auto:"Auto",
};

function executorLabel(id){
  if(!id) return "—";
  return EXECUTOR_LABEL[String(id).toLowerCase()] || String(id);
}

function phaseMeta(state){
  return PHASE_META[String(state||"").toUpperCase()] || PHASE_META.UNKNOWN;
}

function fmtElapsed(seconds){
  const total = Math.max(0, Math.floor(Number(seconds)||0));
  const m = Math.floor(total/60);
  const s = total%60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function fmtClock(ts){
  if(!ts) return "";
  try{
    return new Date(ts).toLocaleTimeString(undefined,{hour12:false});
  }catch{ return ""; }
}

function shortSha(sha){
  return sha ? String(sha).slice(0,7) : "—";
}

// Terminal lines derived ONLY from real events + snapshots.
function buildLines(events, task){
  const lines = [];
  const push = (kind, text, meta={}) => lines.push({kind, text, meta, ts:meta.ts});

  if(task?.created_at){
    push("user", task.goal || "", {ts: task.created_at});
  }

  const plan = task?.plan;
  if(plan && typeof plan === "object"){
    push("kodgar", `PLANNING — ${plan.summary || "analyzing repository"}`);
    const stack = [...(plan.languages||[]), ...(plan.frameworks||[])].join(" · ");
    if(stack) push("kodgar", `Stack: ${stack}`);
    if(plan.tools?.length) push("kodgar", `Tools: ${plan.tools.join(" · ")}`);
    push("kodgar", `Executor: ${executorLabel(plan.executor)} — ${plan.reason||""}`);
    if(plan.plan?.length) plan.plan.forEach((step,i)=>push("kodgar", `${i+1}. ${step}`));
    if(plan.acceptance?.length) plan.acceptance.forEach(a=>push("verify", `✓ ${a}`));
  }

  for(const event of events){
    const data = event.data||{};
    switch(event.type){
      case "planner.started": push("grok","Grok is analyzing repository…"); break;
      case "planner.completed": push("grok",`Plan ready (${data.backend||"grok"})`); break;
      case "executor.selected": push("kodgar",`Executor: ${executorLabel(data.executor)}`); break;
      case "executor.started": push("run",`Started ${executorLabel(data.executor)}`); break;
      case "executor.output": push("run", String(data.line||"")); break;
      case "executor.pid": if (data.pid) push("run", `pid ${data.pid}`); break;
      case "file.changed": push("file", `${data.path||"file"}  ${data.additions!=null?`+${data.additions}`:""}${data.deletions!=null?` -${data.deletions}`:""}`); break;
      case "test.started": push("run","Running tests…"); break;
      case "test.completed": push("verify",`Tests ${data.passed??0}/${(data.passed??0)+(data.failed??0)} PASS`); break;
      case "verification.started": push("verify","Verifying real evidence…"); break;
      case "verification.completed": push("verify",`Verification ${data.status||""}`); break;
      case "git.committed": push("git",`commit ${shortSha(data.commit)} — ${data.message||""}`); break;
      case "task.completed": push("ok",`COMPLETED — ${fmtElapsed(data.duration_seconds)}`); break;
      case "task.failed": push("err",`FAILED — ${data.reason||""}`); break;
      case "task.cancelled": push("err","CANCELLED"); break;
      case "task.blocked": push("warn",`BLOCKED — ${data.reason||""}`); break;
      case "task.state":
        if(data.state && !["QUEUED"].includes(data.state)){
          push("kodgar", `${data.state} — ${data.current_step||""} ${data.progress!=null?`(${data.progress}%)`:""}`);
        }
        break;
      default: break;
    }
  }
  return lines;
}

// ------------------------------------------------------------- app shell
function App(){
  const [selectedId, setSelectedId] = useState(null);
  const { tasks, counts, executors, connectionError, refresh } = useKodgarTasks();
  const active = useMemo(()=>tasks.filter(t=>!isTerminal(t.state)),[tasks]);
  const recent = useMemo(()=>tasks.filter(t=>isTerminal(t.state)).slice(0,20),[tasks]);

  useEffect(()=>{
    // Default-select the newest active task so the terminal is never
    // empty on a wide screen.
    if(!selectedId && active.length){ setSelectedId(active[0].id); }
  },[active, selectedId]);

  return (
    <div className="kx-app" dir="ltr">
      <Sidebar
        counts={counts}
        active={active}
        recent={recent}
        selectedId={selectedId}
        onSelect={setSelectedId}
        executors={executors}
        connectionError={connectionError}
      />
      <TerminalPane taskId={selectedId} tasks={tasks} onChanged={refresh} />
    </div>
  );
}

function Sidebar({counts, active, recent, selectedId, onSelect, executors, connectionError}){
  const [filter, setFilter] = useState("");
  const matches = (t)=> t.goal?.toLowerCase().includes(filter.toLowerCase());
  const executorChips = Object.entries(executors||{}).map(([id,info])=>({
    id,
    // Real health semantics from the backend: eligible is the routing
    // truth; healthy adds auth/model context for the tooltip.
    ok: Boolean(info?.eligible),
    healthy: Boolean(info?.healthy),
    error: info?.error_type || null,
    detail: info?.detail || "",
  }));

  return (
    <aside className="kx-side" dir="ltr">
      <div className="kx-brand">
        <div className="kx-logo">κ</div>
        <div>
          <div className="kx-brand-name">KODGAR</div>
          <div className="kx-brand-sub">background coding</div>
        </div>
      </div>

      <NewTaskForm onCreated={onSelect} />

      <div className="kx-side-search">
        <Search size={13}/>
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter tasks" />
      </div>

      <div className="kx-side-section">
        <div className="kx-side-title"><Activity size={12}/> Active {active.length ? `(${active.length})` : ""}</div>
        {active.length===0 && <div className="kx-empty">No active tasks</div>}
        {active.filter(matches).map(t=><TaskCard key={t.id} task={t} selected={t.id===selectedId} onSelect={onSelect}/>)}
      </div>

      <div className="kx-side-section">
        <div className="kx-side-title"><ListTodo size={12}/> Recent</div>
        {recent.length===0 && <div className="kx-empty">Nothing finished yet</div>}
        {recent.filter(matches).map(t=><TaskCard key={t.id} task={t} selected={t.id===selectedId} onSelect={onSelect}/>)}
      </div>

      <div className="kx-side-foot">
        <div className="kx-side-title"><Cpu size={12}/> Executors</div>
        <div className="kx-chips">
          {executorChips.length===0 && <span className="kx-chip">API offline</span>}
          {executorChips.map(c=>(
            <span key={c.id}
              className={`kx-chip ${c.ok?"on":""} ${(!c.ok && c.error)?"down":""}`}
              title={`${c.id}${c.error?` — ${c.error}`:""}${c.detail?`\n${c.detail.slice(0,200)}`:""}`}
            >{c.id}</span>
          ))}
        </div>
        {connectionError && <div className="kx-conn-err">{connectionError}</div>}
      </div>
    </aside>
  );
}

function NewTaskForm({onCreated}){
  const [goal, setGoal] = useState("");
  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  const submit = async (e)=>{
    e.preventDefault();
    if(!goal.trim() || busy) return;
    setBusy(true); setError("");
    try{
      const res = await api.submitTask(goal.trim(), repo.trim()? {repo: repo.trim()} : {});
      setHistory(h=>[goal.trim(), ...h.filter(g=>g!==goal.trim())].slice(0,20));
      setGoal("");
      if(onCreated) onCreated(res.task_id);
    }catch(err){
      setError(err.message || "submit failed");
    }finally{
      setBusy(false);
    }
  };

  return (
    <form className="kx-new" onSubmit={submit}>
      <textarea
        value={goal}
        onChange={e=>setGoal(e.target.value)}
        onKeyDown={(e)=>{
          if((e.metaKey||e.ctrlKey) && e.key==="Enter") submit(e);
        }}
        placeholder="Describe a task — Kodgar plans, codes and verifies it in the background…"
        rows={3}
      />
      <input
        className="kx-repo"
        value={repo}
        onChange={e=>setRepo(e.target.value)}
        placeholder="Repository path (optional)"
        spellCheck={false}
      />
      <div className="kx-new-row">
        <button type="submit" disabled={busy || !goal.trim()}>
          {busy ? <Loader2 size={13} className="kx-spin"/> : <Play size={13}/>}
          {busy ? "Submitting…" : "Run task"}
        </button>
        {error && <span className="kx-new-err">{error}</span>}
      </div>
      {history.length>0 && (
        <div className="kx-history">
          {history.slice(0,4).map(h=>(
            <button type="button" key={h} onClick={()=>setGoal(h)} title={h}>{h}</button>
          ))}
        </div>
      )}
    </form>
  );
}

function TaskCard({task, selected, onSelect}){
  const meta = phaseMeta(task.state);
  return (
    <button className={`kx-card ${selected?"sel":""}`} onClick={()=>onSelect(task.id)}>
      <div className="kx-card-goal">{task.goal}</div>
      <div className="kx-card-meta">
        <span className={`kx-badge tone-${meta.tone}`}>{meta.label}</span>
        <span className="kx-card-exec">{executorLabel(task.executor)}</span>
        <span className="kx-card-elapsed"><Clock3 size={11}/> {fmtElapsed(task.elapsed_seconds)}</span>
      </div>
      <div className="kx-card-progress">
        <div style={{width: `${task.progress ?? 0}%`}}/>
      </div>
      {task.current_step && <div className="kx-card-step">{task.current_step}</div>}
    </button>
  );
}

// --------------------------------------------------------------- terminal
function TerminalPane({taskId, tasks, onChanged}){
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const taskSummary = tasks.find(t=>t.id===taskId) || null;
  const { task: detail, events, connected } = useTaskStream(taskId);
  const task = detail || taskSummary;

  return (
    <main className="kx-main">
      <div className="kx-term-wrap">
        <ShellWindow taskId={taskId} task={task} events={events} connected={connected} onChanged={onChanged}/>
      </div>
      <Inspector
        task={task}
        open={inspectorOpen}
        onToggle={()=>setInspectorOpen(o=>!o)}
      />
    </main>
  );
}

function ShellWindow({taskId, task, events, connected, onChanged}){
  const lines = useMemo(()=>buildLines(events, task),[events, task]);
  const scroller = useRef(null);
  const pinned = useRef(true);

  useEffect(()=>{
    const el = scroller.current;
    if(el && pinned.current) el.scrollTop = el.scrollHeight;
  },[lines.length]);

  const onScroll = ()=>{
    const el = scroller.current;
    if(!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <section className="kx-shell">
      <div className="kx-shell-top">
        <span className="kx-dot red"/><span className="kx-dot yellow"/><span className="kx-dot green"/>
        <span className="kx-shell-title">
          kodgar — {task?.goal ? truncate(task.goal, 46) : "terminal"}
        </span>
        <span className={`kx-live ${connected?"on":""}`} title="live event stream">
          <CircleDot size={11}/> {connected?"LIVE":"SYNC"}
        </span>
      </div>
      <div className="kx-shell-body" ref={scroller} onScroll={onScroll}>
        {!taskId && <Welcome/>}
        {taskId && lines.map((line,i)=>(
          <TermLine key={i} line={line}/>
        ))}
        {taskId && !isTerminal(task?.state) && (
          <div className="kx-cursor-line">
            <span className="kx-cursor">▍</span>
          </div>
        )}
      </div>
      <PromptBar taskId={taskId} task={task} onChanged={onChanged}/>
    </section>
  );
}

function Welcome(){
  return (
    <div className="kx-welcome">
      <TerminalIcon size={22}/>
      <p>Select a task, or describe a new one in the sidebar.</p>
      <p className="kx-dim">Kodgar plans with Grok, executes with a real coding CLI,
      verifies the result and commits on an isolated worktree.</p>
    </div>
  );
}

const KIND_STYLE = {
  user:   {cls:"kx-l-user",   prefix:">"},
  kodgar: {cls:"kx-l-kodgar", prefix:"κ"},
  grok:   {cls:"kx-l-grok",   prefix:"◆"},
  run:    {cls:"kx-l-run",    prefix:"›"},
  file:   {cls:"kx-l-file",   prefix:"  +"},
  verify: {cls:"kx-l-verify", prefix:"✓"},
  git:    {cls:"kx-l-git",    prefix:"⑂"},
  ok:     {cls:"kx-l-ok",     prefix:"✔"},
  err:    {cls:"kx-l-err",    prefix:"✘"},
  warn:   {cls:"kx-l-warn",   prefix:"⚠"},
};

function TermLine({line}){
  const style = KIND_STYLE[line.kind] || KIND_STYLE.run;
  const [copied, setCopied] = useState(false);
  return (
    <div className={`kx-line ${style.cls}`} title={line.ts?fmtClock(line.ts):undefined}>
      <span className="kx-line-prefix">{style.prefix}</span>
      <span className="kx-line-text">{line.text}</span>
      {line.kind==="file" && (
        <button
          className="kx-copy"
          onClick={()=>{navigator.clipboard?.writeText(line.text); setCopied(true); setTimeout(()=>setCopied(false),900);}}
          title="copy"
        >{copied? <Check size={11}/> : <Copy size={11}/>}</button>
      )}
    </div>
  );
}

function PromptBar({taskId, task, onChanged}){
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const live = task && !isTerminal(task.state);

  const cancel = async ()=>{
    if(!taskId || busy) return;
    setBusy(true);
    try{ await api.cancelTask(taskId); onChanged?.(); }catch{ /* surfaced via stream */ }
    finally{ setBusy(false); }
  };

  const rerun = async ()=>{
    if(!task?.goal || busy) return;
    setBusy(true);
    try{
      const res = await api.submitTask(task.goal, task.repo? {repo: task.repo}: {});
      onChanged?.();
      if(res.task_id) window.location.hash = res.task_id;
    }catch{ /* surfaced inline */ }
    finally{ setBusy(false); }
  };

  return (
    <div className="kx-prompt">
      {live ? (
        <button className="kx-btn cancel" onClick={cancel} disabled={busy}>
          <Square size={12}/> Cancel
        </button>
      ) : (
        <button className="kx-btn rerun" onClick={rerun} disabled={busy || !task}>
          <RotateCcw size={12}/> Run again
        </button>
      )}
      <input
        value={text}
        onChange={e=>setText(e.target.value)}
        placeholder={taskId ? "Follow-up instruction (v2) — use Run again to resubmit this goal" : ""}
        disabled
      />
      <span className="kx-prompt-hint">one backend · real verification</span>
    </div>
  );
}

// -------------------------------------------------------------- inspector
function Inspector({task, open, onToggle}){
  return (
    <aside className={`kx-inspector ${open?"open":"closed"}`} dir="ltr">
      <button className="kx-insp-toggle" onClick={onToggle} title="toggle inspector">
        {open ? <PanelRightClose size={14}/> : <PanelRightOpen size={14}/>}
      </button>
      {open && (
        <div className="kx-insp-body">
          {!task ? <div className="kx-empty">No task selected</div> : <InspectorBody task={task}/>}
        </div>
      )}
    </aside>
  );
}

function InspectorBody({task}){
  const meta = phaseMeta(task.state);
  const plan = task.plan && typeof task.plan==="object" ? task.plan : null;
  const [diffOpen, setDiffOpen] = useState(false);
  const [diff, setDiff] = useState("");

  const loadDiff = async ()=>{
    if(diffOpen){ setDiffOpen(false); return; }
    try{
      const res = await api.getDiff(task.id);
      setDiff(res.diff||"(no diff available)");
    }catch(err){ setDiff(`(diff unavailable: ${err.message})`); }
    setDiffOpen(true);
  };

  return (
    <>
      <div className="kx-insp-head">
        <span className={`kx-badge tone-${meta.tone}`}>{meta.label}</span>
        <span className="kx-dim">{fmtClock(task.created_at)}</span>
      </div>
      <div className="kx-insp-goal">{task.goal}</div>

      <div className="kx-progress">
        <div className="kx-progress-bar"><div style={{width:`${task.progress??0}%`}}/></div>
        <div className="kx-progress-num">{task.progress??0}%</div>
      </div>
      {task.current_step && <div className="kx-step"><Loader2 size={11} className="kx-spin"/> {task.current_step}</div>}

      <Section title="Planner">
        <Row k="Planner" v={plan ? String(task.planner_backend||task.planner||"grok") : (task.planner||"grok")}/>
        <Row k="Task type" v={plan?.task_type || "—"}/>
        {plan?.summary && <div className="kx-plan-summary">{plan.summary}</div>}
      </Section>

      <Section title="Executor">
        <Row k="Executor" v={executorLabel(task.executor)}/>
        <Row k="Reason" v={plan?.reason || task.executor_reason || "—"}/>
      </Section>

      <Section title="Stack">
        <Row k="Languages" v={(plan?.languages||[]).join(", ")||"—"}/>
        <Row k="Frameworks" v={(plan?.frameworks||[]).join(", ")||"—"}/>
        <Row k="Tools" v={(plan?.tools||[]).join(" · ")||"—"}/>
      </Section>

      <Section title="Evidence">
        <Row k="Files changed" v={String(task.files_changed ?? "—")}/>
        <Row k="Tests" v={task.tests_passed!=null||task.tests_failed!=null ? `${task.tests_passed??0} / ${(task.tests_passed??0)+(task.tests_failed??0)}` : "—"}/>
        <Row k="Build" v={task.build_status || "—"}/>
        <Row k="Verify" v={task.verify_status || "—"}/>
        <Row k="Branch" v={task.branch || "—"}/>
        <Row k="Commit" v={task.commit_sha ? shortSha(task.commit_sha) : "—"}/>
        <Row k="Elapsed" v={fmtElapsed(task.elapsed_seconds)}/>
      </Section>

      {plan?.plan?.length>0 && (
        <Section title="Plan">
          <ol className="kx-plan-list">{plan.plan.map((s,i)=><li key={i}>{s}</li>)}</ol>
        </Section>
      )}

      {plan?.acceptance?.length>0 && (
        <Section title="Acceptance">
          <ul className="kx-accept">
            {plan.acceptance.map((a,i)=>(
              <li key={i}><ShieldCheck size={11}/> {a}</li>
            ))}
          </ul>
        </Section>
      )}

      {task.error && (
        <Section title="Error">
          <div className="kx-error">
            <XCircle size={12}/> {String(task.error.message||task.error.type||JSON.stringify(task.error))}
          </div>
        </Section>
      )}

      <div className="kx-actions">
        <button onClick={loadDiff}><FileCode2 size={12}/> {diffOpen?"Hide diff":"View diff"}</button>
        {task.commit_sha && (
          <button onClick={()=>navigator.clipboard?.writeText(task.commit_sha)}>
            <GitCommitHorizontal size={12}/> Copy commit
          </button>
        )}
      </div>
      {diffOpen && <pre className="kx-diff">{diff}</pre>}
    </>
  );
}

function Section({title, children}){
  return (
    <div className="kx-sec">
      <div className="kx-sec-title">{title}</div>
      {children}
    </div>
  );
}

function Row({k, v}){
  return (
    <div className="kx-row"><span className="kx-row-k">{k}</span><span className="kx-row-v">{v}</span></div>
  );
}

function truncate(text, n){
  return text && text.length>n ? `${text.slice(0,n-1)}…` : text;
}

// ------------------------------------------------------------------ boot
createRoot(document.getElementById("root")).render(<App/>);
