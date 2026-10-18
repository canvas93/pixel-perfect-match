# OpenClaw connection fixes
- [ ] Add an automatically collected, searchable asset vault with metadata and downloads.
- [ ] Add simultaneous split-view agent comparison with isolated histories and exports.
- [ ] Test the new workflow and inspect the chat and vault.
- [x] Open directly into chat without documentation text.
- [x] Send selected agent IDs in chat payloads, including adin.
- [x] Correct automation requests, response handling, and errors.
- [x] Test payload rules and verify chat, history, and manual execution with controlled responses (11 tests passed).
- [ ] Verify real OpenClaw replies and automation execution — blocked by missing backend routing in this preview (chat HTTP 406; admin RPC HTTP 404); requires the user's OpenClaw deployment connection.