// The agent template schema + compiler now live in @longshot/shared so the register UI and the
// runtime compile identically. Re-exported here so existing agent imports keep working.

export {
  EVIDENCE_SOURCES,
  DEFAULT_MODEL,
  TemplateValidationError,
  hashTemplate,
  compileTemplate,
  type AgentTemplate,
  type AgentConfig,
} from "@longshot/shared";
