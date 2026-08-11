# Desktop-first, provider-portable Omnigent

- Status: Proposed; first Phase 0 and Phase 1 startup slices implemented
- Scope: local desktop experience, optional remote control plane, provider switching,
  durable context, artifacts, guidance, policies, and connectors

## Summary

Omnigent should feel like a local desktop application even though its internal
architecture uses a server and one or more execution hosts. In local mode the app owns
those processes and their lifecycle; the user should not need to start, monitor, or stop
them. The same UI can connect to a remote Omnigent server when collaboration or an
always-on control plane is wanted.

The conversation should be the stable product object. Models, providers, harnesses,
hosts, and connectors are execution choices attached to turns or epochs of turns. A
provider switch must not create a new conversation. Omnigent should preserve a canonical,
provider-neutral transcript and rebuild the target harness from a portable context
checkpoint.

No model has a literally infinite context window. The achievable guarantee is an
unbounded durable transcript with a bounded, continuously rebuilt working context whose
summaries and retrieval decisions are inspectable.

## What exists on current `main`

| Concern                 | Current capability                                                                                                                                          | Remaining gap                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local desktop           | Electron now starts/reuses the local server and host on default launch, prefers the checkout CLI in development, and cleans up app-owned processes on quit. | A packaged release still needs a bundled runtime, plus startup UI, crash recovery, diagnostics, drain, and upgrade behavior.                                           |
| Model switching         | `/model` and model pickers update `model_override` for supported harnesses.                                                                                 | This changes a model within a compatible harness; it is not the complete cross-provider experience.                                                                    |
| Agent/harness switching | `POST /v1/sessions/{id}/switch-agent` preserves the session and normalized history for supported targets. The header now mounts the tested switch dialog.   | Some harnesses cannot rebuild history and must remain unavailable; continuity reporting is still missing.                                                              |
| Context rollover        | Server-side and several harness-native compaction paths exist, with context-window telemetry and persisted compaction markers.                              | There is no explicit cross-provider checkpoint contract or user-facing continuity guarantee.                                                                           |
| Attachments             | Images, PDFs, text/code uploads, and workspace file/folder `@` mentions are supported.                                                                      | Office files, audio, video, archives, external folders, extraction status, and capability-aware delivery are missing.                                                  |
| Guidance and guardrails | Agent instructions, `AGENTS.md` discovery, server/agent/session policies, and framework-owned prompt additions exist.                                       | There is no user-friendly global/project guidance stack. Soft instructions and enforceable policy are presented as separate features rather than one coherent profile. |
| MCP                     | Agent YAML plus session-scoped MCP CRUD support HTTP and stdio servers.                                                                                     | There is no reusable connector registry, OAuth lifecycle, health/status center, project/session enablement, or consistent per-tool approval management.                |

## Product model

### Conversation is canonical

A conversation owns:

- an append-only normalized event log;
- user-visible messages and tool activity;
- artifact references;
- compaction checkpoints;
- instruction/profile references;
- connector grants;
- execution epochs.

An execution epoch records the harness, provider, model, host, start item, end item, and
the checkpoint used to initialize it. Changing any execution choice closes one epoch and
starts another without changing the conversation id.

Provider-private state is explicitly non-portable. Hidden reasoning, vendor caches,
provider-specific tool state, and opaque remote conversation ids are not promised across
a switch. User-visible messages, normalized tool calls/results, artifacts, summaries,
tasks, and workspace state are portable.

### Three operating modes

1. **Local integrated** (default)
   - The desktop launches a loopback-only control plane and local execution host.
   - Both are child/supervised processes owned by the app.
   - The UI says “Local” and “This Mac”, not “server” and “daemon”.
   - First use asks once for permission to run agents locally.
   - Normal launch restores the last workspace without a setup screen.

2. **Remote control plane, local execution**
   - The desktop connects to a remote Omnigent URL.
   - Work still runs on the user's machine through a locally supervised host.
   - Useful for phone access and collaboration without moving credentials or source code
     to the remote server.

3. **Remote control plane, remote execution**
   - The server selects an EC2, Kubernetes, sandbox, or other managed host.
   - Credentials and subscription logins must exist on that execution host.
   - Local subscription credential files are never copied to the server automatically.

The web API remains the boundary in all three modes. Local integrated mode hides the
boundary rather than replacing it, so remote mode does not require a second product.

## Desktop lifecycle

The first supervisor slice now implements automatic local server/host startup, healthy
runtime reuse, source-checkout CLI selection in development, and ownership-aware quit
cleanup. Continue toward the full supervisor contract:

```text
ensureLocalRuntime() -> { origin, hostId, version, ownership }
getLocalRuntimeStatus() -> starting | ready | degraded | stopped
restartLocalRuntime()
stopLocalRuntime({ drain })
```

The supervisor must:

- bind only to loopback unless LAN access is explicitly enabled;
- choose and persist a collision-free port;
- reuse a healthy compatible runtime;
- restart on version/config mismatch;
- drain active turns before upgrade or shutdown when practical;
- expose logs through a “Local runtime” diagnostics panel;
- leave externally started processes alone;
- surface one recovery action rather than process-management instructions.

The preferred startup flow is:

```text
app launch -> resolve CLI/runtime -> ensure local control plane
           -> ensure trusted local host -> open last workspace
```

Remote profiles remain selectable from the sidebar. Selecting a remote profile does not
stop the local runtime unless the user requests it.

## Provider and harness switching

The switcher should distinguish two operations:

- **Model**: change model/reasoning within the current harness.
- **Agent runtime**: change provider/harness while keeping the conversation.

Before a runtime switch Omnigent creates a portable checkpoint:

```yaml
checkpoint_version: 1
conversation_id: conv_123
through_item_id: item_456
summary: ...
active_goals: [...]
decisions: [...]
open_questions: [...]
workspace:
  cwd: ...
  branch: ...
  changed_files: [...]
artifacts: [...]
recent_items: [...]
```

The target adapter declares whether it can initialize from normalized history, a text
preamble, or neither. The UI lists only targets that meet the requested continuity level.
If continuity would be lossy, the switcher describes exactly what will reset before the
user confirms.

Cross-provider switches reset provider-bound model ids and reasoning settings. They do
not reset the conversation, workspace, files, comments, tasks, or portable history.

## Durable long-context design

Use four layers:

1. **Immutable transcript** — every normalized user-visible event remains durable.
2. **Checkpoint chain** — each compaction stores its source range, summary, model,
   strategy, and predecessor checkpoint.
3. **Working set** — system guidance, latest checkpoint, recent turns, active tasks, and
   selected artifacts fit the target model's budget.
4. **Retrieval** — older transcript ranges and artifacts are fetched by semantic and
   structural relevance, with source item ids retained.

Budgeting happens before every turn using the selected target's context window. A single
server-owned planner chooses the budget even when a harness performs the final native
compaction. This avoids different providers silently disagreeing about what “the current
conversation” contains.

The UI should show:

- current context occupancy;
- last checkpoint time and source range;
- whether the current runtime was rebuilt from a checkpoint;
- a “What was carried over?” view after a provider switch;
- manual compact/rebuild controls.

## Artifact and folder model

Uploads and workspace mentions should converge on an `ArtifactRef`:

```yaml
id: art_123
kind: file | folder_snapshot | image | pdf | audio | video | archive
name: quarterly-review.mp4
mime_type: video/mp4
size: 123456
storage_uri: ...
source: upload | workspace | connector
extracts:
  transcript: art_124
  text: art_125
  thumbnails: [art_126]
```

Folders are manifests, not giant concatenated prompts. A folder snapshot stores relative
paths, sizes, hashes, exclusions, and a source root. The agent receives the manifest and
uses file tools or retrieval to open relevant entries.

Each harness adapter advertises accepted modalities. The resolver then chooses one of:

- direct native input;
- extracted text/transcript;
- generated thumbnails plus transcript;
- artifact metadata plus a tool for selective reading;
- a clear unsupported error.

Initial formats should be images, PDF, text/code, DOCX, XLSX/CSV, PPTX, common audio,
common video, and ZIP/TAR manifests. Executables remain blocked by default.

## Guidance and enforcement profiles

Guidance and enforcement must stay distinct:

- **Guidance** influences model behavior but cannot guarantee compliance.
- **Policies** gate actions in code and can enforce allow/deny/approval decisions.

Compose guidance in this order:

1. user global guidance;
2. project/workspace guidance;
3. agent instructions;
4. session guidance;
5. per-turn instructions;
6. framework-owned lifecycle metadata.

Framework-owned text remains additive at the prompt-composition boundary and is not
stored in `AgentSpec`. The effective prompt records source hashes so the user can inspect
which layers applied to a turn.

An `ExecutionProfile` groups reusable defaults:

```yaml
name: careful-local-development
guidance:
  global: ~/.omnigent/guidance.md
policies:
  - ask_on_os_tools
  - protect_secrets
connectors:
  - github-readonly
defaults:
  agent: codex-native
  model: default
  host: local
```

Remote admins may lock policy layers. Users may add stricter policies but cannot weaken
locked ones.

## Connector registry

Separate installed connectors from their use in an agent session.

The registry owns:

- stable connector id and display metadata;
- MCP transport and launch configuration;
- secret references, never raw secrets in agent bundles;
- OAuth state, scopes, expiry, and re-authentication;
- health and tool discovery status;
- enabled/disabled state;
- tool allow/deny lists and approval modes;
- scope: global, project, agent, or session;
- host placement: local, remote, or either.

Agent bundles reference connector ids. At session materialization the registry resolves
those references into harness-specific MCP configuration. Native Codex and Claude
configuration can be imported as discovered connectors, but Omnigent should not silently
rewrite the user's vendor configuration.

The management UI needs Installed, Available, Authentication, Tools, Permissions, and
Diagnostics views. Session-level MCP editing can remain as an advanced “private copy”
workflow.

## Subscription authentication boundary

Subscription access remains vendor-owned:

- Codex execution invokes an authenticated Codex CLI/app-server.
- Claude execution invokes an authenticated Claude Code CLI/SDK path.
- Omnigent stores readiness metadata, not reusable subscription tokens.
- Login and refresh happen through vendor-supported flows.
- A remote execution host needs its own supported login; a remote control plane with a
  local host can keep the login local.

Direct API adapters remain available for automation and providers that do not offer a
subscription-backed harness, but they are a separate billing mode.

## Delivery plan

### Phase 0 — expose capabilities already present

- [x] Mount the tested in-place Switch Agent dialog.
- Rename local setup copy around “Work locally”.
- Add a capability/status page that explains model switch, runtime switch, attachments,
  compaction, and MCP support for the selected harness.

### Phase 1 — integrated local mode

- [x] Add automatic local server startup/reuse and ownership-aware shutdown.
- [x] Auto-connect the local host for the app-owned loopback runtime.
- [x] Preserve a saved remote server as an explicit remote-mode launch.
- Bundle the Python runtime/CLI into packaged desktop releases.
- Add recovery, diagnostics, drain, and upgrade behavior.
- Keep remote server profiles in the same shell.

### Phase 2 — portable checkpoints

- Add execution epochs and checkpoint schema.
- Rebuild supported harnesses from the checkpoint contract.
- Add switch continuity reporting and cross-provider integration tests.

### Phase 3 — artifacts

- Add `ArtifactRef`, folder manifests, extractors, and modality negotiation.
- Extend composer upload/paste/drop and background extraction status.

### Phase 4 — profiles and policies

- Add global/project/session guidance UI.
- Add effective-guidance inspection and locked policy layers.
- Add reusable execution profiles.

### Phase 5 — connector registry

- Add reusable connector records, secret references, OAuth, health, and permissions.
- Resolve registry entries into each harness at session materialization.

## Acceptance criteria

- A new user installs once, opens the desktop app, approves local execution once, and can
  start a conversation without running a command or managing a process.
- The same conversation can switch between at least Codex and Claude targets, and the
  next target can answer a question about earlier visible context.
- A switch records what was retained and what reset.
- Context rollover preserves a durable, inspectable checkpoint chain.
- A user can attach a workspace folder, Office document, audio file, or video and see how
  it was resolved for the selected harness.
- Global/project guidance applies to new sessions; enforceable restrictions remain active
  across provider switches.
- Connectors can be installed once, authenticated, scoped, enabled, inspected, and reused
  without editing an agent bundle.
