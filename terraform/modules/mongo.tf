resource "docker_image" "mongo" {
  name         = "docker.io/library/mongo:8-noble"
  keep_locally = true
}
resource "docker_container" "mongo" {
  name     = "mfe-mongodb"
  hostname = "mfe-mongodb"
  image    = docker_image.mongo.image_id
  restart  = "unless-stopped"
  networks_advanced {
    name = var.network_name
  }
  volumes {
    host_path      = abspath("${path.root}/volumes/mongodb")
    container_path = "/data"
  }

  env = [
    "MONGO_INITDB_ROOT_USERNAME=root",
    "MONGO_INITDB_ROOT_PASSWORD=example",
    "MONGO_INITDB_DATABASE=microfrontend-orchestrator"
  ]
}