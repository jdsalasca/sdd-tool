import { classifyIntent, FLOW_PROMPT_PACKS } from "../router/intent";
import { ensureWorkspace, getWorkspaceInfo, listProjects } from "../workspace/index";
import { ask, askProjectName, confirm } from "../ui/prompt";
import { getPromptPackById, loadPromptPacks } from "../router/prompt-packs";
import { mapAnswersToRequirement } from "../router/prompt-map";
import { RequirementDraft, runReqCreate } from "./req-create";
import { getFlags, setFlags } from "../context/flags";
import { runReqPlan } from "./req-plan";
import { runReqStart } from "./req-start";
import { runReqFinish } from "./req-finish";
import { runRoute } from "./route";
import { runTestPlan } from "./test-plan";

function buildAutopilotDraft(input: string, flow: string, domain: string): RequirementDraft {
  const cleanInput = input.trim();
  const objective = cleanInput.length > 0 ? cleanInput : "Deliver a clear first requirement draft.";
  const scopeByFlow: Record<string, string> = {
    BUG_FIX: "Reproduce issue, isolate root cause, define fix",
    PR_REVIEW: "Review feedback, plan responses, track actions",
    SOFTWARE_FEATURE: "Core feature behavior and acceptance flow",
    DATA_SCIENCE: "Dataset, modeling approach, and evaluation plan",
    DESIGN: "Core design goals, accessibility, and deliverables",
    HUMANITIES: "Research question, sources, and analytical lens",
    BUSINESS: "Business objective, model assumptions, and constraints",
    LEGAL: "Applicable legal constraints and compliance requirements",
    LEARN: "Learning objective, structure, and practice outputs",
    GENERIC: "Core user need and initial delivery scope"
  };
  const outByFlow: Record<string, string> = {
    BUG_FIX: "Unrelated refactors not needed for this fix",
    PR_REVIEW: "Changes outside current PR scope",
    SOFTWARE_FEATURE: "Future enhancements after MVP",
    DATA_SCIENCE: "Production hardening beyond first iteration",
    DESIGN: "Full rebrand outside stated objective",
    HUMANITIES: "Unrelated historical periods or disciplines",
    BUSINESS: "Additional markets not in initial launch",
    LEGAL: "Jurisdictions outside selected compliance scope",
    LEARN: "Advanced topics outside current learning target",
    GENERIC: "Additional ideas to evaluate in next iteration"
  };
  const actorByDomain: Record<string, string> = {
    bug_fix: "developer, qa",
    pr_review: "reviewer, contributor",
    software: "end user, product owner, developer",
    data_science: "analyst, data scientist, stakeholder",
    design: "designer, end user, stakeholder",
    humanities: "researcher, reader",
    business: "customer, business owner, operator",
    legal: "legal team, compliance owner",
    learning: "learner, mentor",
    generic: "user, stakeholder"
  };
  const safeFlow = scopeByFlow[flow] ? flow : "GENERIC";
  const safeDomain = actorByDomain[domain] ? domain : "generic";
  return {
    domain: safeDomain === "generic" ? "software" : safeDomain,
    actors: actorByDomain[safeDomain],
    objective,
    scope_in: scopeByFlow[safeFlow],
    scope_out: outByFlow[safeFlow],
    acceptance_criteria: "A baseline requirement is generated and ready for refinement with stakeholders",
    nfr_security: "Follow secure defaults and data handling best practices",
    nfr_performance: "Set practical baseline targets for first delivery",
    nfr_availability: "Keep workflow usable and stable for normal usage",
    constraints: "Timebox first iteration, keep implementation simple",
    risks: "Ambiguity in requirements, underestimated scope",
    links: ""
  };
}

export async function runHello(input: string, runQuestions?: boolean): Promise<void> {
  function loadWorkspace() {
    const workspace = getWorkspaceInfo();
    ensureWorkspace(workspace);
    const projects = listProjects(workspace);
    return { workspace, projects };
  }

  let { workspace, projects } = loadWorkspace();

  console.log("Hello from sdd-cli.");
  console.log(`Workspace: ${workspace.root}`);
  const useWorkspace = await confirm("Use this workspace path? (y/n) ");
  if (!useWorkspace) {
    const nextPath = await ask("Workspace path to use (blank to exit): ");
    if (!nextPath) {
      console.log("Run again from the desired folder or pass --output <path>.");
      return;
    }
    setFlags({ output: nextPath });
    const reloaded = loadWorkspace();
    workspace = reloaded.workspace;
    projects = reloaded.projects;
    console.log(`Workspace updated: ${workspace.root}`);
  }

  const flags = getFlags();
  if (projects.length > 0) {
    console.log("Active projects:");
    projects.forEach((project) => {
      console.log(`- ${project.name} (${project.status})`);
    });
    const choice = await ask("Start new or continue? (new/continue) ");
    const normalized = choice.trim().toLowerCase();
    if (normalized === "continue") {
      const selected = flags.project || (await ask("Project to continue: "));
      if (!selected) {
        console.log("No project selected. Continuing with new flow.");
      } else if (!projects.find((project) => project.name === selected)) {
        console.log(`Project not found: ${selected}. Continuing with new flow.`);
      } else {
        setFlags({ project: selected });
        console.log(`Continuing: ${selected}`);
      }
    } else {
      console.log(`Selected: ${choice || "new"}`);
    }
  } else {
    console.log("No active projects found.");
  }

  const text = input || (await ask("Describe what you want to do: "));
  if (!text) {
    console.log("No input provided. Try again with a short description.");
    return;
  }
  const intent = classifyIntent(text);
  console.log(`Detected intent: ${intent.intent} -> ${intent.flow}`);
  console.log("Step 1/3: Intent detected.");
  const showRoute = await confirm("View route details now? (y/n) ");
  if (showRoute) {
    runRoute(text);
  } else {
    console.log("Next: run `sdd-cli route <your input>` to view details.");
  }

  const shouldRunQuestions = runQuestions === true;
  console.log("Step 2/3: Requirement setup.");
  if (shouldRunQuestions) {
    const packs = loadPromptPacks();
    const packIds = FLOW_PROMPT_PACKS[intent.flow] ?? [];
    const answers: Record<string, string> = {};
    for (const packId of packIds) {
      const pack = getPromptPackById(packs, packId);
      if (!pack) continue;
      console.log(`\n[${pack.id}]`);
      for (const question of pack.questions) {
        const response = await ask(`${question} `);
        answers[question] = response;
      }
    }
    console.log("\nCaptured answers:");
    Object.entries(answers).forEach(([question, response]) => {
      console.log(`- ${question} -> ${response}`);
    });

    if (runQuestions && Object.keys(answers).length > 0) {
      const mapped = mapAnswersToRequirement(answers);
      console.log("\nDraft requirement fields:");
      console.log(JSON.stringify(mapped, null, 2));
      const ok = await confirm("Generate requirement draft now? (y/n) ");
      if (ok) {
        const created = await runReqCreate(mapped, { autofill: true });
        if (created) {
          console.log(`Step 3/3: Draft created (${created.reqId}).`);
          console.log("Next suggested command: sdd-cli req refine");
        }
      }
    }
  } else {
    const activeProject = getFlags().project || (await askProjectName());
    if (!activeProject) {
      console.log("Project name is required to run autopilot.");
      return;
    }
    setFlags({ project: activeProject });
    const draft = buildAutopilotDraft(text, intent.flow, intent.domain);
    draft.project_name = activeProject;

    console.log("Step 3/7: Creating requirement draft automatically...");
    const created = await runReqCreate(draft, { autofill: true });
    if (!created) {
      console.log("Autopilot stopped at requirement creation.");
      return;
    }

    console.log(`Step 4/7: Planning requirement ${created.reqId}...`);
    const planned = await runReqPlan({
      projectName: activeProject,
      reqId: created.reqId,
      autofill: true,
      seedText: text
    });
    if (!planned) {
      console.log("Autopilot stopped at planning.");
      return;
    }

    console.log(`Step 5/7: Starting implementation plan for ${created.reqId}...`);
    const started = await runReqStart({
      projectName: activeProject,
      reqId: created.reqId,
      autofill: true,
      seedText: text
    });
    if (!started) {
      console.log("Autopilot stopped at start phase.");
      return;
    }

    console.log(`Step 6/7: Updating test plan for ${created.reqId}...`);
    const tested = await runTestPlan({
      projectName: activeProject,
      reqId: created.reqId,
      autofill: true,
      seedText: text
    });
    if (!tested) {
      console.log("Autopilot stopped at test planning.");
      return;
    }

    console.log(`Step 7/7: Finalizing requirement ${created.reqId}...`);
    const finished = await runReqFinish({
      projectName: activeProject,
      reqId: created.reqId,
      autofill: true,
      seedText: text
    });
    if (!finished) {
      console.log("Autopilot stopped at finish phase.");
      return;
    }
    console.log(`Autopilot completed successfully for ${created.reqId}.`);
    console.log(`Artifacts finalized at: ${finished.doneDir}`);
  }
}

