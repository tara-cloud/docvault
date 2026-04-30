Build the multi-arch Docker image, push it to Docker Hub, and deploy DocVault to the Raspberry Pi.

## Steps

1. Verify Docker Desktop is running (`docker info`)
2. Run `docker buildx use multiarch`
3. Build and push: `docker buildx build --platform linux/amd64,linux/arm64 -t pmananthu/docvault:latest --push .` from the project directory
4. Copy the updated `docker-compose.yml` to the Pi via `sshpass -p 'Anan@1605' scp`
5. On the Pi, copy the compose file to `/var/lib/casaos/apps/docvault/docker-compose.yml`, then run `sudo docker compose pull` and `sudo docker compose up -d`
6. Verify the container is `(healthy)` — if not, fetch logs and report

Use the `deployer` sub-agent to execute all steps.
Report the container status and URL (http://192.168.0.107:9091) when done.
