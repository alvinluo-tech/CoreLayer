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

  it("does not treat an explanatory mention of a token as a credential prompt", () => {
    // The agent describing its own work must not be mistaken for a prompt
    // and killed mid-answer.
    const decision = evaluateInteraction(
      "I store the auth token in an httpOnly cookie and send it on each request.",
      createDefaultExecutionPolicy("builder"),
    );

    expect(decision.action).toBe("none");
  });

  it("still blocks a real credential prompt phrased as a question", () => {
    const decision = evaluateInteraction(
      "Enter your OpenAI API key:\n",
      createDefaultExecutionPolicy("builder"),
    );

    expect(decision).toMatchObject({ action: "block", kind: "credential" });
  });
});
