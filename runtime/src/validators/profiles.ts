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
      return (
        matchesCommitmentProfile(context.task, "structured_commitment") ||
        "taskTitle" in context.payload ||
        "decisionReason" in context.payload ||
        "complianceChecks" in context.payload
      );
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
        matchesCommitmentProfile(context.task, "selection_commitment") ||
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
        matchesCommitmentProfile(context.task, "budget_commitment") ||
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
      if (matchesCommitmentProfile(context.task, "policy_commitment")) {
        return false;
      }
      return (
        matchesCommitmentProfile(context.task, "compliance_commitment") ||
        "complianceChecks" in context.payload ||
        (!("acceptanceChecks" in context.payload) &&
          /compliance|retention|audit|policy|sla|security/i.test(`${context.task.title}\n${context.task.instructions}`))
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
        matchesCommitmentProfile(context.task, "procurement_commitment") ||
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
  },
  {
    name: "remediation_commitment",
    applies(context) {
      return (
        matchesCommitmentProfile(context.task, "remediation_commitment") ||
        ("selectedPlan" in context.payload || "filesToModify" in context.payload || "acceptanceChecks" in context.payload) &&
        context.evidenceFiles.some((file) => file.path === "demo-fixtures/remediation-brief.md") &&
        context.evidenceFiles.some((file) => file.path.startsWith("demo-fixtures/patch-plan-") && file.path.endsWith(".json"))
      );
    },
    run(context) {
      return runRemediationValidators(context);
    }
  },
  {
    name: "policy_commitment",
    applies(context) {
      return (
        matchesCommitmentProfile(context.task, "policy_commitment") ||
        (("selectedRequest" in context.payload || "policyChecks" in context.payload || "requiredControls" in context.payload) &&
          context.evidenceFiles.some((file) => file.path === "demo-fixtures/policy-brief.md") &&
          context.evidenceFiles.some((file) => file.path.startsWith("demo-fixtures/access-request-") && file.path.endsWith(".json")))
      );
    },
    run(context) {
      return runPolicyValidators(context);
    }
  }
];

function runProcurementValidators(context: ValidationContext): AgentLog["verification"]["validatorResults"] {
  const results: AgentLog["verification"]["validatorResults"] = [];
  const evidencePaths = new Set(context.evidenceFiles.map((file) => file.path));
  const briefPath = "demo-fixtures/procurement-brief.md";
  const quotePaths = [...evidencePaths].filter((filePath) => filePath.startsWith("demo-fixtures/") && filePath.endsWith(".quote.json"));
  if (!evidencePaths.has(briefPath) || quotePaths.length === 0) {
    return [
      makeResult(
        "procurement_evidence_completeness",
        false,
        "Procurement validator required a preserved brief and quote fixtures inside the evidence set."
      )
    ];
  }

  const brief = fs.readFileSync(path.join(context.workspaceRoot, briefPath), "utf8");
  const quotes = quotePaths.map((quotePath) =>
    JSON.parse(fs.readFileSync(path.join(context.workspaceRoot, quotePath), "utf8")) as {
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

function runRemediationValidators(context: ValidationContext): AgentLog["verification"]["validatorResults"] {
  const results: AgentLog["verification"]["validatorResults"] = [];
  const evidencePaths = new Set(context.evidenceFiles.map((file) => file.path));
  const briefPath = "demo-fixtures/remediation-brief.md";
  const planPaths = [...evidencePaths].filter(
    (filePath) => filePath.startsWith("demo-fixtures/patch-plan-") && filePath.endsWith(".json")
  );
  if (!evidencePaths.has(briefPath) || planPaths.length === 0) {
    return [
      makeResult(
        "remediation_evidence_completeness",
        false,
        "Remediation validator required a preserved remediation brief and one or more patch plan fixtures inside the evidence set."
      )
    ];
  }

  const brief = fs.readFileSync(path.join(context.workspaceRoot, briefPath), "utf8");
  const requiredFiles = parseBulletList(brief, "Required files:");
  const forbiddenFiles = parseBulletList(brief, "Forbidden files:");
  const requiredControls = parseBulletList(brief, "Required controls:");
  const plans = planPaths.map((planPath) =>
    JSON.parse(fs.readFileSync(path.join(context.workspaceRoot, planPath), "utf8")) as {
      plan: string;
      filesToModify: string[];
      preservesAuditLogging: boolean;
      addsUnitTests: boolean;
      sanitizesInputs: boolean;
      touchesSensitiveAuth: boolean;
      riskScore: number;
    }
  );

  const selectedPlanName = typeof context.payload.selectedPlan === "string" ? context.payload.selectedPlan.trim() : "";
  const selectedPlan = plans.find((plan) => plan.plan === selectedPlanName) ?? null;
  const filesToModify = Array.isArray(context.payload.filesToModify)
    ? context.payload.filesToModify.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const acceptanceChecks = Array.isArray(context.payload.acceptanceChecks)
    ? context.payload.acceptanceChecks.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const normalizedAcceptance = acceptanceChecks.map((entry) => entry.toLowerCase());

  results.push(
    makeResult(
      "remediation_selected_plan_exists",
      selectedPlan !== null,
      selectedPlan
        ? `Selected remediation plan ${selectedPlan.plan} matched an inspected patch-plan fixture.`
        : "Selected remediation plan did not match any inspected patch-plan fixture."
    )
  );

  if (!selectedPlan) {
    return results;
  }

  const normalizedSelectedFiles = selectedPlan.filesToModify.map((entry) => entry.toLowerCase()).sort();
  const normalizedArtifactFiles = filesToModify.map((entry) => entry.toLowerCase()).sort();
  const requiredFilesPresent = requiredFiles.every((entry) => normalizedSelectedFiles.includes(entry.toLowerCase()));
  const forbiddenTouched = forbiddenFiles.some((entry) => normalizedSelectedFiles.includes(entry.toLowerCase()));
  const compliantPlans = plans
    .filter(
      (plan) =>
        requiredFiles.every((entry) => plan.filesToModify.map((item) => item.toLowerCase()).includes(entry.toLowerCase())) &&
        !forbiddenFiles.some((entry) => plan.filesToModify.map((item) => item.toLowerCase()).includes(entry.toLowerCase())) &&
        plan.preservesAuditLogging &&
        plan.addsUnitTests &&
        plan.sanitizesInputs &&
        !plan.touchesSensitiveAuth
    )
    .sort((left, right) => left.riskScore - right.riskScore);
  const lowestRiskCompliant = compliantPlans[0] ?? null;

  results.push(
    makeResult(
      "remediation_files_match_selected_plan",
      normalizedArtifactFiles.length > 0 && JSON.stringify(normalizedArtifactFiles) === JSON.stringify(normalizedSelectedFiles),
      normalizedArtifactFiles.length > 0
        ? "Artifact filesToModify matched the selected patch plan."
        : "Artifact filesToModify was missing or empty."
    )
  );
  results.push(
    makeResult(
      "remediation_required_files_covered",
      requiredFilesPresent,
      requiredFilesPresent
        ? "Selected remediation plan covered all required files from the brief."
        : `Selected remediation plan did not cover all required files: ${requiredFiles.join(", ")}.`
    )
  );
  results.push(
    makeResult(
      "remediation_forbidden_files_avoided",
      !forbiddenTouched && !selectedPlan.touchesSensitiveAuth,
      !forbiddenTouched && !selectedPlan.touchesSensitiveAuth
        ? "Selected remediation plan avoided forbidden files and sensitive auth flows."
        : "Selected remediation plan touched a forbidden file or sensitive auth flow."
    )
  );
  results.push(
    makeResult(
      "remediation_controls_satisfied",
      selectedPlan.preservesAuditLogging && selectedPlan.addsUnitTests && selectedPlan.sanitizesInputs,
      selectedPlan.preservesAuditLogging && selectedPlan.addsUnitTests && selectedPlan.sanitizesInputs
        ? "Selected remediation plan satisfied audit logging, test, and sanitization controls."
        : "Selected remediation plan failed one or more deterministic remediation controls."
    )
  );
  results.push(
    makeResult(
      "remediation_acceptance_checks_present",
      acceptanceChecks.length >= requiredControls.length,
      acceptanceChecks.length >= requiredControls.length
        ? "Artifact included an explicit acceptance check set."
        : "Artifact omitted one or more expected acceptance checks."
    )
  );
  results.push(
    makeResult(
      "remediation_acceptance_checks_grounded",
      requiredControls.every((control) => matchesControl(control, normalizedAcceptance)),
      requiredControls.every((control) => matchesControl(control, normalizedAcceptance))
        ? "Artifact acceptance checks covered the required remediation controls."
        : `Artifact acceptance checks did not cover all required controls: ${requiredControls.join(", ")}.`
    )
  );
  results.push(
    makeResult(
      "remediation_lowest_risk_compliant_plan",
      lowestRiskCompliant?.plan === selectedPlan.plan,
      lowestRiskCompliant
        ? `Lowest-risk compliant remediation plan is ${lowestRiskCompliant.plan} with risk score ${lowestRiskCompliant.riskScore}.`
        : "No compliant remediation plan could be derived from the inspected fixtures."
    )
  );

  return results;
}

function runPolicyValidators(context: ValidationContext): AgentLog["verification"]["validatorResults"] {
  const results: AgentLog["verification"]["validatorResults"] = [];
  const evidencePaths = new Set(context.evidenceFiles.map((file) => file.path));
  const briefPath = "demo-fixtures/policy-brief.md";
  const requestPaths = [...evidencePaths].filter(
    (filePath) => filePath.startsWith("demo-fixtures/access-request-") && filePath.endsWith(".json")
  );
  if (!evidencePaths.has(briefPath) || requestPaths.length === 0) {
    return [
      makeResult(
        "policy_evidence_completeness",
        false,
        "Policy validator required a preserved policy brief and one or more access request fixtures inside the evidence set."
      )
    ];
  }

  const brief = fs.readFileSync(path.join(context.workspaceRoot, briefPath), "utf8");
  const approvedRegions = parseBulletList(brief, "Approved regions:").map((entry) => entry.toLowerCase());
  const forbiddenDataClasses = parseBulletList(brief, "Forbidden data classes:").map((entry) => entry.toLowerCase());
  const requiredControls = parseBulletList(brief, "Required controls:");
  const maxDurationDays = Number(brief.match(/Maximum duration:\s*(\d+)\s*days/i)?.[1] ?? Number.NaN);
  const requests = requestPaths.map((requestPath) =>
    JSON.parse(fs.readFileSync(path.join(context.workspaceRoot, requestPath), "utf8")) as {
      request: string;
      region: string;
      dataClasses: string[];
      readOnly: boolean;
      durationDays: number;
      ticketRef: string | null;
      riskScore: number;
    }
  );

  const selectedRequestName = typeof context.payload.selectedRequest === "string" ? context.payload.selectedRequest.trim() : "";
  const selectedRequest = requests.find((request) => request.request === selectedRequestName) ?? null;
  const policyChecks = Array.isArray(context.payload.policyChecks)
    ? context.payload.policyChecks.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const controls = Array.isArray(context.payload.requiredControls)
    ? context.payload.requiredControls.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const normalizedPolicyChecks = policyChecks.map((entry) => entry.toLowerCase());
  const normalizedControls = controls.map((entry) => entry.toLowerCase());

  results.push(
    makeResult(
      "policy_selected_request_exists",
      selectedRequest !== null,
      selectedRequest
        ? `Selected access request ${selectedRequest.request} matched an inspected fixture.`
        : "Selected access request did not match any inspected fixture."
    )
  );

  if (!selectedRequest) {
    return results;
  }

  const compliantRequests = requests
    .filter((request) => {
      const normalizedClasses = request.dataClasses.map((entry) => entry.toLowerCase());
      return (
        approvedRegions.includes(request.region.toLowerCase()) &&
        normalizedClasses.every((entry) => !forbiddenDataClasses.includes(entry)) &&
        request.readOnly &&
        Number.isFinite(maxDurationDays) &&
        request.durationDays <= maxDurationDays &&
        !!request.ticketRef
      );
    })
    .sort((left, right) => left.riskScore - right.riskScore);
  const lowestRiskCompliant = compliantRequests[0] ?? null;

  results.push(
    makeResult(
      "policy_region_allowed",
      approvedRegions.includes(selectedRequest.region.toLowerCase()),
      `Selected request region ${selectedRequest.region} ${approvedRegions.includes(selectedRequest.region.toLowerCase()) ? "is" : "is not"} inside the approved region set.`
    )
  );
  results.push(
    makeResult(
      "policy_forbidden_data_avoided",
      selectedRequest.dataClasses.map((entry) => entry.toLowerCase()).every((entry) => !forbiddenDataClasses.includes(entry)),
      selectedRequest.dataClasses.length > 0
        ? "Selected request data classes were checked against the forbidden data list."
        : "Selected request omitted data classes."
    )
  );
  results.push(
    makeResult(
      "policy_read_only_control",
      selectedRequest.readOnly,
      selectedRequest.readOnly
        ? "Selected request remained read-only as required by policy."
        : "Selected request was not read-only."
    )
  );
  results.push(
    makeResult(
      "policy_duration_limit",
      Number.isFinite(maxDurationDays) && selectedRequest.durationDays <= maxDurationDays,
      Number.isFinite(maxDurationDays)
        ? `Selected request duration ${selectedRequest.durationDays} days was checked against a ${maxDurationDays}-day maximum.`
        : "Maximum duration could not be parsed from the policy brief."
    )
  );
  results.push(
    makeResult(
      "policy_ticket_reference",
      typeof selectedRequest.ticketRef === "string" && selectedRequest.ticketRef.trim().length > 0,
      selectedRequest.ticketRef ? `Selected request referenced ticket ${selectedRequest.ticketRef}.` : "Selected request was missing a ticket reference."
    )
  );
  results.push(
    makeResult(
      "policy_checks_present",
      policyChecks.length >= 2,
      policyChecks.length >= 2 ? "Artifact included explicit policy checks." : "Artifact omitted explicit policy checks."
    )
  );
  results.push(
    makeResult(
      "policy_controls_present",
      controls.length >= requiredControls.length,
      controls.length >= requiredControls.length
        ? "Artifact included the required control list."
        : "Artifact omitted one or more required policy controls."
    )
  );
  results.push(
    makeResult(
      "policy_controls_grounded",
      requiredControls.every((control) => matchesControl(control, normalizedPolicyChecks) || matchesControl(control, normalizedControls)),
      requiredControls.every((control) => matchesControl(control, normalizedPolicyChecks) || matchesControl(control, normalizedControls))
        ? "Artifact policy checks covered the required controls from the policy brief."
        : `Artifact policy checks did not cover all required controls: ${requiredControls.join(", ")}.`
    )
  );
  results.push(
    makeResult(
      "policy_lowest_risk_compliant_request",
      lowestRiskCompliant?.request === selectedRequest.request,
      lowestRiskCompliant
        ? `Lowest-risk compliant request is ${lowestRiskCompliant.request} with risk score ${lowestRiskCompliant.riskScore}.`
        : "No compliant access request could be derived from the inspected fixtures."
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

function parseBulletList(content: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`${escaped}\\s*([\\s\\S]*?)(?:\\n\\n|$)`, "i"));
  if (!match) {
    return [];
  }
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function matchesControl(control: string, normalizedAcceptance: string[]): boolean {
  const ignored = new Set(["with", "from", "that"]);
  const keywords = control
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !ignored.has(token));
  return keywords.some((keyword) => {
    const stem = keyword.slice(0, 6);
    return normalizedAcceptance.some((entry) => entry.includes(keyword) || entry.includes(stem));
  });
}

function makeResult(name: string, passed: boolean, details: string) {
  return {
    name,
    passed,
    details
  };
}

function matchesCommitmentProfile(task: TaskRecord, expected: string): boolean {
  return task.commitmentProfile?.trim().toLowerCase() === expected;
}
