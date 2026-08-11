// Desktop-first startup policy for Omnigent.
//
// A saved remote server remains an explicit remote-mode choice. With no saved
// remote (first launch or a prior loopback URL), Electron owns local startup:
// ensure the server, then ensure this machine's host tunnel before opening the
// SPA. The process ownership details stay in server_manager.js.

"use strict";

/**
 * Prepare the server used by the default desktop window.
 *
 * Never throws: startup failures return setup mode so Electron can show its
 * normal recovery page instead of failing before a window exists.
 *
 * @param {{
 *   savedServerUrl: string | null,
 *   cliPath: string | null,
 *   isLoopbackServer: (url: string) => boolean,
 *   startLocalServer: (cliPath: string) => Promise<Record<string, unknown>>,
 *   ensureHostConnected: (cliPath: string, serverUrl: string) => Promise<Record<string, unknown>>,
 * }} options
 * @returns {Promise<{
 *   mode: "local" | "remote" | "setup",
 *   serverUrl: string | null,
 *   hostReady: boolean,
 *   error?: string,
 * }>}
 */
async function prepareDesktopStartup(options) {
  const saved =
    typeof options.savedServerUrl === "string" && options.savedServerUrl.trim() !== ""
      ? options.savedServerUrl
      : null;

  if (saved && !options.isLoopbackServer(saved)) {
    return { mode: "remote", serverUrl: saved, hostReady: false };
  }
  if (!options.cliPath) {
    return {
      mode: "setup",
      serverUrl: null,
      hostReady: false,
      error: "The Omnigent CLI was not found.",
    };
  }

  try {
    const server = await options.startLocalServer(options.cliPath);
    if (!server?.ok || typeof server.url !== "string" || server.url === "") {
      return {
        mode: "setup",
        serverUrl: null,
        hostReady: false,
        error: String(server?.error || "Could not start the local Omnigent server."),
      };
    }

    const host = await options.ensureHostConnected(options.cliPath, server.url);
    return {
      mode: "local",
      serverUrl: server.url,
      hostReady: host?.ok === true,
      ...(host?.ok === true
        ? {}
        : { error: String(host?.error || "Could not connect this machine as a host.") }),
    };
  } catch (error) {
    return {
      mode: "setup",
      serverUrl: null,
      hostReady: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = { prepareDesktopStartup };
