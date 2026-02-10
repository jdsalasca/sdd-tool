const test = require("node:test");
const assert = require("node:assert/strict");

const { geminiProvider } = require("../dist/providers/gemini.js");

test("gemini chooseModel starts from highest-priority model", () => {
  const model = geminiProvider.chooseModel({
    configuredModel: "",
    currentModel: "",
    reason: "initial",
    failureStreak: 0,
    triedModels: []
  });
  assert.equal(model, "gemini-3-pro-preview");
});

test("gemini chooseModel advances through priority list with tried models", () => {
  const model = geminiProvider.chooseModel({
    configuredModel: "",
    currentModel: "gemini-2.5-pro",
    reason: "provider_quota",
    failureStreak: 2,
    triedModels: ["gemini-3-pro-preview", "gemini-2.5-pro"]
  });
  assert.equal(model, "gemini-3-flash-preview");
});

test("gemini chooseModel keeps current model on command-length issue", () => {
  const model = geminiProvider.chooseModel({
    configuredModel: "",
    currentModel: "gemini-2.5-flash",
    reason: "provider_command_too_long",
    failureStreak: 1,
    triedModels: ["gemini-3-pro-preview", "gemini-2.5-pro", "gemini-3-flash-preview"]
  });
  assert.equal(model, "gemini-2.5-flash");
});
