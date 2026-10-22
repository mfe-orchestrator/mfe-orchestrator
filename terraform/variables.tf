# Values that differ per server, or are secret, so they stay out of the repository.
# Set them on the server in a terraform.tfvars next to this file, or as TF_VAR_<name>
# in the environment `tofu apply` runs in.

variable "frontend_url" {
  type        = string
  description = "Public URL the console is reached at, without trailing slash (e.g. https://dev.mfe-orchestrator.dev). The MCP and OAuth URLs are derived from it."
}

variable "jwt_secret" {
  type        = string
  sensitive   = true
  description = "Signing secret for console and MCP tokens, at least 32 bytes. Generate it with `openssl rand -hex 32`."
}

variable "mcp_enabled" {
  type        = bool
  default     = true
  description = "Exposes the MCP server at <frontend_url>/api/mcp."
}

variable "anthropic_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Enables the console assistant when set."
}
