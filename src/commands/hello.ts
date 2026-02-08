import { classifyIntent, FLOW_PROMPT_PACKS } from "../router/intent";
import path from "path";
import { ensureWorkspace, getWorkspaceInfo, listProjects } from "../workspace/index";
import { ask, confirm } from "../ui/prompt";
import { getPromptPackById, loadPromptPacks, PromptPack } from "../router/prompt-packs";
import { mapAnswersToRequirement } from "../router/prompt-map";
import { RequirementDraft, runReqCreate } from "./req-create";
import { getFlags, setFlags } from "../context/flags";
import { runReqPlan } from "./req-plan";
import { runReqStart } from "./req-start";
import { runReqFinish } from "./req-finish";
import { runRoute } from "./route";
import { runTestPlan } from "./test-plan";
import { recordActivationMetric } from "../telemetry/local-metrics";
import { printError } from "../errors";
import { bootstrapProjectCode, enrichDraftWithAI, improveGeneratedApp } from "./ai-autopilot";
import { runAppLifecycle } from "./app-lifecycle";
import {
  convertFindingsToUserStories,
  runDigitalHumanReview,
  storiesToDiagnostics,
  writeDigitalReviewReport,
  writeUserStoriesBacklog
} from "./digital-reviewers";
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

function printBeginnerTip(enabled: boolean, tip: string): void {
  if (!enabled) {
    return;
  }
  console.log(`  [Beginner] ${tip}`);
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
  recordActivationMetric("started", {
    directIntent: input.trim().length > 0,
    questionMode: runQuestions === true
  });

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
  const dryRun = runtimeFlags.dryRun;
  const beginnerMode = runtimeFlags.beginner;
  const provider = runtimeFlags.provider;

  console.log("Hello from sdd-cli.");
  console.log(`Workspace: ${workspace.root}`);
  if (beginnerMode) {
    printBeginnerTip(true, "I will explain each step and tell you what happens next.");
  }
  if (autoGuidedMode) {
    printWhy("Auto-guided mode active: using current workspace defaults.");
    printWhy(`AI provider preference: ${provider ?? "gemini"}`);
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
  const rawFromStep = runtimeFlags.fromStep?.trim();
  let fromStep = normalizeStep(rawFromStep);
  if (rawFromStep && !fromStep) {
    printError("SDD-1003", `Invalid --from-step value. Use one of: ${AUTOPILOT_STEPS.join(", ")}`);
    return;
  }
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
    printError("SDD-1001", "No input provided. Try again with a short description.");
    return;
  }
  const intent = classifyIntent(text);
  console.log(`Detected intent: ${intent.intent} -> ${intent.flow}`);
  printStep("Step 1/7", "Intent detected");
  printWhy("I classified your goal and selected the best starting flow.");
  printBeginnerTip(beginnerMode, "Intent helps me pick the right workflow and defaults.");
  const showRoute = runQuestions === true ? await confirm("View route details now? (y/n) ") : false;
  if (showRoute && runQuestions === true) {
    runRoute(text);
  } else {
    console.log("Next: run `sdd-cli route <your input>` to view details.");
  }

  printStep("Step 2/7", "Requirement setup");
  printWhy("I will gather enough context to generate a valid first draft.");
  printBeginnerTip(beginnerMode, "A requirement draft defines scope, acceptance criteria, and constraints.");
  if (shouldRunQuestions) {
    let packs: PromptPack[];
    try {
      packs = loadPromptPacks();
    } catch (error) {
      printError("SDD-1012", `Unable to load prompt packs: ${(error as Error).message}`);
      return;
    }
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
      printError("SDD-1002", "Project name is required to run autopilot.");
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
    const draft = enrichDraftWithAI(text, intent.flow, intent.domain, buildAutopilotDraft(text, intent.flow, intent.domain), provider);
    draft.project_name = activeProject;
    let reqId = checkpoint?.reqId ?? "";
    const startStep: AutopilotStep = fromStep ?? "create";
    if (startStep !== "create" && !reqId) {
      printError("SDD-1004", "No checkpoint found for resume. Run full autopilot first or use --from-step create.");
      printRecoveryNext(activeProject, "create", text);
      return;
    }
    if (fromStep) {
      printWhy(`Resuming autopilot from step: ${fromStep}`);
    }

    const stepIndex = AUTOPILOT_STEPS.indexOf(startStep);
    if (dryRun) {
      printWhy("Dry run active: previewing autopilot plan without writing files.");
      printBeginnerTip(beginnerMode, "Dry run is safe: it shows plan only and does not change files.");
      for (let i = stepIndex; i < AUTOPILOT_STEPS.length; i += 1) {
        const step = AUTOPILOT_STEPS[i];
        console.log(`Would run step: ${step}`);
      }
      console.log(`To execute for real: sdd-cli --project "${activeProject}" hello "${text}"`);
      return;
    }
    for (let i = stepIndex; i < AUTOPILOT_STEPS.length; i += 1) {
      const step = AUTOPILOT_STEPS[i];
      if (step === "create") {
        printStep("Step 3/7", "Creating requirement draft automatically");
        printWhy("This creates your baseline scope, acceptance criteria, and NFRs.");
        printBeginnerTip(beginnerMode, "After this, your requirement is ready for planning artifacts.");
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
        printBeginnerTip(beginnerMode, "Planning creates the blueprint before implementation.");
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
        printBeginnerTip(beginnerMode, "Start phase prepares execution details and quality guardrails.");
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
        printBeginnerTip(beginnerMode, "Testing focus reduces regressions before delivery.");
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
        printBeginnerTip(beginnerMode, "Finish locks outputs and leaves a reusable delivery record.");
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
        const projectRoot = path.resolve(finished.doneDir, "..", "..", "..");
        const codeBootstrap = bootstrapProjectCode(projectRoot, activeProject, text, provider, intent.domain);
        if (!codeBootstrap.generated) {
          printWhy(`Code generation blocked: ${codeBootstrap.reason || "provider did not return valid files"}.`);
          printWhy("No template fallback was applied. Re-run with clearer prompt or improve provider response contract.");
          printRecoveryNext(activeProject, "finish", text);
          return;
        }
        printWhy(`Code scaffold ready at: ${codeBootstrap.outputDir} (${codeBootstrap.fileCount} files)`);
        if (codeBootstrap.reason) {
          printWhy(`Code scaffold note: ${codeBootstrap.reason}`);
        }
        let lifecycle = runAppLifecycle(projectRoot, activeProject, {
          goalText: text,
          intentSignals: intent.signals,
          intentDomain: intent.domain,
          intentFlow: intent.flow
        });
        lifecycle.summary.forEach((line) => printWhy(`Lifecycle: ${line}`));
        const lifecycleDisabled = process.env.SDD_DISABLE_APP_LIFECYCLE === "1";
        if (!lifecycleDisabled && !lifecycle.qualityPassed) {
          const appDir = path.join(projectRoot, "generated-app");
          const parsedAttempts = Number.parseInt(process.env.SDD_AI_REPAIR_MAX_ATTEMPTS ?? "", 10);
          const maxRepairAttempts = Number.isFinite(parsedAttempts) && parsedAttempts > 0 ? parsedAttempts : 10;
          printWhy("Quality gates failed. Attempting AI repair iterations.");
          lifecycle.qualityDiagnostics.forEach((issue) => printWhy(`Quality issue: ${issue}`));
          for (let attempt = 1; attempt <= maxRepairAttempts && !lifecycle.qualityPassed; attempt += 1) {
            const repair = improveGeneratedApp(appDir, text, provider, lifecycle.qualityDiagnostics, intent.domain);
            if (repair.attempted && repair.applied) {
              printWhy(`AI repair attempt ${attempt} applied (${repair.fileCount} files). Re-running lifecycle checks.`);
              lifecycle = runAppLifecycle(projectRoot, activeProject, {
                goalText: text,
                intentSignals: intent.signals,
                intentDomain: intent.domain,
                intentFlow: intent.flow
              });
              lifecycle.summary.forEach((line) => printWhy(`Lifecycle (retry ${attempt}): ${line}`));
            } else {
              printWhy(`AI repair attempt ${attempt} skipped: ${repair.reason || "unknown reason"}`);
            }
          }
          if (!lifecycle.qualityPassed) {
            printWhy("Quality still failing after AI repair attempts. Stopping without template fallback.");
            printRecoveryNext(activeProject, "finish", text);
            return;
          }
        }
        const digitalReviewDisabled =
          lifecycleDisabled || process.env.SDD_DISABLE_AI_AUTOPILOT === "1" || process.env.SDD_DISABLE_DIGITAL_REVIEW === "1";
        if (!digitalReviewDisabled) {
          const appDir = path.join(projectRoot, "generated-app");
          const parsedReviewAttempts = Number.parseInt(process.env.SDD_DIGITAL_REVIEW_MAX_ATTEMPTS ?? "", 10);
          const maxReviewAttempts = Number.isFinite(parsedReviewAttempts) && parsedReviewAttempts > 0 ? parsedReviewAttempts : 3;
          let review = runDigitalHumanReview(appDir, {
            goalText: text,
            intentSignals: intent.signals,
            intentDomain: intent.domain,
            intentFlow: intent.flow
          });
          let stories = convertFindingsToUserStories(review.findings);
          const initialReviewReport = writeDigitalReviewReport(appDir, review);
          const initialStoriesPath = writeUserStoriesBacklog(appDir, stories);
          if (initialReviewReport) {
            printWhy(`Digital-review report: ${initialReviewReport}`);
          }
          if (initialStoriesPath) {
            printWhy(`Digital-review user stories: ${initialStoriesPath} (${stories.length} stories)`);
          }
          if (!review.passed) {
            printWhy(`Digital human reviewers found delivery issues (${review.summary}). Applying targeted refinements.`);
            review.diagnostics.forEach((issue) => printWhy(`Reviewer issue: ${issue}`));
          }
          for (let attempt = 1; attempt <= maxReviewAttempts && !review.passed; attempt += 1) {
            const storyDiagnostics = storiesToDiagnostics(stories);
            const repair = improveGeneratedApp(
              appDir,
              text,
              provider,
              [...review.diagnostics, ...storyDiagnostics, "Implement all user stories from digital review backlog."],
              intent.domain
            );
            if (!repair.attempted || !repair.applied) {
              printWhy(`Digital-review repair attempt ${attempt} skipped: ${repair.reason || "unknown reason"}`);
              break;
            }
            printWhy(`Digital-review repair attempt ${attempt} applied (${repair.fileCount} files).`);
            lifecycle = runAppLifecycle(projectRoot, activeProject, {
              goalText: text,
              intentSignals: intent.signals,
              intentDomain: intent.domain,
              intentFlow: intent.flow
            });
            lifecycle.summary.forEach((line) => printWhy(`Lifecycle (digital-review retry ${attempt}): ${line}`));
            if (!lifecycle.qualityPassed) {
              const qualityRepair = improveGeneratedApp(appDir, text, provider, lifecycle.qualityDiagnostics, intent.domain);
              if (qualityRepair.attempted && qualityRepair.applied) {
                printWhy(
                  `Quality regression repaired after digital review (${qualityRepair.fileCount} files). Re-validating delivery.`
                );
                lifecycle = runAppLifecycle(projectRoot, activeProject, {
                  goalText: text,
                  intentSignals: intent.signals,
                  intentDomain: intent.domain,
                  intentFlow: intent.flow
                });
              }
            }
            if (!lifecycle.qualityPassed) {
              printWhy("Delivery regressed below lifecycle quality gates during digital-review iteration.");
              continue;
            }
            review = runDigitalHumanReview(appDir, {
              goalText: text,
              intentSignals: intent.signals,
              intentDomain: intent.domain,
              intentFlow: intent.flow
            });
            stories = convertFindingsToUserStories(review.findings);
            writeDigitalReviewReport(appDir, review);
            writeUserStoriesBacklog(appDir, stories);
            if (!review.passed) {
              review.diagnostics.forEach((issue) => printWhy(`Reviewer issue (retry ${attempt}): ${issue}`));
            }
          }
          if (!review.passed) {
            printWhy("Digital-review quality bar not met after refinement attempts.");
            printRecoveryNext(activeProject, "finish", text);
            return;
          }
          printWhy(`Digital reviewers approved delivery quality (${review.summary}).`);
        }
        recordActivationMetric("completed", {
          project: activeProject,
          reqId
        });
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

