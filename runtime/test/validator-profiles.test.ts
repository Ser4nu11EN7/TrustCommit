import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { TaskRecord } from "../src/core/types.js";
import { validateArtifact } from "../src/validators/profiles.js";

test("validator profiles compose selection, budget, compliance, and procurement checks", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-validators-"));
  const fixtureDir = path.join(workspaceRoot, "demo-fixtures");
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, "procurement-brief.md"),
    [
      "Monthly budget ceiling: 10000 USDC",
      "Required uptime: 99.9%",
      "Maximum retention: 30 days"
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(fixtureDir, "vendor-a.quote.json"),
    JSON.stringify(
      {
        vendor: "Vendor A",
        monthlyCostUsdc: 9800,
        uptimeSla: "99.95%",
        auditLogExport: true,
        retentionDays: 30,
        webhookReceipts: true
      },
      null,
      2
    )
  );

  const task: TaskRecord = {
    id: "task_profiles",
    title: "Select a compliant vendor under the budget ceiling",
    instructions: "Choose the vendor that satisfies budget, retention, audit, and webhook receipt requirements.",
    outputSchemaJson: JSON.stringify({
      taskTitle: "string",
      selectedVendor: "string",
      summary: "string",
      decisionReason: "string",
      budgetAssessment: "string",
      complianceChecks: "string[]",
      inspectedFiles: "string[]",
      notes: "string[]"
    }),
    reward: 1,
    requiredStake: 1,
    deadlineTs: 1,
    status: "created",
    covenantId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    executorAgentId: 1,
    createdBy: "mock",
    proofHash: null,
    taskHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    artifactPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const verification = validateArtifact({
    task,
    payload: {
      taskTitle: task.title,
      selectedVendor: "Vendor A",
      summary: "Vendor A satisfies the budget ceiling and retention requirements while preserving audit exports and webhook receipts.",
      decisionReason: "Vendor A is the only inspected quote that remains within the budget ceiling while still satisfying uptime, retention, audit export, and webhook receipt controls.",
      budgetAssessment: "Vendor A remains below the 10,000 USDC monthly budget ceiling.",
      complianceChecks: ["99.95% uptime", "30-day retention", "Audit log export", "Webhook receipts"],
      inspectedFiles: ["demo-fixtures/procurement-brief.md", "demo-fixtures/vendor-a.quote.json"],
      notes: ["Grounded in the procurement fixtures."]
    },
    outputSchema: JSON.parse(task.outputSchemaJson) as Record<string, string>,
    evidenceFiles: [
      {
        path: "demo-fixtures/procurement-brief.md",
        contentHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
        excerpt: "Monthly budget ceiling: 10000 USDC",
        bytes: 64,
        observedAt: Date.now()
      },
      {
        path: "demo-fixtures/vendor-a.quote.json",
        contentHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
        excerpt: "{\"vendor\":\"Vendor A\"}",
        bytes: 64,
        observedAt: Date.now()
      }
    ],
    plan: {
      summary: "Inspect the brief, compare quotes, and return the compliant vendor.",
      steps: ["Inspect", "Compare", "Select"],
      successCriteria: ["All schema fields are present."],
      evidenceFocus: ["demo-fixtures/procurement-brief.md", "demo-fixtures/vendor-a.quote.json"],
      maxAttempts: 2
    },
    workspaceRoot
  });

  assert.equal(verification.schemaSatisfied, true);
  assert.ok(verification.profile.includes("selection_commitment"));
  assert.ok(verification.profile.includes("budget_commitment"));
  assert.ok(verification.profile.includes("compliance_commitment"));
  assert.ok(verification.profile.includes("procurement_commitment"));
  assert.equal(verification.validatorResults.every((result) => result.passed), true);
});
