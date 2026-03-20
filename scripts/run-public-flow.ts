import fs from "node:fs";
import path from "node:path";
import type { TaskSpec } from "../runtime/src/core/types.js";
import { TrustCommitRuntime } from "../runtime/src/runtime.js";
import { parseOption, preparePublicRuntimeContext } from "./public-runtime-context.js";

function writeJson(outputPath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
}

function procurementTaskSpec(): TaskSpec {
  return {
    title: "Select a compliant archive migration vendor",
    instructions:
      "Review the procurement brief and vendor quotes. Choose the best vendor under the stated budget, retention, and compliance constraints. Only produce a decision if the evidence trail stays consistent with the covenant.",
    outputSchema: {
      selectedVendor: "string",
      budgetAssessment: "string",
      complianceChecks: "string[]",
      summary: "string",
      notes: "string[]"
    },
    reward: 10_000_000,
    requiredStake: 500_000_000,
    deadlineHours: 24,
    commitmentProfile: "procurement_commitment",
    evidencePolicy: {
      requiredPaths: [
        "demo-fixtures/procurement-brief.md",
        "demo-fixtures/vendor-a.quote.json",
        "demo-fixtures/vendor-b.quote.json",
        "demo-fixtures/vendor-c.quote.json"
      ],
      rationale: [
        "Keep the procurement brief and candidate vendor quotes in the evidence set.",
        "The exported public bundle must preserve the files that justify the vendor decision."
      ]
    }
  };
}

async function main(): Promise<void> {
  const mode = parseOption("--mode", "submit");
  if (mode !== "submit" && mode !== "dispute") {
    throw new Error("Unsupported mode. Use --mode submit or --mode dispute.");
  }

  const context = await preparePublicRuntimeContext(process.cwd(), true);
  const runtime = new TrustCommitRuntime();
  await runtime.init();

  const task = await runtime.createTask(procurementTaskSpec());
  await runtime.runTask(task.id);
  const verification = await runtime.verifyTask(task.id);

  let finalStatus = runtime.getTask(task.id)?.status ?? "submitted";
  if (mode === "dispute") {
    await runtime.disputeTask(task.id, "Public review opened to challenge whether the selected vendor stayed inside the procurement covenant.");
    await runtime.arbiterAutoReview(task.id);
    finalStatus = runtime.getTask(task.id)?.status ?? finalStatus;
  }

  const exportDir = path.join(context.config.dataDir, "public-proof", task.id);
  const exported = await runtime.exportTaskBundle(task.id, exportDir);
  const details = runtime.getTaskDetails(task.id);
  if (!details) {
    throw new Error(`Task details missing after public flow: ${task.id}`);
  }

  const submitTxHash = details.receiptRecord?.receipts?.submitTxHash ?? null;
  const finalizeTxHash = details.receiptRecord?.receipts?.finalizeTxHash ?? null;
  const disputeTxHash = details.receiptRecord?.receipts?.disputeTxHash ?? null;
  const resolveTxHash = details.receiptRecord?.receipts?.resolveTxHash ?? null;

  const report = {
    ok: true,
    mode,
    rpcUrl: context.rpcUrl,
    chainId: context.chainId,
    taskId: task.id,
    covenantId: details.task.covenantId,
    status: finalStatus,
    verifierStatus: verification.status,
    verifierSummary: verification.summary,
    exportedBundleDir: exported.outputDir,
    contracts: {
      trustRegistry: context.config.addresses?.trustRegistry ?? null,
      covenant: context.config.addresses?.covenant ?? null,
      stakeToken: context.stakeTokenAddress,
      paymentToken: context.paymentTokenAddress
    },
    receipts: {
      createTxHash: details.receiptRecord?.receipts?.createTxHash ?? null,
      acceptTxHash: details.receiptRecord?.receipts?.acceptTxHash ?? null,
      submitTxHash,
      finalizeTxHash,
      disputeTxHash,
      resolveTxHash
    },
    proof: {
      proofHash: details.task.proofHash,
      receiptHead: details.receiptRecord?.headHash ?? null,
      anchoredReceiptHead: details.receiptRecord?.anchoredReceiptHead ?? null
    },
    nextStep:
      mode === "submit"
        ? "Public happy-path settlement requires the 7-day dispute window to expire before finalizeCompletion."
        : "Dispute path is complete. Use the tx hashes and exported bundle as public review evidence."
  };

  writeJson(path.join(exportDir, "public-flow-summary.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

await main();
