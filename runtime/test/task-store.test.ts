import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDatabase } from "../src/storage/database.js";
import { TaskStore } from "../src/storage/task-store.js";
import type { RunRecord, TaskRecord } from "../src/core/types.js";

test("task store saves and loads task records", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-store-"));
  const db = openDatabase(path.join(tempDir, "runtime.db"));
  const store = new TaskStore(db);
  const task: TaskRecord = {
    id: "task_test",
    title: "Demo",
    instructions: "Do the thing",
    outputSchemaJson: "{\"summary\":\"string\"}",
    reward: 1,
    requiredStake: 1,
    deadlineTs: 1,
    status: "draft",
    covenantId: null,
    executorAgentId: 1,
    createdBy: "mock",
    proofHash: null,
    taskHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    artifactPath: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  store.saveTask(task);
  const loaded = store.getTask(task.id);
  assert.ok(loaded);
  assert.equal(loaded?.title, task.title);
});

test("task store persists run log metadata", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustcommit-store-"));
  const db = openDatabase(path.join(tempDir, "runtime.db"));
  const store = new TaskStore(db);

  const run: RunRecord = {
    id: "run_test",
    taskId: "task_test",
    agentRole: "executor",
    provider: "claude",
    model: "claude-opus-4-6",
    status: "completed",
    inputJson: "{\"taskHash\":\"0x123\"}",
    logPath: path.join(tempDir, "agent_log.json"),
    outputJson: "{\"summary\":\"ok\"}",
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  store.saveRun(run);
  const loaded = store.listRuns(run.taskId);

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.logPath, run.logPath);
  assert.equal(loaded[0]?.inputJson, run.inputJson);
});
