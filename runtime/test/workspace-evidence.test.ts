import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWorkspaceEvidence } from "../src/tools/workspace-evidence.js";
import type { TaskRecord } from "../src/core/types.js";

test("workspace evidence deterministically includes procurement fixtures for procurement tasks", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-evidence-procurement-"));
  fs.mkdirSync(path.join(workspaceDir, "demo-fixtures"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "procurement-brief.md"), "Monthly budget ceiling: 10000 USDC");
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "vendor-a.quote.json"), "{\"vendor\":\"Vendor A\"}");
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "vendor-b.quote.json"), "{\"vendor\":\"Vendor B\"}");
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "vendor-c.quote.json"), "{\"vendor\":\"Vendor C\"}");
  fs.writeFileSync(path.join(workspaceDir, "README.md"), "# Demo");

  const evidence = buildWorkspaceEvidence(
    makeTask({
      title: "Select a compliant vendor",
      instructions: "Choose the lowest-risk vendor within budget and retention constraints.",
      outputSchemaJson: JSON.stringify({
        selectedVendor: "string",
        budgetAssessment: "string",
        complianceChecks: "string[]",
        summary: "string",
        inspectedFiles: "string[]",
        notes: "string[]"
      })
    }),
    workspaceDir
  );

  assert.deepEqual(
    evidence.files.slice(0, 4).map((file) => file.path),
    [
      "demo-fixtures/procurement-brief.md",
      "demo-fixtures/vendor-a.quote.json",
      "demo-fixtures/vendor-b.quote.json",
      "demo-fixtures/vendor-c.quote.json"
    ]
  );
});

test("workspace evidence deterministically includes remediation fixtures for remediation tasks", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-evidence-remediation-"));
  fs.mkdirSync(path.join(workspaceDir, "demo-fixtures"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "remediation-brief.md"), "Required files:\n- src/checkout.ts");
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "patch-plan-a.json"), "{\"plan\":\"Patch Plan A\"}");
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "patch-plan-b.json"), "{\"plan\":\"Patch Plan B\"}");
  fs.writeFileSync(path.join(workspaceDir, "README.md"), "# Demo");

  const evidence = buildWorkspaceEvidence(
    makeTask({
      title: "Select a remediation plan for checkout",
      instructions: "Choose the safest patch plan and list filesToModify plus acceptanceChecks.",
      outputSchemaJson: JSON.stringify({
        selectedPlan: "string",
        filesToModify: "string[]",
        acceptanceChecks: "string[]",
        summary: "string",
        inspectedFiles: "string[]",
        notes: "string[]"
      })
    }),
    workspaceDir
  );

  assert.deepEqual(
    evidence.files.slice(0, 3).map((file) => file.path),
    [
      "demo-fixtures/remediation-brief.md",
      "demo-fixtures/patch-plan-a.json",
      "demo-fixtures/patch-plan-b.json"
    ]
  );
});

test("workspace evidence honors explicit evidence policy required paths before heuristics", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-evidence-policy-"));
  fs.mkdirSync(path.join(workspaceDir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "README.md"), "# Demo");
  fs.writeFileSync(path.join(workspaceDir, "docs", "policy.md"), "Explicit policy evidence");
  fs.writeFileSync(path.join(workspaceDir, "docs", "supporting.md"), "Supporting context");

  const evidence = buildWorkspaceEvidence(
    makeTask({
      title: "Generic structured commitment",
      instructions: "Return a structured commitment.",
      outputSchemaJson: JSON.stringify({
        taskTitle: "string",
        summary: "string",
        inspectedFiles: "string[]",
        notes: "string[]"
      }),
      evidencePolicyJson: JSON.stringify({
        requiredPaths: ["docs/policy.md"],
        rationale: ["Policy markdown must always be preserved."]
      })
    }),
    workspaceDir
  );

  assert.equal(evidence.files[0]?.path, "docs/policy.md");
});

test("workspace evidence deterministically includes policy fixtures for policy tasks", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-evidence-policy-commitment-"));
  fs.mkdirSync(path.join(workspaceDir, "demo-fixtures"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "policy-brief.md"), "Approved regions:\n- EU");
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "access-request-a.json"), "{\"request\":\"Access Request A\"}");
  fs.writeFileSync(path.join(workspaceDir, "demo-fixtures", "access-request-b.json"), "{\"request\":\"Access Request B\"}");
  fs.writeFileSync(path.join(workspaceDir, "README.md"), "# Demo");

  const evidence = buildWorkspaceEvidence(
    makeTask({
      title: "Approve a compliant support access request",
      instructions: "Choose the lowest-risk request that satisfies policy.",
      outputSchemaJson: JSON.stringify({
        selectedRequest: "string",
        policyChecks: "string[]",
        requiredControls: "string[]",
        summary: "string",
        inspectedFiles: "string[]",
        notes: "string[]"
      })
    }),
    workspaceDir
  );

  assert.deepEqual(
    evidence.files.slice(0, 3).map((file) => file.path),
    [
      "demo-fixtures/policy-brief.md",
      "demo-fixtures/access-request-a.json",
      "demo-fixtures/access-request-b.json"
    ]
  );
});

function makeTask(
  input: Pick<TaskRecord, "title" | "instructions" | "outputSchemaJson"> & { evidencePolicyJson?: string | null }
): TaskRecord {
  return {
    id: "task_evidence",
    title: input.title,
    instructions: input.instructions,
    outputSchemaJson: input.outputSchemaJson,
    reward: 1,
    requiredStake: 1,
    deadlineTs: 1,
    status: "created",
    covenantId: null,
    executorAgentId: 1,
    createdBy: "mock",
    commitmentProfile: null,
    evidencePolicyJson: input.evidencePolicyJson ?? null,
    proofHash: null,
    taskHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    artifactPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
