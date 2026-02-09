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
import { publishGeneratedApp, runAppLifecycle } from "./app-lifecycle";
import {
  appendDigitalReviewRound,
  convertFindingsToUserStories,
  generateValueGrowthStories,
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

function parseClampedIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, raw));
}

function summarizeQualityDiagnostics(diagnostics: string[]): string[] {
  const hints = new Set<string>();
  for (const line of diagnostics) {
    const normalized = line.toLowerCase();
    if (normalized.includes("org.springframework.format:spring-format")) {
      hints.add("Fix backend pom.xml: remove invalid dependency org.springframework.format:spring-format.");
    }
    if (normalized.includes("eslint couldn't find a configuration file") || normalized.includes("no-config-found")) {
      hints.add("Fix frontend linting: add eslint config (eslint.config.js or .eslintrc) or align lint script with available config.");
    }
    if (normalized.includes("rollup failed to resolve import \"axios\"") || normalized.includes("could not resolve import \"axios\"")) {
      hints.add("Fix frontend dependencies: add axios to package.json dependencies or replace axios import with installed client.");
    }
    if (normalized.includes("could not resolve entry module \"index.html\"")) {
      hints.add("Fix frontend vite bootstrap: ensure frontend/index.html exists and points to src/main.tsx.");
    }
    if (normalized.includes("expected at least 8 tests")) {
      hints.add("Add automated tests to reach minimum quality bar (at least 8 tests across critical flows).");
    }
    if (normalized.includes("cannot find module 'supertest'")) {
      hints.add("Add supertest to devDependencies and ensure tests run with installed test libraries.");
    }
    if (normalized.includes("cannot find module 'knex'")) {
      hints.add("Add knex (and required db driver) to dependencies and verify db bootstrap imports.");
    }
    if (normalized.includes("\".\" no se reconoce como un comando interno o externo") || normalized.includes("./smoke.sh")) {
      hints.add("Replace shell-based smoke command with cross-platform npm/node command (no ./smoke.sh).");
    }
    if (normalized.includes("failed to start server") || normalized.includes("process.exit called with \"1\"")) {
      hints.add("Refactor server entrypoint: export app for tests and move app.listen/process.exit to a separate startup file.");
    }
    if (normalized.includes("'describe' is not defined") || normalized.includes("'test' is not defined") || normalized.includes("'expect' is not defined")) {
      hints.add("Fix ESLint test environment: enable jest globals (env.jest=true) for test files.");
    }
    if (normalized.includes("haste module naming collision")) {
      hints.add("Avoid nested duplicated app folders/package.json names; keep a single project root structure.");
    }
    if (normalized.includes("no-unused-vars") || normalized.includes("unexpected console statement")) {
      hints.add("Fix lint blockers or adjust lint config/rules so lint passes in CI without warnings-as-errors failures.");
    }
    if (normalized.includes("eslint couldn't find a configuration file")) {
      hints.add("Create and commit eslint config at project root to support npm run lint.");
    }
    if (normalized.includes("missing sql schema file")) {
      hints.add("Add schema.sql with tables, keys, indexes, and constraints for relational domain.");
    }
    if (normalized.includes("missing java dto layer")) {
      hints.add("Add Java DTO package and DTO classes for request/response boundaries.");
    }
    if (normalized.includes("missing bean validation")) {
      hints.add("Add Bean Validation annotations and jakarta/javax.validation imports with @Valid at controller boundaries.");
    }
    if (normalized.includes("missing global exception handling")) {
      hints.add("Add @RestControllerAdvice global exception handler in backend.");
    }
    if (normalized.includes("missing backend telemetry config")) {
      hints.add("Add Spring Actuator/Prometheus telemetry config in application.yml/properties.");
    }
  }
  return [...hints];
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
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((part) => String(part).padStart(2, "0")).join("");
  const base = seed.length > 0 ? seed : flow.toLowerCase();
  return `autopilot-${base}-${date}-${time}`;
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
  const iterations = runtimeFlags.iterations;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10) {
    printError("SDD-1005", "Invalid --iterations value. Use an integer between 1 and 10.");
    return;
  }

  console.log("Hello from sdd-cli.");
  console.log(`Workspace: ${workspace.root}`);
  if (beginnerMode) {
    printBeginnerTip(true, "I will explain each step and tell you what happens next.");
  }
  if (autoGuidedMode) {
    const minQualityRounds = parseClampedIntEnv("SDD_MIN_QUALITY_ROUNDS", 2, 1, 10);
    const requiredApprovalStreak = parseClampedIntEnv("SDD_REQUIRED_APPROVAL_STREAK", 2, 1, 3);
    printWhy("Auto-guided mode active: using current workspace defaults.");
    printWhy(`AI provider preference: ${provider ?? "gemini"}`);
    printWhy(`Iterations configured: ${iterations}`);
    printWhy(`Minimum quality rounds: ${minQualityRounds}; approval streak required: ${requiredApprovalStreak}`);
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
    if (!runtimeFlags.project && activeProject && projects.some((project) => project.name === activeProject)) {
      const suffix = Date.now().toString().slice(-5);
      activeProject = `${activeProject}-${suffix}`;
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
        const digitalReviewExpected =
          process.env.SDD_DISABLE_APP_LIFECYCLE !== "1" &&
          process.env.SDD_DISABLE_AI_AUTOPILOT !== "1" &&
          process.env.SDD_DISABLE_DIGITAL_REVIEW !== "1";
        let lifecycle = runAppLifecycle(projectRoot, activeProject, {
          goalText: text,
          intentSignals: intent.signals,
          intentDomain: intent.domain,
          intentFlow: intent.flow,
          deferPublishUntilReview: digitalReviewExpected
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
            const condensed = summarizeQualityDiagnostics(lifecycle.qualityDiagnostics);
            const repair = improveGeneratedApp(
              appDir,
              text,
              provider,
              [...lifecycle.qualityDiagnostics, ...condensed, "Prioritize fixing build/test/lint/runtime blockers first."],
              intent.domain
            );
            if (repair.attempted && repair.applied) {
              printWhy(`AI repair attempt ${attempt} applied (${repair.fileCount} files). Re-running lifecycle checks.`);
              lifecycle = runAppLifecycle(projectRoot, activeProject, {
                goalText: text,
                intentSignals: intent.signals,
                intentDomain: intent.domain,
                intentFlow: intent.flow,
                deferPublishUntilReview: digitalReviewExpected
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
          let deliveryApproved = false;
          let approvalStreak = 0;
          const minQualityRounds = parseClampedIntEnv("SDD_MIN_QUALITY_ROUNDS", 2, 1, 10);
          const requiredApprovalStreak = parseClampedIntEnv("SDD_REQUIRED_APPROVAL_STREAK", 2, 1, 3);
          const maxExtraIterations = parseClampedIntEnv("SDD_MAX_EXTRA_ITERATIONS", 2, 0, 5);
          const plannedRounds = Math.max(iterations, minQualityRounds);
          const maxRounds = Math.min(10, plannedRounds + maxExtraIterations);
          for (let round = 1; round <= maxRounds; round += 1) {
            if (round > plannedRounds) {
              printWhy(`Iteration ${round}/${maxRounds}: extending rounds because quality bar is still unmet.`);
            } else {
              printWhy(`Iteration ${round}/${plannedRounds}: running multi-persona digital review.`);
            }
            let review = runDigitalHumanReview(appDir, {
              goalText: text,
              intentSignals: intent.signals,
              intentDomain: intent.domain,
              intentFlow: intent.flow
            });
            let stories = convertFindingsToUserStories(review.findings);
            const reviewPath = writeDigitalReviewReport(appDir, review);
            const storiesPath = writeUserStoriesBacklog(appDir, stories);
            appendDigitalReviewRound(appDir, round, review, stories);
            if (reviewPath) {
              printWhy(`Digital-review report: ${reviewPath}`);
            }
            if (storiesPath) {
              printWhy(`Digital-review user stories: ${storiesPath} (${stories.length} stories)`);
            }

            let storyDiagnostics = storiesToDiagnostics(stories);
            if (review.passed) {
              approvalStreak += 1;
            } else {
              approvalStreak = 0;
            }
            const needsMoreConfidence = round < plannedRounds || approvalStreak < requiredApprovalStreak;
            if (review.passed && needsMoreConfidence) {
              const valueStories = generateValueGrowthStories({
                goalText: text,
                domain: intent.domain,
                round
              });
              stories = [...stories, ...valueStories];
              storyDiagnostics = storiesToDiagnostics(stories);
              writeUserStoriesBacklog(appDir, stories);
              appendDigitalReviewRound(appDir, round, review, stories);
              printWhy(
                `Iteration ${round}: base quality approved (${review.summary}). Approval streak ${approvalStreak}/${requiredApprovalStreak}; executing value-growth stories.`
              );
            } else if (review.passed) {
              printWhy(`Iteration ${round}: digital reviewers approved (${review.summary}).`);
              deliveryApproved = true;
              break;
            } else {
              printWhy(`Iteration ${round}: reviewers requested improvements (${review.summary}).`);
              review.diagnostics.forEach((issue) => printWhy(`Reviewer issue: ${issue}`));
            }

            const repair = improveGeneratedApp(
              appDir,
              text,
              provider,
              [
                ...review.diagnostics,
                ...storyDiagnostics,
                ...summarizeQualityDiagnostics(review.diagnostics),
                "Implement all prioritized user stories before next review."
              ],
              intent.domain
            );
            if (!repair.attempted || !repair.applied) {
              printWhy(`Iteration ${round}: repair skipped (${repair.reason || "unknown reason"}).`);
              break;
            }
            printWhy(`Iteration ${round}: repair applied (${repair.fileCount} files). Re-validating lifecycle.`);
            lifecycle = runAppLifecycle(projectRoot, activeProject, {
              goalText: text,
              intentSignals: intent.signals,
              intentDomain: intent.domain,
              intentFlow: intent.flow,
              deferPublishUntilReview: digitalReviewExpected
            });
            lifecycle.summary.forEach((line) => printWhy(`Lifecycle (iteration ${round}): ${line}`));
            if (!lifecycle.qualityPassed) {
              printWhy("Quality gates failed after story implementation. Applying one quality-repair pass.");
              const qualityRepair = improveGeneratedApp(
                appDir,
                text,
                provider,
                [...lifecycle.qualityDiagnostics, ...summarizeQualityDiagnostics(lifecycle.qualityDiagnostics)],
                intent.domain
              );
              if (qualityRepair.attempted && qualityRepair.applied) {
                lifecycle = runAppLifecycle(projectRoot, activeProject, {
                  goalText: text,
                  intentSignals: intent.signals,
                  intentDomain: intent.domain,
                  intentFlow: intent.flow,
                  deferPublishUntilReview: digitalReviewExpected
                });
              }
            }
            if (!lifecycle.qualityPassed) {
              printWhy(`Iteration ${round}: lifecycle quality still failing.`);
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
            appendDigitalReviewRound(appDir, round, review, stories);
            if (review.passed) {
              approvalStreak += 1;
              if (round >= plannedRounds && approvalStreak >= requiredApprovalStreak) {
                printWhy(`Iteration ${round}: delivery improved and approved (${review.summary}).`);
                deliveryApproved = true;
                break;
              }
              printWhy(
                `Iteration ${round}: delivery improved (${review.summary}). Approval streak ${approvalStreak}/${requiredApprovalStreak}; continuing quality rounds.`
              );
            } else {
              approvalStreak = 0;
              printWhy(`Iteration ${round}: additional improvements still required (${review.summary}).`);
            }
          }
          if (!deliveryApproved) {
            printWhy("Digital-review quality bar not met after configured iterations.");
            printRecoveryNext(activeProject, "finish", text);
            return;
          }
          const publish = publishGeneratedApp(projectRoot, activeProject, {
            goalText: text,
            intentSignals: intent.signals,
            intentDomain: intent.domain,
            intentFlow: intent.flow
          });
          printWhy(`Publish after review: ${publish.summary}`);
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

