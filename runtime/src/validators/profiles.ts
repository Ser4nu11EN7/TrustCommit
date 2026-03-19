import fs from "node:fs";
import path from "node:path";
import type { AgentLog, ExecutionPlan, TaskRecord } from "../core/types.js";

type EvidenceFile = AgentLog["evidence"]["files"][number];

interface ValidationContext {
  task: TaskRecord;
  payload: Record<string, unknown>;
  outputSchema: Record<string, string>;
  evidenceFiles: EvidenceFile[];
  plan: ExecutionPlan;
  workspaceRoot: string;
}

interface ValidationProfile {
  name: string;
  applies(context: ValidationContext): boolean;
  run(context: ValidationContext): AgentLog["verification"]["validatorResults"];
}

export function validateArtifact(context: ValidationContext): AgentLog["verification"] {
  const missingFields = Object.keys(context.outputSchema).filter((key) => !(key in context.payload));
  const notes: string[] = [];
  const validatorResults: AgentLog["verification"]["validatorResults"] = [];
  const profileNames = ["baseline"];

  for (const result of runBaselineValidators(context)) {
    validatorResults.push(result);
    if (!result.passed) {
      notes.push(result.details);
    }
  }

  for (const profile of validationProfiles) {
    if (!profile.applies(context)) {
      continue;
    }
    profileNames.push(profile.name);
    for (const result of profile.run(context)) {
      validatorResults.push(result);
      if (!result.passed) {
        notes.push(result.details);
      }
    }
  }

  return {
    profile: profileNames.join("+"),
    schemaSatisfied: missingFields.length === 0 && notes.length === 0,
    missingFields,
    notes,
    validatorResults
  };
}

function runBaselineValidators(context: ValidationContext): AgentLog["verification"]["validatorResults"] {
  const results: AgentLog["verification"]["validatorResults"] = [];
  const inspectedPaths = context.evidenceFiles.map((file) => file.path);
  const inspectedFiles = extractInspectedFiles(context.payload.inspectedFiles);

  results.push(
    makeResult(
      "summary_length",
      typeof context.payload.summary === "string" && context.payload.summary.trim().length >= 20,
      typeof context.payload.summary === "string" && context.payload.summary.trim().length >= 20
        ? "Artifact summary met the minimum credibility threshold."
        : "Artifact summary was too short to be credible."
    )
  );

  results.push(
    makeResult(
      "notes_present",
      Array.isArray(context.payload.notes) && context.payload.notes.length > 0,
      Array.isArray(context.payload.notes) && context.payload.notes.length > 0
        ? "Artifact included note annotations."
        : "Artifact notes were missing."
    )
  );

  if (inspectedFiles === null) {
    results.push(makeResult("inspected_file_scope", false, "Artifact did not include an inspectedFiles field."));
  } else {
    const unknownPaths = inspectedFiles.filter((value) => !inspectedPaths.includes(value));
    results.push(
      makeResult(
        "inspected_file_scope",
        unknownPaths.length === 0,
        unknownPaths.length === 0
          ? "Artifact stayed inside the inspected evidence set."
          : `Artifact referenced files outside the inspected evidence set: ${unknownPaths.join(", ")}`
      )
    );
  }

  if (context.plan.evidenceFocus.length > 0 && inspectedFiles !== null) {
    const focusedMatches = context.plan.evidenceFocus.filter((filePath) => inspectedFiles.includes(filePath));
    results.push(
      makeResult(
        "plan_evidence_focus",
        focusedMatches.length > 0,
        focusedMatches.length > 0
          ? `Artifact incorporated ${focusedMatches.length} evidence focus file(s).`
          : "Artifact did not incorporate any of the plan's evidence focus files."
      )
    );
  }

  return results;
}

const validationProfiles: ValidationProfile[] = [
  {
    name: "structured_commitment",
    applies(context) {
      return "taskTitle" in context.payload || "decisionReason" in context.payload || "complianceChecks" in context.payload;
    },
    run(context) {
      const results: AgentLog["verification"]["validatorResults"] = [];
      const titleMatches =
        typeof context.payload.taskTitle === "string" ? context.payload.taskTitle.trim() === context.task.title.trim() : false;
      results.push(
        makeResult(
          "task_title_binding",
          titleMatches,
          titleMatches
            ? "Artifact taskTitle matched the covenant task title."
            : "Artifact taskTitle did not match the covenant task title."
        )
      );

      if ("decisionReason" in context.payload) {
        const decisionReason =
          typeof context.payload.decisionReason === "string" ? context.payload.decisionReason.trim().length >= 30 : false;
        results.push(
          makeResult(
            "decision_reason_length",
            decisionReason,
            decisionReason
              ? "Artifact included a non-trivial decisionReason."
              : "Artifact decisionReason was too short to justify a commitment."
          )
        );
      }

      if ("complianceChecks" in context.payload) {
        const checks = Array.isArray(context.payload.complianceChecks) ? context.payload.complianceChecks : [];
        results.push(
          makeResult(
            "compliance_checks_present",
            checks.length > 0,
            checks.length > 0 ? "Artifact included explicit compliance checks." : "Artifact omitted compliance checks."
          )
        );
      }

      return results;
    }
  },
  {
    name: "selection_commitment",
    applies(context) {
      return (
        "selectedVendor" in context.payload ||
        "selectedOption" in context.payload ||
        "selectedPlan" in context.payload
      );
    },
    run(context) {
      const selectedValue = firstString(
        context.payload.selectedVendor,
        context.payload.selectedOption,
        context.payload.selectedPlan
      );
      const hasSelection = typeof selectedValue === "string" && selectedValue.trim().length >= 3;
      const summaryText = firstString(context.payload.summary, context.payload.decisionReason);
      const mentionsSelection =
        hasSelection &&
        typeof summaryText === "string" &&
        summaryText.toLowerCase().includes(selectedValue!.trim().toLowerCase());

      return [
        makeResult(
          "selection_value_present",
          hasSelection,
          hasSelection ? `Structured selection value was present: ${selectedValue}.` : "Structured selection value was missing."
        ),
        makeResult(
          "selection_value_grounded",
          !hasSelection || mentionsSelection,
          !hasSelection
            ? "Selection grounding skipped because no structured selection value was present."
            : mentionsSelection
              ? "Summary or decision reason referenced the selected option."
              : "Summary or decision reason did not reference the selected option."
        )
      ];
    }
  },
  {
    name: "budget_commitment",
    applies(context) {
      return (
        "budgetAssessment" in context.payload ||
        /budget|ceiling|cost|spend|price/i.test(`${context.task.title}\n${context.task.instructions}`)
      );
    },
    run(context) {
      const value = typeof context.payload.budgetAssessment === "string" ? context.payload.budgetAssessment.trim() : "";
      const reason = typeof context.payload.decisionReason === "string" ? context.payload.decisionReason.trim() : "";
      return [
        makeResult(
          "budget_assessment_present",
          value.length >= 12,
          value.length >= 12
            ? "Artifact included a non-trivial budget assessment."
            : "Artifact budgetAssessment was missing or too short."
        ),
        makeResult(
          "budget_assessment_reason_binding",
          value.length === 0 || reason.length >= 20,
          value.length === 0
            ? "Budget reason binding skipped because no structured budgetAssessment was present."
            : reason.length >= 20
              ? "decisionReason was long enough to justify the budget conclusion."
              : "decisionReason was too short to justify the budget conclusion."
        )
      ];
    }
  },
  {
    name: "compliance_commitment",
    applies(context) {
      return (
        "complianceChecks" in context.payload ||
        /compliance|retention|audit|policy|sla|security/i.test(`${context.task.title}\n${context.task.instructions}`)
      );
    },
    run(context) {
      const checks = Array.isArray(context.payload.complianceChecks) ? context.payload.complianceChecks : [];
      const normalizedChecks = checks.filter((entry): entry is string => typeof entry === "string" && entry.trim().length >= 4);
      return [
        makeResult(
          "compliance_checks_present",
          normalizedChecks.length > 0,
          normalizedChecks.length > 0 ? "Artifact included explicit compliance checks." : "Artifact omitted compliance checks."
        ),
        makeResult(
          "compliance_checks_depth",
          normalizedChecks.length >= 2 || checks.length === 0,
          checks.length === 0
            ? "Compliance depth check skipped because no structured complianceChecks field was present."
            : normalizedChecks.length >= 2
              ? "Artifact included multiple non-trivial compliance checks."
              : "Artifact included too few non-trivial compliance checks."
        )
      ];
    }
  },
  {
    name: "procurement_commitment",
    applies(context) {
      return (
        "selectedVendor" in context.payload &&
        "budgetAssessment" in context.payload &&
        "complianceChecks" in context.payload &&
        context.evidenceFiles.some((file) => file.path === "demo-fixtures/procurement-brief.md") &&
        context.evidenceFiles.some((file) => file.path.endsWith(".quote.json"))
      );
    },
    run(context) {
      return runProcurementValidators(context);
    }
  }
];

function runProcurementValidators(context: ValidationContext): AgentLog["verification"]["validatorResults"] {
  const results: AgentLog["verification"]["validatorResults"] = [];
  const fixtureDir = path.join(context.workspaceRoot, "demo-fixtures");
  const brief = fs.readFileSync(path.join(fixtureDir, "procurement-brief.md"), "utf8");
  const quotes = fs
    .readdirSync(fixtureDir)
    .filter((fileName) => fileName.endsWith(".quote.json"))
    .map((fileName) =>
      JSON.parse(fs.readFileSync(path.join(fixtureDir, fileName), "utf8")) as {
        vendor: string;
        monthlyCostUsdc: number;
        uptimeSla: string;
        auditLogExport: boolean;
        retentionDays: number;
        webhookReceipts: boolean;
      }
    );

  const budgetCeiling = Number(brief.match(/Monthly budget ceiling:\s*(\d+)\s*USDC/i)?.[1] ?? Number.NaN);
  const minUptime = Number(brief.match(/Required uptime:\s*([0-9.]+)%/i)?.[1] ?? Number.NaN);
  const maxRetentionDays = Number(brief.match(/retention.*?(\d+)\s*days/i)?.[1] ?? Number.NaN);
  const selectedVendor = typeof context.payload.selectedVendor === "string" ? context.payload.selectedVendor : null;
  const selectedQuote = quotes.find((quote) => quote.vendor === selectedVendor) ?? null;

  results.push(
    makeResult(
      "procurement_selected_vendor_exists",
      selectedQuote !== null,
      selectedQuote
        ? `Selected vendor ${selectedQuote.vendor} matched an inspected quote fixture.`
        : "Selected vendor did not match any inspected quote fixture."
    )
  );

  if (!selectedQuote) {
    return results;
  }

  const checks = [
    makeResult(
      "procurement_budget_ceiling",
      Number.isFinite(budgetCeiling) && selectedQuote.monthlyCostUsdc <= budgetCeiling,
      Number.isFinite(budgetCeiling)
        ? `Vendor ${selectedQuote.vendor} costs ${selectedQuote.monthlyCostUsdc} USDC against a ${budgetCeiling} USDC ceiling.`
        : "Budget ceiling could not be parsed from the procurement brief."
    ),
    makeResult(
      "procurement_uptime_requirement",
      Number.isFinite(minUptime) && Number.parseFloat(selectedQuote.uptimeSla.replace("%", "")) >= minUptime,
      Number.isFinite(minUptime)
        ? `Vendor ${selectedQuote.vendor} advertises ${selectedQuote.uptimeSla} against a ${minUptime}% requirement.`
        : "Required uptime could not be parsed from the procurement brief."
    ),
    makeResult(
      "procurement_audit_export",
      selectedQuote.auditLogExport,
      `Vendor ${selectedQuote.vendor} ${selectedQuote.auditLogExport ? "supports" : "does not support"} audit log export.`
    ),
    makeResult(
      "procurement_retention_limit",
      Number.isFinite(maxRetentionDays) && selectedQuote.retentionDays <= maxRetentionDays,
      Number.isFinite(maxRetentionDays)
        ? `Vendor ${selectedQuote.vendor} offers ${selectedQuote.retentionDays} days retention against a ${maxRetentionDays} day maximum.`
        : "Retention limit could not be parsed from the procurement brief."
    ),
    makeResult(
      "procurement_webhook_receipts",
      selectedQuote.webhookReceipts,
      `Vendor ${selectedQuote.vendor} ${selectedQuote.webhookReceipts ? "supports" : "does not support"} webhook receipts.`
    )
  ];
  results.push(...checks);

  const compliantQuotes = quotes.filter((quote) => {
    const uptime = Number.parseFloat(quote.uptimeSla.replace("%", ""));
    return (
      Number.isFinite(budgetCeiling) &&
      Number.isFinite(minUptime) &&
      Number.isFinite(maxRetentionDays) &&
      quote.monthlyCostUsdc <= budgetCeiling &&
      uptime >= minUptime &&
      quote.auditLogExport &&
      quote.retentionDays <= maxRetentionDays &&
      quote.webhookReceipts
    );
  });
  const cheapestCompliant = compliantQuotes.sort((left, right) => left.monthlyCostUsdc - right.monthlyCostUsdc)[0] ?? null;
  results.push(
    makeResult(
      "procurement_lowest_compliant_vendor",
      cheapestCompliant?.vendor === selectedQuote.vendor,
      cheapestCompliant
        ? `Cheapest compliant vendor is ${cheapestCompliant.vendor} at ${cheapestCompliant.monthlyCostUsdc} USDC.`
        : "No compliant vendor could be derived from the inspected fixtures."
    )
  );

  return results;
}

function extractInspectedFiles(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (typeof entry === "object" && entry && "path" in entry && typeof entry.path === "string") {
        return entry.path;
      }
      return null;
    })
    .filter((entry): entry is string => entry !== null);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function makeResult(name: string, passed: boolean, details: string) {
  return {
    name,
    passed,
    details
  };
}
