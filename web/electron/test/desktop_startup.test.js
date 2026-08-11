"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { prepareDesktopStartup } = require("../src/desktop_startup");

function harness(overrides = {}) {
  const calls = [];
  return {
    calls,
    options: {
      savedServerUrl: null,
      cliPath: "/repo/.venv/bin/omnigent",
      isLoopbackServer: (url) => url.startsWith("http://127.0.0.1:"),
      startLocalServer: async (cliPath) => {
        calls.push(["server", cliPath]);
        return { ok: true, url: "http://127.0.0.1:6767" };
      },
      ensureHostConnected: async (cliPath, serverUrl) => {
        calls.push(["host", cliPath, serverUrl]);
        return { ok: true };
      },
      ...overrides,
    },
  };
}

describe("prepareDesktopStartup", () => {
  it("starts the local server and host on first launch", async () => {
    const h = harness();
    const result = await prepareDesktopStartup(h.options);

    assert.deepEqual(result, {
      mode: "local",
      serverUrl: "http://127.0.0.1:6767",
      hostReady: true,
    });
    assert.deepEqual(h.calls, [
      ["server", "/repo/.venv/bin/omnigent"],
      ["host", "/repo/.venv/bin/omnigent", "http://127.0.0.1:6767"],
    ]);
  });

  it("repairs a saved local launch but preserves a saved remote choice", async () => {
    const local = harness({ savedServerUrl: "http://127.0.0.1:9000" });
    assert.equal((await prepareDesktopStartup(local.options)).mode, "local");
    assert.equal(local.calls.length, 2);

    const remote = harness({ savedServerUrl: "https://omnigent.example.com" });
    assert.deepEqual(await prepareDesktopStartup(remote.options), {
      mode: "remote",
      serverUrl: "https://omnigent.example.com",
      hostReady: false,
    });
    assert.deepEqual(remote.calls, []);
  });

  it("falls back to setup when the CLI or local server is unavailable", async () => {
    const missing = harness({ cliPath: null });
    assert.equal((await prepareDesktopStartup(missing.options)).mode, "setup");
    assert.deepEqual(missing.calls, []);

    const failed = harness({
      startLocalServer: async () => ({ ok: false, error: "port unavailable" }),
    });
    assert.deepEqual(await prepareDesktopStartup(failed.options), {
      mode: "setup",
      serverUrl: null,
      hostReady: false,
      error: "port unavailable",
    });
  });

  it("opens the local UI with a surfaced warning when host startup fails", async () => {
    const h = harness({
      ensureHostConnected: async () => ({ ok: false, error: "host failed" }),
    });
    assert.deepEqual(await prepareDesktopStartup(h.options), {
      mode: "local",
      serverUrl: "http://127.0.0.1:6767",
      hostReady: false,
      error: "host failed",
    });
  });
});
