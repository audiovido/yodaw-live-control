import React,{useEffect,useMemo,useState} from "react";
import { createRoot } from "react-dom/client";
import { motion,AnimatePresence } from "motion/react";
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, Check, CheckCircle2,
  CircleDot, Clock3, Code2, GitBranch, GitCommitHorizontal,
  Layers3, ListTodo, RefreshCw, Search, ShieldAlert, Sparkles, X
} from "lucide-react";
import "./styles.css";

const fallback={generatedAt:null,projects:[]};

function fmtDate(v){
  if(!v) return "—";
  try{return new Intl.DateTimeFormat("fa-IR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));}
  catch{return v}
}
function progressOf(p){
  if(
    p.verification==="verified" &&
    Number.isFinite(p.progress)
  ){
    return p.progress;
  }

  return null;
}
function reportOf(p){
  let s=`${p.name}. `;

  if(p.verification==="verified"){
    s+=`وضعیت پروژه از قرارداد زنده و تأییدشده خوانده می‌شود. `;

    if(Number.isFinite(p.progress)){
      s+=`پیشرفت ثبت‌شده ${p.progress} درصد است. `;
    }

    s+=`${p.done?.length||0} کار انجام شده، ${p.doing?.length||0} کار در حال انجام و ${p.todo?.length||0} کار باقی مانده. `;
  }
  else if(p.verification==="partial"){
    s+=`GitHub به پروژه متصل است، اما وضعیت تسک‌ها هنوز قرارداد تأییدشده ندارد. درصد پیشرفت نمایش داده نمی‌شود. `;
  }
  else{
    s+=`Repository معتبر برای این پروژه هنوز متصل نشده است. `;
  }

  if(p.attention){
    s+=`این پروژه نیاز به بررسی دارد. ${p.attentionReason||""}. `;
  }

  if(
    p.verification==="verified" &&
    p.blockers?.[0]
  ){
    s+=`مانع اصلی: ${p.blockers[0]}`;
  }

  return s;
}
function speak(text){
  if(!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang="fa-IR"; u.rate=.95; speechSynthesis.speak(u);
}

function Ring({value,unknown}){
  const r=38,c=2*Math.PI*r,d=c*(1-value/100);
  return <div className="ringWrap">
    <svg viewBox="0 0 92 92">
      <circle className="ringBg" cx="46" cy="46" r={r}/>
      <circle className="ringFg" cx="46" cy="46" r={r} strokeDasharray={c} strokeDashoffset={d}/>
    </svg>
    <div><strong>{unknown?"SYNC":`${value}%`}</strong><span>progress</span></div>
  </div>
}

function Robot({project}){
  const text=reportOf(project);
  return <div className="robotBox">
    <div className="robotFace"><Bot size={22}/><span/></div>
    <div className="robotCopy">
      <b>Project Robot</b>
      <p>{text}</p>
    </div>
    <button className="iconBtn" onClick={()=>speak(text)} title="گزارش صوتی"><Activity size={17}/></button>
  </div>
}

function TaskColumn({title,items,type}){
  const icons={done:<CheckCircle2 size={17}/>,doing:<CircleDot size={17}/>,todo:<ListTodo size={17}/>};
  return <section className={`taskColumn ${type}`}>
    <header>{icons[type]}<b>{title}</b><span>{items?.length||0}</span></header>
    <div className="taskList">
      {(items?.length?items:["موردی ثبت نشده"]).map((x,i)=>
        <div key={i} className={`task ${!items?.length?"empty":""}`}>{items?.length&&<span className="taskBullet"/>}{x}</div>
      )}
    </div>
  </section>
}

function ProjectModal({p,onClose}){
  const progress=progressOf(p);
  return <motion.div className="modalBackdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <motion.div className="modal" initial={{opacity:0,y:28,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:20,scale:.98}} transition={{type:"spring",stiffness:360,damping:32}}>
      <button className="closeBtn" onClick={onClose}><X/></button>

      <div className="detailHero">
        <div>
          <div className="kicker">{p.kind}</div>
          <h2>{p.name}</h2>
          <p>{p.summary}</p>
          <VerificationBadge p={p}/>
          <div className="detailMeta">
            <span className={p.attention?"warn":"ok"}>{p.attention?<AlertTriangle size={14}/>:<Check size={14}/>} {p.attention?"نیاز به پیگیری":"وضعیت پایدار"}</span>
            {p.live?.pushedAt&&<span><Clock3 size={14}/> آخرین push: {fmtDate(p.live.pushedAt)}</span>}
          </div>
        </div>
        <Ring
          value={progress}
          unknown={
            p.verification!=="verified" ||
            !Number.isFinite(progress)
          }
        />
      </div>

      <Robot project={p}/>

      <div className="metricRow">
        <div><GitCommitHorizontal/><span>Latest commit</span><b>{p.live?.latestCommit?.sha||"—"}</b></div>
        <div><GitBranch/><span>Open PRs</span><b>{p.live?.openPRs??"—"}</b></div>
        <div><ListTodo/><span>Open issues</span><b>{p.live?.openIssues??"—"}</b></div>
        <div><Activity/><span>Workflow</span><b className={p.live?.workflow?.conclusion==="failure"?"bad":""}>{p.live?.workflow?.conclusion||p.live?.workflow?.status||"—"}</b></div>
      </div>

      <div className="taskGrid">
        <TaskColumn title="انجام شده" items={p.done} type="done"/>
        <TaskColumn title="در حال انجام" items={p.doing} type="doing"/>
        <TaskColumn title="باقی مانده" items={p.todo} type="todo"/>
      </div>

      <div className="bottomGrid">
        <section className="infoPanel">
          <header><ShieldAlert size={17}/><b>مشکلات و Blockerها</b></header>
          {p.blockers?.length?<ul>{p.blockers.map((x,i)=><li key={i}>{x}</li>)}</ul>:<p className="muted">Blocker بحرانی ثبت نشده.</p>}
          {p.attentionReason&&<div className="attentionNote"><AlertTriangle size={15}/>{p.attentionReason}</div>}
        </section>
        <section className="infoPanel">
          <header><Sparkles size={17}/><b>راهنمای اقدام بعدی</b></header>
          <p>{p.guide||"راهنما ثبت نشده است."}</p>
          <div className="repoBar">
            {p.repo?<a href={p.repo} target="_blank" rel="noreferrer"><GitBranch size={16}/> Repo <ArrowUpRight size={14}/></a>:<span className="muted"><GitBranch size={16}/> Repo هنوز resolve نشده</span>}
            {p.live?.contract&&<span className="contract">.yodaw/status.json ✓</span>}
          </div>
        </section>
      </div>

      {!!p.live?.recentCommits?.length&&<section className="commitsPanel">
        <header><Code2 size={17}/><b>Recent activity</b></header>
        {p.live.recentCommits.map(c=><a href={c.url} target="_blank" rel="noreferrer" key={c.sha}><code>{c.sha}</code><span>{c.message}</span><small>{fmtDate(c.date)}</small></a>)}
      </section>}
    </motion.div>
  </motion.div>
}


function VerificationBadge({p}){
  if(p.verification==="verified"){
    return <div className="verificationBadge verified">
      <CheckCircle2/>
      LIVE VERIFIED
    </div>
  }

  if(p.verification==="partial"){
    return <div className="verificationBadge partial">
      <AlertTriangle/>
      PARTIALLY VERIFIED
    </div>
  }

  return <div className="verificationBadge disconnected">
    <ShieldAlert/>
    NOT CONNECTED
  </div>
}

function Card({p,onOpen,index}){
  const progress=progressOf(p);
  return <motion.button className={`projectCard ${p.attention?"needsAttention":""}`} onClick={onOpen}
    initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:index*.035}}>
    <div className="cardTop">
      <div className="projectIcon"><Layers3/></div>
      <div className="statusPill">{p.attention?<><AlertTriangle/> پیگیری</>:<><Activity/> Active</>}</div>
    </div>
    <div>
      <span className="kind">{p.kind}</span>
      <h3>{p.name}</h3>
      <p>{p.summary}</p>
    </div>
    <VerificationBadge p={p}/>

    <div className="cardProgress">
      <div>
        <span>
          {p.verification==="verified"
            ? "پیشرفت تأییدشده"
            : "Progress"}
        </span>

        <b>
          {p.verification==="verified" && Number.isFinite(progress)
            ? `${progress}%`
            : "—"}
        </b>
      </div>

      <div className="bar">
        <i
          style={{
            width:
              p.verification==="verified" &&
              Number.isFinite(progress)
                ? `${progress}%`
                : "0%"
          }}
        />
      </div>
    </div>
    <div className="cardStats">
      <span><CheckCircle2/> {p.done?.length||0}</span>
      <span><CircleDot/> {p.doing?.length||0}</span>
      <span><ListTodo/> {p.todo?.length||0}</span>
      {p.live?.latestCommit&&<span className="sha"><GitCommitHorizontal/> {p.live.latestCommit.sha}</span>}
    </div>
    <footer>
      <span>{p.live?.pushedAt?fmtDate(p.live.pushedAt):"Repo sync نشده"}</span>
      <ArrowUpRight/>
    </footer>
  </motion.button>
}

function App(){
  const [data,setData]=useState(fallback);
  const [selected,setSelected]=useState(null);
  const [filter,setFilter]=useState("all");
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);
    try{
      const r=await fetch(`./status.json?t=${Date.now()}`,{cache:"no-store"});
      setData(await r.json());
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const list=useMemo(()=>data.projects.filter(p=>{
    if(filter==="attention"&&!p.attention)return false;
    if(filter==="active"&&!(p.doing?.length))return false;
    const q=query.trim().toLowerCase();
    return !q||[p.name,p.kind,p.summary,...(p.doing||[]),...(p.todo||[])].join(" ").toLowerCase().includes(q);
  }),[data,filter,query]);

  const totals=useMemo(()=>({
    projects:data.projects.length,
    doing:data.projects.filter(p=>p.doing?.length).length,
    attention:data.projects.filter(p=>p.attention).length,
    done:data.projects.reduce((n,p)=>n+(p.done?.length||0),0)
  }),[data]);

  return <div className="app">
    <div className="noise"/>
    <header className="hero">
      <div>
        <div className="brand"><span className="brandMark"><Bot/></span><span>YODAW</span><i>LIVE CONTROL</i></div>
        <h1>همه پروژه‌ها.<br/><em>یک نمای زنده.</em></h1>
        <p>وضعیت، تسک‌ها، مشکلات و GitHub activity — خلاصه و قابل فهم.</p>
      </div>
      <div className="syncBox">
        <div className="liveState"><i/><span>{loading?"SYNCING":"LIVE"}</span></div>
        <small>آخرین Sync</small>
        <b>{data.generatedAt?fmtDate(data.generatedAt):"—"}</b>
        <button onClick={load}><RefreshCw className={loading?"spin":""}/> بروزرسانی</button>
      </div>
    </header>

    <main className="container">
      <section className="overview">
        <div><span>PROJECTS</span><b>{totals.projects}</b><small>کل پروژه‌ها</small></div>
        <div><span>ACTIVE</span><b>{totals.doing}</b><small>در حال ساخت</small></div>
        <div><span>DONE ITEMS</span><b>{totals.done}</b><small>کار تکمیل‌شده</small></div>
        <div className={totals.attention?"attentionMetric":""}><span>ATTENTION</span><b>{totals.attention}</b><small>نیاز به پیگیری</small></div>
      </section>

      <section className="controls">
        <label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جستجو در پروژه‌ها و تسک‌ها…"/></label>
        <div className="segmented">
          {[["all","همه"],["active","در حال ساخت"],["attention","پیگیری"]].map(([v,t])=>
            <button className={filter===v?"active":""} onClick={()=>setFilter(v)} key={v}>{t}</button>
          )}
        </div>
      </section>

      <section className="grid">
        {list.map((p,i)=><Card p={p} index={i} key={p.id} onOpen={()=>setSelected(p)}/>)}
      </section>
    </main>

    <AnimatePresence>{selected&&<ProjectModal p={selected} onClose={()=>setSelected(null)}/>}</AnimatePresence>
  </div>
}

createRoot(document.getElementById("root")).render(<App/>);
