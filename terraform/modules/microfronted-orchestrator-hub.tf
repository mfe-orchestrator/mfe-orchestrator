# Dev follows the branch: every push to `development` publishes this tag. The tag
# alone never changes, so the registry digest is what tells tofu to pull again and
# recreate the container.
data "docker_registry_image" "microfrontend_orchestrator_hub" {
  name = "lory1990/mfe-orchestrator:development"
}

resource "docker_image" "microfrontend_orchestrator_hub" {
  name          = data.docker_registry_image.microfrontend_orchestrator_hub.name
  pull_triggers = [data.docker_registry_image.microfrontend_orchestrator_hub.sha256_digest]
  keep_locally  = true
}
resource "docker_container" "microfrontend_orchestrator_hub" {
  name     = "mfe-orchestrator"
  hostname = "mfe-orchestrator"
  restart  = "unless-stopped"
  image    = docker_image.microfrontend_orchestrator_hub.image_id

  networks_advanced {
    name = var.network_name
  }

  ports {
    internal = 80
    external = 8080
  }

  volumes {
    host_path      = abspath("${path.root}/volumes/mfe-orchestrator")
    container_path = "/var/microfrontends"
  }

  env = concat([
    "NOSQL_DATABASE_URL=mongodb://root:example@mfe-mongodb:27017",
    "REDIS_URL=redis://mfe-redis:6379",
    "REGISTRATION_ALLOWED=true",
    "ALLOW_EMBEDDED_LOGIN=true",
    "MICROFRONTEND_HOST_FOLDER=/var/microfrontends",
    "FRONTEND_URL=${var.frontend_url}",
    "JWT_SECRET=${var.jwt_secret}",
    "MCP_ENABLED=${var.mcp_enabled}",
    # Anonymous daily ping with aggregate counters only, see docs/TELEMETRY.md.
    # Uncomment to turn it off.
    # "TELEMETRY_DISABLED=true",
  ], var.anthropic_api_key == "" ? [] : ["ANTHROPIC_API_KEY=${var.anthropic_api_key}"])
}
