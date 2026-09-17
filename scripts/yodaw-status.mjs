import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

function values(name) {
  const result = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && args[i + 1]) {
      result.push(args[i + 1]);
      i++;
    }
  }

  return result;
}

const project = arg("project");

if (!project) {
  console.error("ERROR: --project is required");
  process.exit(2);
}

const file = path.join(
  ".yodaw",
  "projects",
  `${project}.json`
);

fs.mkdirSync(path.dirname(file), {
  recursive: true
});

let current = {};

if (fs.existsSync(file)) {
  try {
    current = JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch {
    current = {};
  }
}

const rawProgress = arg("progress");

const progress =
  rawProgress !== null
    ? Number(rawProgress)
    : current.progress ?? null;

if (
  progress !== null &&
  (
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 100
  )
) {
  console.error(
    "ERROR: progress must be between 0 and 100"
  );

  process.exit(3);
}

const done = values("done");
const doing = values("doing");
const todo = values("todo");
const blockers = values("blocker");

const output = {
  schemaVersion: 1,
  projectId: project,
  updatedAt: new Date().toISOString(),

  progress,

  done:
    done.length
      ? done
      : current.done || [],

  doing:
    doing.length
      ? doing
      : current.doing || [],

  todo:
    todo.length
      ? todo
      : current.todo || [],

  blockers:
    blockers.length
      ? blockers
      : current.blockers || [],

  guide:
    arg("guide") ??
    current.guide ??
    ""
};

fs.writeFileSync(
  file,
  JSON.stringify(output, null, 2) + "\n"
);

console.log(`STATUS_WRITTEN=${file}`);
console.log(JSON.stringify(output, null, 2));
