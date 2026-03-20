import { Command } from "commander";
import { TrustCommitRuntime } from "./runtime.js";
import { startHttpServer } from "./server.js";

const program = new Command();
program.name("trustcommit").description("TrustCommit agent runtime MVP");

program
  .command("runtime:init")
  .description("Initialize local runtime directories and SQLite database")
  .action(async () => {
    const runtime = new TrustCommitRuntime();
    await runtime.init();
    console.log("Initialized runtime at .trustcommit/");
  });

program
  .command("demo:bootstrap")
  .description("Deploy local demo contracts and seed local agent accounts")
  .action(async () => {
    const runtime = new TrustCommitRuntime();
    const config = await runtime.bootstrapDemo();
    console.log(JSON.stringify(config.addresses, null, 2));
  });

program
  .command("task:create")
  .requiredOption("--title <title>")
  .requiredOption("--instructions <instructions>")
  .option("--reward <reward>", "Reward in token base units", "10000000")
  .option("--stake <stake>", "Required stake in token base units", "500000000")
  .option("--deadline-hours <deadlineHours>", "Deadline window in hours", "24")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const task = await runtime.createTask({
      title: options.title,
      instructions: options.instructions,
      outputSchema: {
        taskTitle: "string",
        summary: "string",
        inspectedFiles: "string[]",
        notes: "string[]"
      },
      reward: Number(options.reward),
      requiredStake: Number(options.stake),
      deadlineHours: Number(options.deadlineHours)
    });
    console.log(JSON.stringify(task, null, 2));
  });

program
  .command("task:list")
  .action(() => {
    const runtime = new TrustCommitRuntime();
    console.log(JSON.stringify(runtime.listTasks(), null, 2));
  });

program
  .command("task:details")
  .requiredOption("--id <id>")
  .action((options) => {
    const runtime = new TrustCommitRuntime();
    const details = runtime.getTaskDetails(options.id);
    if (!details) {
      throw new Error(`Task not found: ${options.id}`);
    }
    console.log(JSON.stringify(details, null, 2));
  });

program
  .command("task:verify")
  .requiredOption("--id <id>")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const report = await runtime.verifyTask(options.id);
    console.log(JSON.stringify(report, null, 2));
  });

program
  .command("task:export")
  .requiredOption("--id <id>")
  .option("--out <out>", "Output directory for the portable bundle")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const result = await runtime.exportTaskBundle(options.id, options.out);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("task:run")
  .requiredOption("--id <id>")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const task = await runtime.runTask(options.id);
    console.log(JSON.stringify(task, null, 2));
  });

program
  .command("task:finalize")
  .requiredOption("--id <id>")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const task = await runtime.finalizeTask(options.id);
    console.log(JSON.stringify(task, null, 2));
  });

program
  .command("task:dispute")
  .requiredOption("--id <id>")
  .requiredOption("--reason <reason>")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const task = await runtime.disputeTask(options.id, options.reason);
    console.log(JSON.stringify(task, null, 2));
  });

program
  .command("arbiter:review")
  .requiredOption("--id <id>")
  .requiredOption("--winner <winner>")
  .requiredOption("--reason <reason>")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const task = await runtime.arbiterReview(options.id, options.winner, options.reason);
    console.log(JSON.stringify(task, null, 2));
  });

program
  .command("arbiter:auto")
  .requiredOption("--id <id>")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const task = await runtime.arbiterAutoReview(options.id);
    console.log(JSON.stringify(task, null, 2));
  });

program
  .command("providers:health")
  .option("--refresh", "Force a live provider probe instead of cache")
  .action(async (options) => {
    const runtime = new TrustCommitRuntime();
    const health = await runtime.getProviderHealth(Boolean(options.refresh));
    console.log(JSON.stringify(health, null, 2));
  });

program
  .command("agent:manifest")
  .description("Print the current executor agent manifest")
  .action(async () => {
    const runtime = new TrustCommitRuntime();
    await runtime.init();
    console.log(JSON.stringify(runtime.getAgentManifest(), null, 2));
  });

program
  .command("demo:run")
  .description("Run the full creator+executor happy-path demo on local Anvil")
  .action(async () => {
    const runtime = new TrustCommitRuntime();
    const result = await runtime.demoRun();
    console.log(
      JSON.stringify(
        {
          taskId: result.task.id,
          covenantId: result.task.covenantId,
          status: result.status,
          executorBalance: result.executorBalance.toString()
        },
        null,
        2
      )
    );
  });

program
  .command("demo:dispute")
  .description("Run the creator+executor+AI-arbiter dispute-path demo on local Anvil")
  .action(async () => {
    const runtime = new TrustCommitRuntime();
    const result = await runtime.demoDisputeRun();
    console.log(
      JSON.stringify(
        {
          taskId: result.task.id,
          covenantId: result.task.covenantId,
          status: result.status,
          executorBalance: result.executorBalance.toString()
        },
        null,
        2
      )
    );
  });

program
  .command("demo:remediation")
  .description("Run the remediation-commitment happy-path demo on local Anvil")
  .action(async () => {
    const runtime = new TrustCommitRuntime();
    const result = await runtime.demoRemediationRun();
    console.log(
      JSON.stringify(
        {
          taskId: result.task.id,
          covenantId: result.task.covenantId,
          status: result.status,
          executorBalance: result.executorBalance.toString()
        },
        null,
        2
      )
    );
  });

program
  .command("demo:policy")
  .description("Run the policy-commitment happy-path demo on local Anvil")
  .action(async () => {
    const runtime = new TrustCommitRuntime();
    const result = await runtime.demoPolicyRun();
    console.log(
      JSON.stringify(
        {
          taskId: result.task.id,
          covenantId: result.task.covenantId,
          status: result.status,
          executorBalance: result.executorBalance.toString()
        },
        null,
        2
      )
    );
  });

program
  .command("server:start")
  .option("--port <port>", "HTTP port", "3000")
  .action(async (options) => {
    const { url } = await startHttpServer(Number(options.port));
    console.log(`TrustCommit HTTP API listening on ${url}`);
  });

await program.parseAsync(process.argv);
