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

test("validator profiles compose remediation commitment checks", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-remediation-"));
  const fixtureDir = path.join(workspaceRoot, "demo-fixtures");
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, "remediation-brief.md"),
    [
      "Required files:",
      "- src/checkout.ts",
      "- src/payments.ts",
      "",
      "Forbidden files:",
      "- src/auth.ts",
      "",
      "Required controls:",
      "- Input sanitization",
      "- Preserve audit logging",
      "- Add unit tests"
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(fixtureDir, "patch-plan-a.json"),
    JSON.stringify(
      {
        plan: "Patch Plan A",
        filesToModify: ["src/checkout.ts", "src/payments.ts"],
        preservesAuditLogging: true,
        addsUnitTests: true,
        sanitizesInputs: true,
        touchesSensitiveAuth: false,
        riskScore: 2
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(fixtureDir, "patch-plan-b.json"),
    JSON.stringify(
      {
        plan: "Patch Plan B",
        filesToModify: ["src/checkout.ts", "src/auth.ts"],
        preservesAuditLogging: false,
        addsUnitTests: false,
        sanitizesInputs: true,
        touchesSensitiveAuth: true,
        riskScore: 7
      },
      null,
      2
    )
  );

  const task: TaskRecord = {
    id: "task_remediation_profiles",
    title: "Select a compliant remediation plan for the checkout service",
    instructions: "Choose the lowest-risk remediation plan that fixes checkout while preserving audit logging and tests.",
    outputSchemaJson: JSON.stringify({
      taskTitle: "string",
      selectedPlan: "string",
      summary: "string",
      remediationPlan: "string",
      decisionReason: "string",
      filesToModify: "string[]",
      acceptanceChecks: "string[]",
      residualRisk: "string",
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
    taskHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
    artifactPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const verification = validateArtifact({
    task,
    payload: {
      taskTitle: task.title,
      selectedPlan: "Patch Plan A",
      summary: "Patch Plan A fixes the checkout issue while preserving audit logging and avoiding auth drift.",
      remediationPlan:
        "Patch Plan A updates checkout and payments flows, preserves audit logging, adds unit tests, and leaves auth untouched.",
      decisionReason:
        "Patch Plan A is the lowest-risk compliant plan because it covers the required files, preserves audit logging, adds tests, sanitizes inputs, and avoids auth.",
      filesToModify: ["src/checkout.ts", "src/payments.ts"],
      acceptanceChecks: ["Input sanitization enforced", "Audit logging preserved", "Add unit tests"],
      residualRisk: "Low residual risk after constraining the patch to checkout-related files.",
      inspectedFiles: [
        "demo-fixtures/remediation-brief.md",
        "demo-fixtures/patch-plan-a.json",
        "demo-fixtures/patch-plan-b.json"
      ],
      notes: ["Grounded in the inspected remediation fixtures."]
    },
    outputSchema: JSON.parse(task.outputSchemaJson) as Record<string, string>,
    evidenceFiles: [
      {
        path: "demo-fixtures/remediation-brief.md",
        contentHash: "0x6666666666666666666666666666666666666666666666666666666666666666",
        excerpt: "Required files: checkout and payments",
        bytes: 96,
        observedAt: Date.now()
      },
      {
        path: "demo-fixtures/patch-plan-a.json",
        contentHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
        excerpt: "{\"plan\":\"Patch Plan A\"}",
        bytes: 96,
        observedAt: Date.now()
      },
      {
        path: "demo-fixtures/patch-plan-b.json",
        contentHash: "0x8888888888888888888888888888888888888888888888888888888888888888",
        excerpt: "{\"plan\":\"Patch Plan B\"}",
        bytes: 96,
        observedAt: Date.now()
      }
    ],
    plan: {
      summary: "Inspect remediation plans, compare controls, and select the lowest-risk compliant patch.",
      steps: ["Inspect", "Compare", "Select"],
      successCriteria: ["All schema fields are present."],
      evidenceFocus: [
        "demo-fixtures/remediation-brief.md",
        "demo-fixtures/patch-plan-a.json",
        "demo-fixtures/patch-plan-b.json"
      ],
      maxAttempts: 2
    },
    workspaceRoot
  });

  assert.equal(verification.schemaSatisfied, true);
  assert.ok(verification.profile.includes("remediation_commitment"));
  assert.equal(verification.validatorResults.every((result) => result.passed), true);
});

test("validator profiles compose policy commitment checks", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-policy-"));
  const fixtureDir = path.join(workspaceRoot, "demo-fixtures");
  fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, "policy-brief.md"),
    [
      "Approved regions:",
      "- US",
      "- EU",
      "",
      "Forbidden data classes:",
      "- biometric",
      "- pci",
      "",
      "Required controls:",
      "- Read-only access",
      "- Ticket reference",
      "- Maximum duration",
      "",
      "Maximum duration: 30 days"
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(fixtureDir, "access-request-a.json"),
    JSON.stringify(
      {
        request: "Access Request A",
        region: "EU",
        dataClasses: ["logs", "email"],
        readOnly: true,
        durationDays: 14,
        ticketRef: "INC-204",
        riskScore: 2
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(fixtureDir, "access-request-b.json"),
    JSON.stringify(
      {
        request: "Access Request B",
        region: "APAC",
        dataClasses: ["biometric", "logs"],
        readOnly: false,
        durationDays: 90,
        ticketRef: null,
        riskScore: 8
      },
      null,
      2
    )
  );

  const task: TaskRecord = {
    id: "task_policy_profiles",
    title: "Approve a compliant support access request",
    instructions: "Choose the lowest-risk access request that satisfies tenant policy.",
    outputSchemaJson: JSON.stringify({
      taskTitle: "string",
      selectedRequest: "string",
      summary: "string",
      decisionReason: "string",
      policyChecks: "string[]",
      requiredControls: "string[]",
      residualRisk: "string",
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
    commitmentProfile: "policy_commitment",
    evidencePolicyJson: JSON.stringify({
      requiredPaths: [
        "demo-fixtures/policy-brief.md",
        "demo-fixtures/access-request-a.json",
        "demo-fixtures/access-request-b.json"
      ],
      rationale: ["Policy commitments must preserve the policy brief and all candidate requests."]
    }),
    proofHash: null,
    taskHash: "0x9999999999999999999999999999999999999999999999999999999999999999",
    artifactPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const verification = validateArtifact({
    task,
    payload: {
      taskTitle: task.title,
      selectedRequest: "Access Request A",
      summary: "Access Request A satisfies the approved regions, read-only controls, and duration policy while avoiding forbidden data classes.",
      decisionReason:
        "Access Request A is the lowest-risk compliant request because it remains inside EU, stays read-only, avoids biometric or PCI data, includes a ticket reference, and remains under the 30-day maximum duration.",
      policyChecks: ["EU region only", "Read-only access", "No biometric data", "Duration under 30 days"],
      requiredControls: ["Read-only access", "Ticket reference", "Maximum duration"],
      residualRisk: "Low residual risk after constraining the request to read-only EU access.",
      inspectedFiles: [
        "demo-fixtures/policy-brief.md",
        "demo-fixtures/access-request-a.json",
        "demo-fixtures/access-request-b.json"
      ],
      notes: ["Grounded in the inspected policy fixtures."]
    },
    outputSchema: JSON.parse(task.outputSchemaJson) as Record<string, string>,
    evidenceFiles: [
      {
        path: "demo-fixtures/policy-brief.md",
        contentHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        excerpt: "Approved regions: US, EU",
        bytes: 128,
        observedAt: Date.now()
      },
      {
        path: "demo-fixtures/access-request-a.json",
        contentHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        excerpt: "{\"request\":\"Access Request A\"}",
        bytes: 128,
        observedAt: Date.now()
      },
      {
        path: "demo-fixtures/access-request-b.json",
        contentHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        excerpt: "{\"request\":\"Access Request B\"}",
        bytes: 128,
        observedAt: Date.now()
      }
    ],
    plan: {
      summary: "Inspect the policy brief, compare access requests, and select the lowest-risk compliant request.",
      steps: ["Inspect", "Compare", "Select"],
      successCriteria: ["All schema fields are present."],
      evidenceFocus: [
        "demo-fixtures/policy-brief.md",
        "demo-fixtures/access-request-a.json",
        "demo-fixtures/access-request-b.json"
      ],
      maxAttempts: 2
    },
    workspaceRoot
  });

  assert.equal(verification.schemaSatisfied, true);
  assert.ok(verification.profile.includes("policy_commitment"));
  assert.equal(verification.validatorResults.every((result) => result.passed), true);
});
