import { describe, expect, it } from "vitest";
import {
  createDefaultExecutionPolicy,
  evaluateInteraction,
} from "./interaction-broker.js";

describe("evaluateInteraction", () => {
  it("auto-confirms low-risk continue prompts in builder autopilot", () => {
    const decision = evaluateInteraction(
      "Do you want to continue? [y/N]",
      createDefaultExecutionPolicy("builder"),
    );

    expect(decision).toEqual({
      action: "respond",
      response: "y\n",
      reason: "Low-risk continuation prompt",
      kind: "confirmation",
    });
  });

  it("auto-confirms dependency installation in builder autopilot", () => {
    const decision = evaluateInteraction(
      "Need to install missing packages. Install dependencies? [Y/n]",
      createDefaultExecutionPolicy("builder"),
    );

    expect(decision.action).toBe("respond");
    expect(decision.response).toBe("y\n");
    expect(decision.kind).toBe("dependency_install");
  });

  it("blocks login and credential prompts instead of guessing", () => {
    const decision = evaluateInteraction(
      "Login required. Please enter your API key:",
      createDefaultExecutionPolicy("builder"),
    );

    expect(decision).toMatchObject({
      action: "block",
      kind: "credential",
    });
  });

  it("blocks destructive prompts even in full autonomy mode", () => {
    const decision = evaluateInteraction(
      "Delete directory node_modules and all contents? [y/N]",
      createDefaultExecutionPolicy("full"),
    );

    expect(decision).toMatchObject({
      action: "block",
      kind: "destructive",
    });
  });

  it("returns none for normal output", () => {
    const decision = evaluateInteraction(
      "Running tests...\nAll files compiled successfully.",
      createDefaultExecutionPolicy("builder"),
    );

    expect(decision.action).toBe("none");
  });
});
