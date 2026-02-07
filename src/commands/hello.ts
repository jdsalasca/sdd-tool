import { classifyIntent, FLOW_PROMPT_PACKS } from "../router/intent";
import { ensureWorkspace, getWorkspaceInfo, listProjects } from "../workspace/index";
import { ask, confirm } from "../ui/prompt";
import { getPromptPackById, loadPromptPacks } from "../router/prompt-packs";
import { mapAnswersToRequirement } from "../router/prompt-map";
import { RequirementDraft, runReqCreate } from "./req-create";
import { getFlags, setFlags } from "../context/flags";
import { runReqPlan } from "./req-plan";
import { runReqStart } from "./req-start";
import { runReqFinish } from "./req-finish";
import { runRoute } from "./route";
import { runTestPlan } from "./test-plan";
import {
  AutopilotCheckpoint,
  AutopilotStep,
  AUTOPILOT_STEPS,
  clearCheckpoint,
  loadCheckpoint,
  nextStep,
  normalizeStep,
  saveCheckpoint
} from "./autopilot-checkpoint";

function printStep(step: string, description: string): void {
  console.log(`${step}: ${description}`);
}

function printWhy(message: string): void {
  console.log(`  -> ${message}`);
}

function printRecoveryNext(project: string, step: AutopilotStep, hint: string): void {
  console.log(`Next command: sdd-cli --project "${project}" --from-step ${step} hello "${hint}"`);
}

function deriveProjectName(input: string, flow: string): string {
  const seed = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 0)
    .slice(0, 4)
    .join("-");
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const base = seed.length > 0 ? seed : flow.toLowerCase();
  return `autopilot-${base}-${date}`;
}

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
  const runtimeFlags = getFlags();
  const hasDirectIntent = input.trim().length > 0;
  const shouldRunQuestions = runQuestions === true;
  const autoGuidedMode = !shouldRunQuestions && (runtimeFlags.nonInteractive || hasDirectIntent);

  console.log("Hello from sdd-cli.");
  console.log(`Workspace: ${workspace.root}`);
  if (autoGuidedMode) {
    printWhy("Auto-guided mode active: using current workspace defaults.");
  } else {
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
  }

  if (projects.length > 0) {
    console.log("Active projects:");
    projects.forEach((project) => {
      console.log(`- ${project.name} (${project.status})`);
    });
    if (runtimeFlags.project) {
      const selected = runtimeFlags.project.trim();
      if (!projects.find((project) => project.name === selected)) {
        console.log(`Project not found: ${selected}. Continuing with new flow.`);
      } else {
        setFlags({ project: selected });
        console.log(`Continuing: ${selected}`);
      }
    } else if (!autoGuidedMode) {
      const choice = await ask("Start new or continue? (new/continue) ");
      const normalized = choice.trim().toLowerCase();
      if (normalized === "continue") {
        const selected = await ask("Project to continue: ");
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
      console.log("Auto-selected: new flow.");
    }
  } else {
    console.log("No active projects found.");
  }

  let text = input || (await ask("Describe what you want to do: "));
  let checkpoint: AutopilotCheckpoint | null = null;
  let fromStep = normalizeStep(runtimeFlags.fromStep);
  let activeProjectForCheckpoint = runtimeFlags.project;
  if (!shouldRunQuestions && activeProjectForCheckpoint) {
    checkpoint = loadCheckpoint(activeProjectForCheckpoint);
    if (!text && checkpoint?.seedText) {
      text = checkpoint.seedText;
    }
    if (!fromStep && checkpoint?.lastCompleted) {
      const candidate = nextStep(checkpoint.lastCompleted);
      if (candidate) {
        fromStep = candidate;
      }
    }
  }

  if (!text) {
    console.log("No input provided. Try again with a short description.");
    return;
  }
  const intent = classifyIntent(text);
  console.log(`Detected intent: ${intent.intent} -> ${intent.flow}`);
  printStep("Step 1/7", "Intent detected");
  printWhy("I classified your goal and selected the best starting flow.");
  const showRoute = runQuestions === true ? await confirm("View route details now? (y/n) ") : false;
  if (showRoute && runQuestions === true) {
    runRoute(text);
  } else {
    console.log("Next: run `sdd-cli route <your input>` to view details.");
  }

  printStep("Step 2/7", "Requirement setup");
  printWhy("I will gather enough context to generate a valid first draft.");
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
          printStep("Step 3/7", `Draft created (${created.reqId})`);
          console.log("Next suggested command: sdd-cli req refine");
        }
      }
    }
  } else {
    let activeProject = getFlags().project;
    if (!activeProject) {
      if (autoGuidedMode) {
        activeProject = deriveProjectName(text, intent.flow);
      } else {
        const quickProject = await ask("Project name (optional, press Enter to auto-generate): ");
        activeProject = quickProject || deriveProjectName(text, intent.flow);
      }
    }
    if (!activeProject) {
      console.log("Project name is required to run autopilot.");
      return;
    }
    printWhy(`Using project: ${activeProject}`);
    setFlags({ project: activeProject });
    checkpoint = loadCheckpoint(activeProject);
    if (checkpoint && !fromStep) {
      const candidate = nextStep(checkpoint.lastCompleted);
      if (candidate) {
        fromStep = candidate;
      }
    }
    if (fromStep && !AUTOPILOT_STEPS.includes(fromStep)) {
      console.log(`Invalid --from-step value. Use one of: ${AUTOPILOT_STEPS.join(", ")}`);
      return;
    }

    const draft = buildAutopilotDraft(text, intent.flow, intent.domain);
    draft.project_name = activeProject;
    let reqId = checkpoint?.reqId ?? "";
    const startStep: AutopilotStep = fromStep ?? "create";
    if (startStep !== "create" && !reqId) {
      console.log("No checkpoint found for resume. Run full autopilot first or use --from-step create.");
      printRecoveryNext(activeProject, "create", text);
      return;
    }
    if (fromStep) {
      printWhy(`Resuming autopilot from step: ${fromStep}`);
    }

    const stepIndex = AUTOPILOT_STEPS.indexOf(startStep);
    for (let i = stepIndex; i < AUTOPILOT_STEPS.length; i += 1) {
      const step = AUTOPILOT_STEPS[i];
      if (step === "create") {
        printStep("Step 3/7", "Creating requirement draft automatically");
        printWhy("This creates your baseline scope, acceptance criteria, and NFRs.");
        const created = await runReqCreate(draft, { autofill: true });
        if (!created) {
          console.log("Autopilot stopped at requirement creation.");
          printRecoveryNext(activeProject, "create", text);
          return;
        }
        reqId = created.reqId;
      }

      if (step === "plan") {
        printStep("Step 4/7", `Planning requirement ${reqId}`);
        printWhy("I am generating functional, technical, architecture, and test artifacts.");
        const planned = await runReqPlan({
          projectName: activeProject,
          reqId,
          autofill: true,
          seedText: text
        });
        if (!planned) {
          console.log("Autopilot stopped at planning.");
          printRecoveryNext(activeProject, "plan", text);
          return;
        }
      }

      if (step === "start") {
        printStep("Step 5/7", `Preparing implementation plan for ${reqId}`);
        printWhy("This stage defines milestones, tasks, quality thresholds, and decisions.");
        const started = await runReqStart({
          projectName: activeProject,
          reqId,
          autofill: true,
          seedText: text
        });
        if (!started) {
          console.log("Autopilot stopped at start phase.");
          printRecoveryNext(activeProject, "start", text);
          return;
        }
      }

      if (step === "test") {
        printStep("Step 6/7", `Updating test plan for ${reqId}`);
        printWhy("I am ensuring critical paths, edge cases, and regression tests are documented.");
        const tested = await runTestPlan({
          projectName: activeProject,
          reqId,
          autofill: true,
          seedText: text
        });
        if (!tested) {
          console.log("Autopilot stopped at test planning.");
          printRecoveryNext(activeProject, "test", text);
          return;
        }
      }

      if (step === "finish") {
        printStep("Step 7/7", `Finalizing requirement ${reqId}`);
        printWhy("I will move artifacts to done state and generate project-level summary files.");
        const finished = await runReqFinish({
          projectName: activeProject,
          reqId,
          autofill: true,
          seedText: text
        });
        if (!finished) {
          console.log("Autopilot stopped at finish phase.");
          printRecoveryNext(activeProject, "finish", text);
          return;
        }
        clearCheckpoint(activeProject);
        console.log(`Autopilot completed successfully for ${reqId}.`);
        console.log(`Artifacts finalized at: ${finished.doneDir}`);
        return;
      }

      saveCheckpoint(activeProject, {
        project: activeProject,
        reqId,
        seedText: text,
        flow: intent.flow,
        domain: intent.domain,
        lastCompleted: step,
        updatedAt: new Date().toISOString()
      });
    }
  }
}

