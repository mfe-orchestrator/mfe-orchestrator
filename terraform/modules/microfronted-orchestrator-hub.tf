resource "docker_image" "microfrontend_orchestrator_hub" {
  name         = "lory1990/microfrontend-orchestrator-hub:latest"
  keep_locally = true
}
resource "docker_container" "microfrontend_orchestrator_hub" {
  name     = "microfrontend-orchestrator-hub"
  hostname = "microfrontend-orchestrator-hub"
  restart  = "unless-stopped"
  image    = docker_image.microfrontend_orchestrator_hub.image_id

  networks_advanced {
    name = var.network_name
  }

  ports = {
    internal = 80
    external = 8080
  }
  
  env = [
    "NOSQL_DATABASE_URL=mongodb://root:example@mfe-mongodb:27017",
    "REDIS_URL=redis://mfe-redis:6379",
    "REGISTRATION_ALLOWED=true",
    "ALLOW_EMBEDDED_LOGIN=true"
  ]
}