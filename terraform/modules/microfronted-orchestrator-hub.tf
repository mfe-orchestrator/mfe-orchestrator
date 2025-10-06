resource "docker_image" "microfrontend_orchestrator_hub" {
  name         = "lory1990/mfe-orchestrator:latest"
  keep_locally = true
}
resource "docker_container" "microfrontend_orchestrator_hub" {
  name     = "mfe-orchestrator"
  hostname = "mfe-orchestrator"
  restart  = "unless-stopped"
  image    = docker_image.microfrontend_orchestrator_hub.image_id

  networks_advanced {
    name = var.network_name
  }

  ports = {
    internal = 80
    external = 8080
  }

  volumes {
    host_path      = abspath("${path.root}/volumes/mfe-orchestrator")
    container_path = "/var/microfrontends"
  }
  
  env = [
    "NOSQL_DATABASE_URL=mongodb://root:example@mfe-mongodb:27017",
    "REDIS_URL=redis://mfe-redis:6379",
    "REGISTRATION_ALLOWED=true",
    "ALLOW_EMBEDDED_LOGIN=true",
    "MICROFRONTEND_HOST_FOLDER=/var/microfrontends",
  ]
}