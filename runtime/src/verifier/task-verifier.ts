import { recoverMessageAddress, stringToHex } from "viem";
import type {
  ArtifactEnvelope,
  ProofBundleRecord,
  ReceiptEventRecord,
  ReceiptRecord,
  SignatureRecord,
  TaskDetails,
  TaskVerificationReport,
  VerificationCheckResult
} from "../core/types.js";
import { hashJson } from "../utils/hash.js";

export async function verifyTaskDetails(details: TaskDetails): Promise<TaskVerificationReport> {
  const checks: VerificationCheckResult[] = [];
  const { task, artifact, agentLog, proofBundle, receiptRecord, receiptEvents, disputeRecord, resolutionRecord } = details;

  if (!artifact) {
    checks.push(fail("artifact.present", "artifact.json is missing."));
  } else {
    checks.push(pass("artifact.present", "artifact.json is present."));
  }

  if (!agentLog) {
    checks.push(fail("agentLog.present", "agent_log.json is missing."));
  } else {
    checks.push(pass("agentLog.present", "agent_log.json is present."));
  }

  if (!proofBundle) {
    checks.push(fail("proofBundle.present", "proof_bundle.json is missing."));
  } else {
    checks.push(pass("proofBundle.present", "proof_bundle.json is present."));
    checks.push(checkEqual("proofBundle.taskId", proofBundle.taskId, task.id, "proof bundle taskId matched the task record."));
    checks.push(checkEqual("proofBundle.taskHash", proofBundle.taskHash, task.taskHash, "proof bundle taskHash matched the task record."));
    checks.push(checkEqual("proofBundle.covenantId", proofBundle.covenantId, task.covenantId, "proof bundle covenantId matched the task record."));
    checks.push(checkEqual("proofBundle.proofHash", proofBundle.proofHash, task.proofHash, "proof bundle proofHash matched the task record."));

    if (artifact) {
      checks.push(
        checkEqual(
          "proofBundle.artifactHash",
          proofBundle.artifactHash,
          hashJson(artifact),
          "proof bundle artifactHash matched artifact.json."
        )
      );
    }

    if (agentLog) {
      checks.push(
        checkEqual(
          "proofBundle.verificationHash",
          proofBundle.verificationHash,
          hashJson(agentLog.verification),
          "proof bundle verificationHash matched agent_log verification."
        )
      );
      checks.push(
        checkEqual(
          "proofBundle.evidenceRoot",
          proofBundle.evidenceRoot,
          hashJson(
            agentLog.evidence.files.map((file) => ({
              path: file.path,
              contentHash: file.contentHash
            }))
          ),
          "proof bundle evidenceRoot matched inspected file hashes."
        )
      );
      checks.push(
        checkEqual("proofBundle.planHash", proofBundle.planHash, hashJson(agentLog.plan), "proof bundle planHash matched agent_log plan.")
      );
      checks.push(
        checkEqual(
          "proofBundle.budgetHash",
          proofBundle.budgetHash,
          hashJson(agentLog.budget),
          "proof bundle budgetHash matched agent_log budget."
        )
      );
      checks.push(
        checkEqual(
          "proofBundle.guardrailsHash",
          proofBundle.guardrailsHash,
          hashJson(agentLog.guardrails),
          "proof bundle guardrailsHash matched agent_log guardrails."
        )
      );
      checks.push(
        checkEqual(
          "proofBundle.validatorResultsHash",
          proofBundle.validatorResultsHash,
          hashJson(agentLog.verification.validatorResults),
          "proof bundle validatorResultsHash matched agent_log validator results."
        )
      );
      checks.push(
        checkEqual(
          "proofBundle.receipt.proofHash",
          agentLog.receiptChain.onchain.proofHash,
          proofBundle.proofHash,
          "agent_log receiptChain proofHash matched the proof bundle."
        )
      );
    }

    checks.push(
      checkEqual(
        "proofBundle.executionTraceHash",
        proofBundle.executionTraceHash,
        hashJson(proofBundle.executionTrace),
        "proof bundle executionTraceHash matched the embedded execution trace."
      )
    );

    const recomputedProofHash = hashJson(proofBundleBase(proofBundle));
    checks.push(
      checkEqual(
        "proofBundle.recomputedHash",
        recomputedProofHash,
        proofBundle.proofHash,
        "Recomputed proof bundle hash matched the committed proof hash."
      )
    );

    checks.push(
      await verifySignature(
        "proofBundle.operatorAttestation",
        proofBundle.operatorAttestation,
        "proof_bundle",
        proofBundle.proofHash
      )
    );
  }

  if (!receiptRecord) {
    checks.push(fail("receiptRecord.present", "receipt_record.json is missing."));
  } else {
    checks.push(pass("receiptRecord.present", "receipt_record.json is present."));
    checks.push(checkEqual("receiptRecord.taskId", receiptRecord.taskId, task.id, "receipt record taskId matched the task record."));
    checks.push(checkEqual("receiptRecord.taskHash", receiptRecord.taskHash, task.taskHash, "receipt record taskHash matched the task record."));
    checks.push(
      checkEqual("receiptRecord.covenantId", receiptRecord.covenantId, task.covenantId, "receipt record covenantId matched the task record.")
    );
    checks.push(checkEqual("receiptRecord.proofHash", receiptRecord.proofHash, task.proofHash, "receipt record proofHash matched the task record."));
    checks.push(
      checkEqual(
        "receiptRecord.eventCount",
        receiptRecord.eventCount,
        receiptEvents.length,
        "receipt record eventCount matched the number of receipt event files."
      )
    );
    checks.push(
      checkEqual(
        "receiptRecord.eventFiles",
        receiptRecord.eventFiles.length,
        receiptEvents.length,
        "receipt record eventFiles length matched the number of loaded receipt events."
      )
    );
  }

  if (receiptEvents.length === 0) {
    checks.push(fail("receiptEvents.present", "No receipt events were found."));
  } else {
    checks.push(pass("receiptEvents.present", `${receiptEvents.length} receipt events were found.`));
  }

  let previousHash: `0x${string}` | null = null;
  for (let index = 0; index < receiptEvents.length; index += 1) {
    const event = receiptEvents[index]!;
    const expectedSequence = index + 1;
    checks.push(
      checkEqual(
        `receiptEvent.${expectedSequence}.sequence`,
        event.sequence,
        expectedSequence,
        `receipt event ${expectedSequence} sequence was contiguous.`
      )
    );
    checks.push(
      checkEqual(
        `receiptEvent.${expectedSequence}.prevHash`,
        event.prevHash,
        previousHash,
        `receipt event ${expectedSequence} prevHash linked to the previous receipt event.`
      )
    );
    checks.push(
      checkEqual(
        `receiptEvent.${expectedSequence}.taskId`,
        event.taskId,
        task.id,
        `receipt event ${expectedSequence} taskId matched the task record.`
      )
    );
    checks.push(
      checkEqual(
        `receiptEvent.${expectedSequence}.snapshot.taskHash`,
        event.snapshot.taskHash,
        task.taskHash,
        `receipt event ${expectedSequence} taskHash snapshot matched the task.`
      )
    );
    checks.push(
      checkEqual(
        `receiptEvent.${expectedSequence}.snapshot.covenantId`,
        event.snapshot.covenantId,
        task.covenantId,
        `receipt event ${expectedSequence} covenantId snapshot matched the task.`
      )
    );
    if (event.event !== "createCovenant") {
      checks.push(
        checkEqual(
          `receiptEvent.${expectedSequence}.snapshot.proofHash`,
          event.snapshot.proofHash,
          task.proofHash,
          `receipt event ${expectedSequence} proofHash snapshot matched the task.`
        )
      );
    }
    const recomputedEventHash = hashJson(receiptEventBase(event));
    checks.push(
      checkEqual(
        `receiptEvent.${expectedSequence}.eventHash`,
        event.eventHash,
        recomputedEventHash,
        `receipt event ${expectedSequence} eventHash matched the canonical event payload.`
      )
    );
    checks.push(
      await verifySignature(
        `receiptEvent.${expectedSequence}.attestation`,
        event.attestation,
        event.event,
        recomputedEventHash
      )
    );
    previousHash = event.eventHash;
  }

  if (receiptRecord && receiptEvents.length > 0) {
    checks.push(
      checkEqual(
        "receiptRecord.headHash",
        receiptRecord.headHash,
        receiptEvents.at(-1)?.eventHash ?? null,
        "receipt record headHash matched the last receipt event."
      )
    );

    const derivedReceipts = deriveReceiptTxHashes(receiptEvents);
    checks.push(
      checkEqual(
        "receiptRecord.receipts",
        JSON.stringify(receiptRecord.receipts),
        JSON.stringify(derivedReceipts),
        "receipt record tx hash index matched the append-only event chain."
      )
    );
  }

  if (agentLog && receiptRecord) {
    checks.push(checkReceiptReference("agentLog.receiptChain.submitTxHash", agentLog.receiptChain.onchain.submitTxHash, receiptRecord.receipts.submitTxHash));
    checks.push(checkReceiptReference("agentLog.receiptChain.finalizeTxHash", agentLog.receiptChain.onchain.finalizeTxHash, receiptRecord.receipts.finalizeTxHash));
    checks.push(checkReceiptReference("agentLog.receiptChain.disputeTxHash", agentLog.receiptChain.onchain.disputeTxHash, receiptRecord.receipts.disputeTxHash));
    checks.push(checkReceiptReference("agentLog.receiptChain.resolveTxHash", agentLog.receiptChain.onchain.resolveTxHash, receiptRecord.receipts.resolveTxHash));
  }

  if (task.status === "submitted" || task.status === "completed" || task.status === "slashed" || task.status === "disputed") {
    const submitTxHash = receiptRecord?.receipts.submitTxHash ?? null;
    checks.push(
      submitTxHash ? pass("taskLifecycle.submitReceipt", "A submit receipt exists for a non-draft task.") : fail("taskLifecycle.submitReceipt", "Missing submit receipt for a task that progressed past creation.")
    );
  }

  if (disputeRecord) {
    checks.push(
      receiptRecord?.receipts.disputeTxHash
        ? pass("taskLifecycle.disputeReceipt", "A dispute receipt exists for the dispute record.")
        : fail("taskLifecycle.disputeReceipt", "Dispute record exists but dispute receipt is missing.")
    );
  }

  if (resolutionRecord) {
    checks.push(
      receiptRecord?.receipts.resolveTxHash
        ? pass("taskLifecycle.resolveReceipt", "A resolve receipt exists for the resolution record.")
        : fail("taskLifecycle.resolveReceipt", "Resolution record exists but resolve receipt is missing.")
    );
  }

  const warnings = checks.filter((check) => !check.passed && check.severity === "warning").length;
  const errors = checks.filter((check) => !check.passed && check.severity === "error").length;
  return {
    schemaVersion: "v1",
    taskId: task.id,
    createdAt: Date.now(),
    status: errors === 0 ? "verified" : "flagged",
    summary: {
      passed: checks.filter((check) => check.passed).length,
      warnings,
      errors,
      total: checks.length
    },
    checks
  };
}

function proofBundleBase(proofBundle: ProofBundleRecord) {
  return {
    schemaVersion: proofBundle.schemaVersion,
    taskId: proofBundle.taskId,
    taskHash: proofBundle.taskHash,
    covenantId: proofBundle.covenantId,
    artifactHash: proofBundle.artifactHash,
    verificationHash: proofBundle.verificationHash,
    evidenceRoot: proofBundle.evidenceRoot,
    planHash: proofBundle.planHash,
    budgetHash: proofBundle.budgetHash,
    guardrailsHash: proofBundle.guardrailsHash,
    executionTrace: proofBundle.executionTrace,
    executionTraceHash: proofBundle.executionTraceHash,
    validatorResultsHash: proofBundle.validatorResultsHash,
    artifactPath: proofBundle.artifactPath,
    agentLogPath: proofBundle.agentLogPath,
    createdAt: proofBundle.createdAt
  };
}

function receiptEventBase(event: ReceiptEventRecord) {
  return {
    schemaVersion: event.schemaVersion,
    taskId: event.taskId,
    sequence: event.sequence,
    event: event.event,
    actor: event.actor,
    txHash: event.txHash,
    createdAt: event.createdAt,
    prevHash: event.prevHash,
    snapshot: event.snapshot,
    metadata: event.metadata
  };
}

function deriveReceiptTxHashes(receiptEvents: ReceiptEventRecord[]): ReceiptRecord["receipts"] {
  return {
    createTxHash: findLastReceipt(receiptEvents, "createCovenant"),
    submitTxHash: findLastReceipt(receiptEvents, "submitCompletion"),
    finalizeTxHash: findLastReceipt(receiptEvents, "finalizeCompletion"),
    disputeTxHash: findLastReceipt(receiptEvents, "disputeCovenant"),
    resolveTxHash: findLastReceipt(receiptEvents, "resolveDispute")
  };
}

function findLastReceipt(receiptEvents: ReceiptEventRecord[], eventName: ReceiptEventRecord["event"]): string | null {
  for (let index = receiptEvents.length - 1; index >= 0; index -= 1) {
    if (receiptEvents[index]?.event === eventName) {
      return receiptEvents[index]!.txHash;
    }
  }
  return null;
}

async function verifySignature(
  name: string,
  signature: SignatureRecord | null,
  expectedPurpose: string,
  payloadHash: `0x${string}`
): Promise<VerificationCheckResult> {
  if (!signature) {
    return fail(name, "Attestation was missing.");
  }
  if (!signature.signer) {
    return fail(name, "Attestation signer was missing.");
  }
  if (signature.purpose !== expectedPurpose) {
    return fail(name, `Attestation purpose ${signature.purpose} did not match expected purpose ${expectedPurpose}.`);
  }
  if (signature.payloadHash !== payloadHash) {
    return fail(name, "Attestation payloadHash did not match the recomputed payload hash.");
  }
  const expectedStatement = `TrustCommit:${expectedPurpose}:${payloadHash}`;
  if (signature.statement !== expectedStatement) {
    return fail(name, "Attestation statement did not match the TrustCommit signing convention.");
  }
  const recovered = await recoverMessageAddress({
    message: { raw: stringToHex(signature.statement) },
    signature: signature.signature
  });
  if (recovered.toLowerCase() !== signature.signer.toLowerCase()) {
    return fail(name, `Recovered signer ${recovered} did not match the attested signer ${signature.signer}.`);
  }
  return pass(name, `Recovered signer ${recovered} matched the attested signature.`);
}

function checkEqual(name: string, actual: unknown, expected: unknown, successDetail: string): VerificationCheckResult {
  if (actual === expected) {
    return pass(name, successDetail);
  }
  return fail(name, `Expected ${JSON.stringify(expected)} but found ${JSON.stringify(actual)}.`);
}

function checkReceiptReference(name: string, agentLogValue: string | null, receiptValue: string | null): VerificationCheckResult {
  if (agentLogValue === null) {
    return pass(name, "agent_log left the post-submit tx hash null and delegated settlement receipts to the append-only receipt chain.");
  }
  if (agentLogValue === receiptValue) {
    return pass(name, "agent_log receipt reference matched the append-only receipt chain.");
  }
  return fail(name, `Expected ${JSON.stringify(receiptValue)} but found ${JSON.stringify(agentLogValue)}.`);
}

function pass(name: string, detail: string): VerificationCheckResult {
  return {
    name,
    passed: true,
    severity: "warning",
    detail
  };
}

function fail(name: string, detail: string): VerificationCheckResult {
  return {
    name,
    passed: false,
    severity: "error",
    detail
  };
}
