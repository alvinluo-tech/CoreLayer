import { describe, it, expect } from "vitest";
import {
  planTaskGraph,
  TaskGraphRejected,
  MAX_GRAPH_NODES,
  type TaskGraphInput,
} from "../task-graph-dag.js";
import {
  rootDelegationBounds,
  DelegationRejected,
  type DelegationBounds,
} from "../delegation-bounds.js";

describe("planTaskGraph", () => {
  const defaultParentBounds: DelegationBounds = {
    ...rootDelegationBounds(),
    timeoutMs: 15 * 60_000,
  };

  it("plans a single node with no dependencies", () => {
    const input: TaskGraphInput = {
      nodes: [{ id: "solo", task: "Do standalone work" }],
    };

    const plan = planTaskGraph(input, defaultParentBounds);
    expect(plan.waves).toEqual([["solo"]]);
    expect(plan.nodes["solo"].dependencies).toEqual([]);
    expect(plan.nodes["solo"].dependents).toEqual([]);
    expect(plan.failFast).toBe(true);
  });

  it("plans independent nodes in a single parallel wave", () => {
    const input: TaskGraphInput = {
      nodes: [
        { id: "worker-b", task: "Process B", allowedPaths: ["src/b/**"] },
        { id: "worker-a", task: "Process A", allowedPaths: ["src/a/**"] },
        { id: "worker-c", task: "Process C", allowedPaths: ["src/c/**"] },
      ],
    };

    const plan = planTaskGraph(input, defaultParentBounds);
    expect(plan.waves).toEqual([["worker-a", "worker-b", "worker-c"]]);
    expect(plan.parallelPathWarnings).toEqual([]);
  });

  it("plans a linear dependency chain into sequential waves", () => {
    const input: TaskGraphInput = {
      nodes: [
        { id: "step3", task: "Step 3", dependencies: ["step2"] },
        { id: "step1", task: "Step 1" },
        { id: "step2", task: "Step 2", dependencies: ["step1"] },
      ],
    };

    const plan = planTaskGraph(input, defaultParentBounds);
    expect(plan.waves).toEqual([["step1"], ["step2"], ["step3"]]);
    expect(plan.nodes["step1"].dependents).toEqual(["step2"]);
    expect(plan.nodes["step2"].dependents).toEqual(["step3"]);
  });

  it("plans a diamond DAG into 3 distinct waves (Root -> [B, C] -> Join)", () => {
    const input: TaskGraphInput = {
      nodes: [
        { id: "root", task: "Parse schemas" },
        { id: "branch-b", task: "Gen Client", dependencies: ["root"], allowedPaths: ["src/client/**"] },
        { id: "branch-c", task: "Gen Server", dependencies: ["root"], allowedPaths: ["src/server/**"] },
        { id: "join", task: "Run integration tests", dependencies: ["branch-b", "branch-c"] },
      ],
    };

    const plan = planTaskGraph(input, defaultParentBounds);
    expect(plan.waves).toEqual([
      ["root"],
      ["branch-b", "branch-c"],
      ["join"],
    ]);
    expect(plan.parallelPathWarnings).toEqual([]);
  });

  it("rejects graphs with duplicate node IDs", () => {
    const input: TaskGraphInput = {
      nodes: [
        { id: "dup", task: "Task 1" },
        { id: "dup", task: "Task 2" },
      ],
    };

    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(TaskGraphRejected);
    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(/Duplicate node id/);
  });

  it("rejects invalid node IDs", () => {
    const input: TaskGraphInput = {
      nodes: [{ id: "bad id with spaces!", task: "Task" }],
    };

    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(TaskGraphRejected);
  });

  it("rejects empty node lists or exceeding MAX_GRAPH_NODES", () => {
    expect(() => planTaskGraph({ nodes: [] }, defaultParentBounds)).toThrow(TaskGraphRejected);

    const tooMany = Array.from({ length: MAX_GRAPH_NODES + 1 }, (_, i) => ({
      id: `node-${i}`,
      task: "Task",
    }));
    expect(() => planTaskGraph({ nodes: tooMany }, defaultParentBounds)).toThrow(
      /exceeds maximum allowed nodes/,
    );
  });

  it("rejects self-cycles", () => {
    const input: TaskGraphInput = {
      nodes: [{ id: "loop", task: "Loop", dependencies: ["loop"] }],
    };

    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(TaskGraphRejected);
    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(/cannot depend on itself/);
  });

  it("rejects unknown dependency references", () => {
    const input: TaskGraphInput = {
      nodes: [{ id: "orphan", task: "Task", dependencies: ["non-existent"] }],
    };

    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(TaskGraphRejected);
    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(/depends on unknown node/);
  });

  it("detects 2-node circular dependencies (A <-> B)", () => {
    const input: TaskGraphInput = {
      nodes: [
        { id: "node-a", task: "Task A", dependencies: ["node-b"] },
        { id: "node-b", task: "Task B", dependencies: ["node-a"] },
      ],
    };

    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(TaskGraphRejected);
    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(/Circular dependency/);
  });

  it("detects complex multi-node cycles with partial components", () => {
    const input: TaskGraphInput = {
      nodes: [
        { id: "root", task: "OK Root" },
        { id: "cycle-1", task: "C1", dependencies: ["root", "cycle-3"] },
        { id: "cycle-2", task: "C2", dependencies: ["cycle-1"] },
        { id: "cycle-3", task: "C3", dependencies: ["cycle-2"] },
      ],
    };

    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(TaskGraphRejected);
    expect(() => planTaskGraph(input, defaultParentBounds)).toThrow(/Circular dependency detected/);
  });

  it("enforces monotonic bounds narrowing on every graph node", () => {
    const restrictedParent: DelegationBounds = {
      ...defaultParentBounds,
      allowedPaths: ["src/frontend/**"],
    };

    const input: TaskGraphInput = {
      nodes: [
        { id: "valid", task: "Edit UI", allowedPaths: ["src/frontend/components/**"] },
        { id: "invalid", task: "Edit Backend", allowedPaths: ["src/backend/**"] },
      ],
    };

    expect(() => planTaskGraph(input, restrictedParent)).toThrow(DelegationRejected);
  });

  it("detects path collisions for concurrent nodes in the same wave", () => {
    const input: TaskGraphInput = {
      nodes: [
        { id: "writer-1", task: "Edit parser", allowedPaths: ["src/parser/**"] },
        { id: "writer-2", task: "Edit parser index", allowedPaths: ["src/parser/index.ts"] },
      ],
    };

    const plan = planTaskGraph(input, defaultParentBounds);
    expect(plan.parallelPathWarnings.length).toBe(1);
    expect(plan.parallelPathWarnings[0]).toMatchObject({
      waveIndex: 0,
      nodeA: "writer-1",
      nodeB: "writer-2",
    });
  });
});
