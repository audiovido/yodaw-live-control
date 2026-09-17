import fs from "node:fs";
import path from "node:path";

const seed = JSON.parse(fs.readFileSync("src/data/projects.seed.json","utf8"));
const token = process.env.DASHBOARD_GH_TOKEN || process.env.GITHUB_TOKEN || "";
const dashboardRepo = process.env.GITHUB_REPOSITORY || "";
const owner = process.env.DASHBOARD_OWNER || dashboardRepo.split("/")[0] || "";

const headers = {
  "Accept":"application/vnd.github+json",
  "X-GitHub-Api-Version":"2026-03-10",
  "User-Agent":"YODAW-Live-Control",
  ...(token ? {"Authorization":`Bearer ${token}`} : {})
};

async function api(url, allow404=false){
  const r = await fetch(url.startsWith("http") ? url : `https://api.github.com${url}`, {headers});
  if(allow404 && r.status===404) return null;
  if(!r.ok) throw new Error(`${r.status} ${r.statusText} ${url}`);
  return r.json();
}

function norm(s=""){ return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }

async function listOwnerRepos(){
  if(!owner) return [];
  let out=[];

  for(let page=1;page<=5;page++){
    const endpoint = process.env.DASHBOARD_GH_TOKEN
      ? `/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&per_page=100&page=${page}&sort=updated`
      : `/users/${owner}/repos?per_page=100&page=${page}&sort=updated`;

    const batch = await api(endpoint);

    out.push(...batch);

    if(batch.length < 100) break;
  }

  const unique = new Map();

  for(const repo of out){
    unique.set(repo.full_name, repo);
  }

  return [...unique.values()];
}

function resolveRepo(project,repos){
  const candidates = repos.filter(
    r => r.full_name !== dashboardRepo
  );

  if(project.repoFullName){
    const wanted=project.repoFullName.toLowerCase();

    const explicit=candidates.find(
      r => r.full_name.toLowerCase()===wanted
    );

    if(explicit) return explicit;
  }

  const aliases=(project.repoAliases||[]).map(norm);

  return candidates.find(
    r => aliases.includes(norm(r.name))
  ) || null;
}

async function getContract(full,projectId){
  const c = await api(
    `/repos/${full}/contents/.yodaw/projects/${projectId}.json`,
    true
  );
  if(!c?.content) return null;
  try {
    return JSON.parse(Buffer.from(c.content.replace(/\n/g,""),"base64").toString("utf8"));
  } catch { return null; }
}

function mergeContract(base,contract){
  if(!contract){
    return {
      ...base,
      progress:null,
      verification:"partial",
      verificationLabel:"PARTIALLY VERIFIED",
      statusSource:"seed",
      contractUpdatedAt:null
    };
  }

  const validProgress =
    Number.isFinite(contract.progress) &&
    contract.progress >= 0 &&
    contract.progress <= 100
      ? contract.progress
      : null;

  return {
    ...base,

    id:base.id,

    name:
      typeof contract.name==="string" && contract.name.trim()
        ? contract.name
        : base.name,

    kind:
      typeof contract.kind==="string" && contract.kind.trim()
        ? contract.kind
        : base.kind,

    summary:
      typeof contract.summary==="string" && contract.summary.trim()
        ? contract.summary
        : base.summary,

    progress:validProgress,

    done:
      Array.isArray(contract.done)
        ? contract.done
        : [],

    doing:
      Array.isArray(contract.doing)
        ? contract.doing
        : [],

    todo:
      Array.isArray(contract.todo)
        ? contract.todo
        : [],

    blockers:
      Array.isArray(contract.blockers)
        ? contract.blockers
        : [],

    guide:
      typeof contract.guide==="string"
        ? contract.guide
        : "",

    verification:"verified",
    verificationLabel:"LIVE VERIFIED",
    statusSource:"contract",
    contractUpdatedAt:contract.updatedAt || null
  };
}

function ageHours(date){
  if(!date) return null;
  return Math.round((Date.now()-new Date(date).getTime())/36e5);
}

async function hydrate(project,repos){
  const repo=resolveRepo(project,repos);
  if(!repo) return {
    ...project,
    progress:null,
    live:null,
    attention:true,
    attentionReason:"Repo پیدا نشد",
    verification:"disconnected",
    verificationLabel:"NOT CONNECTED",
    statusSource:"seed",
    contractUpdatedAt:null
  };

  const full=repo.full_name;
  let [commits,pulls,issues,runs,contract] = await Promise.all([
    api(`/repos/${full}/commits?per_page=6`).catch(()=>[]),
    api(`/repos/${full}/pulls?state=open&per_page=20`).catch(()=>[]),
    api(`/repos/${full}/issues?state=open&per_page=40`).catch(()=>[]),
    api(`/repos/${full}/actions/runs?per_page=5`).catch(()=>({workflow_runs:[]})),
    getContract(full,project.id).catch(()=>null)
  ]);

  const p=mergeContract(project,contract);
  const realIssues=(issues||[]).filter(x=>!x.pull_request);
  const latestRun=runs?.workflow_runs?.[0]||null;
  const pushedHours=ageHours(repo.pushed_at);
  const attention = pushedHours===null || pushedHours>72 ||
    (latestRun && latestRun.conclusion && !["success","skipped","neutral"].includes(latestRun.conclusion));

  return {
    ...p,
    repo:repo.html_url,
    attention,
    attentionReason: pushedHours>72 ? `بیش از ${Math.floor(pushedHours/24)} روز بدون push` :
      (latestRun?.conclusion && latestRun.conclusion!=="success" ? `Workflow: ${latestRun.conclusion}` : null),
    live:{
      pushedAt:repo.pushed_at,
      updatedAt:repo.updated_at,
      defaultBranch:repo.default_branch,
      language:repo.language,
      openPRs:pulls.length,
      openIssues:realIssues.length,
      latestCommit:commits?.[0] ? {
        sha:commits[0].sha.slice(0,8),
        message:(commits[0].commit?.message||"").split("\n")[0],
        date:commits[0].commit?.committer?.date
      } : null,
      recentCommits:(commits||[]).slice(0,5).map(c=>({
        sha:c.sha.slice(0,8),
        message:(c.commit?.message||"").split("\n")[0],
        date:c.commit?.committer?.date,
        url:c.html_url
      })),
      workflow:latestRun ? {
        name:latestRun.name,
        status:latestRun.status,
        conclusion:latestRun.conclusion,
        url:latestRun.html_url,
        updatedAt:latestRun.updated_at
      }:null,
      contract:!!contract,
      verification:p.verification,
      verificationLabel:p.verificationLabel,
      contractUpdatedAt:p.contractUpdatedAt
    }
  };
}

const repos=await listOwnerRepos().catch(()=>[]);
const projects=[];
for(const p of seed){
  try{ projects.push(await hydrate(p,repos)); }
  catch(e){ projects.push({...p,live:null,attention:true,attentionReason:String(e.message||e)}); }
}

const payload={
  generatedAt:new Date().toISOString(),
  owner,
  refreshMinutes:5,
  projects
};
fs.mkdirSync("public",{recursive:true});
fs.writeFileSync("public/status.json",JSON.stringify(payload,null,2));
console.log(`Synced ${projects.length} projects; resolved ${projects.filter(p=>p.repo).length} repos.`);
