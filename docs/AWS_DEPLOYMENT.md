# AWS deployment guide

This is a later deployment path for the validated local app. No AWS resources, public deployment, or GitHub repository are created by these instructions alone. The Docker image and cloud configuration still need verification in your account.

## Architecture

Use one ECS Fargate task running the supplied container behind an HTTPS Application Load Balancer. The container runs Next.js on port 3000 and Express on loopback port 4000; Next.js proxies `/api` internally. Store persistent data in MongoDB Atlas, not in the task’s ephemeral filesystem.

Start with one task for this assessment MVP. All tasks in a future multi-instance deployment would need the same JWT secret and a shared rate-limit store. Keep the application origin stable so cookies and the API’s origin check agree.

## Prepare the database and secrets

1. Create an Atlas cluster near your chosen AWS region and a database user restricted to the `xperience_assistant` database.
2. Provide stable outbound networking for the task, such as private subnets with a NAT gateway and an Elastic IP. Add that egress IP to Atlas’s access list. Atlas connections require an allowed source address and database credentials; see [Atlas connection prerequisites](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).
3. Store `MONGODB_URI`, a randomly generated `JWT_SECRET`, and optionally `GEMINI_API_KEY` in AWS Secrets Manager. Reference them through the ECS container definition’s `secrets` fields. Give the task execution role access only to those secrets and any required KMS key. See [ECS secret injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html).

Use the following non-secret container environment values:

| Name           | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| `NODE_ENV`     | `production`                                                                          |
| `PORT`         | `3000` for the public Next.js server; the launcher keeps Express on loopback 4000      |
| `MONGODB_DB`   | `xperience_assistant`                                                                 |
| `APP_ORIGIN`   | Your exact HTTPS origin, such as `https://events.example.com`, with no trailing slash |
| `GEMINI_MODEL` | A structured-output model enabled for your Gemini project                             |

Do not set `API_INTERNAL_URL` for this architecture; the default rewrite target is loopback port 4000. Do not expose port 4000 publicly. `.dockerignore` excludes local `.env`, database files, and generated artifacts.

## Build and publish an image

With Docker installed, from the project directory:

```sh
docker build --platform linux/amd64 -t xperience-assistant:assessment .
```

Create a private ECR repository, authenticate Docker using the ECR console’s **View push commands**, and tag/push the image under an immutable version tag. Use your actual region, account, and repository values from that console. Choose matching X86_64 architecture in the Fargate task definition, or build a matching ARM64 image instead.

The build installs dependencies using `npm ci`, compiles all workspaces, and prunes development dependencies. The runtime uses the non-root `node` user and starts both services with the provided process launcher.

## Configure ECS and HTTPS

1. Create an ECS cluster and Fargate task definition with 1 vCPU and 2 GB memory as an initial assessment configuration. Adjust only after observing actual usage.
2. Add the ECR image, map container TCP port 3000, inject secrets, and configure CloudWatch container logs. Keep the default launch command.
3. Create a service with desired count 1 in the prepared private subnets. Its security group should accept port 3000 only from the load balancer security group.
4. Create an Application Load Balancer in public subnets, an IP target group for port 3000, and a health check at `/api/health` expecting HTTP 200.
5. Add a certificate for your chosen domain using ACM, configure the HTTPS listener, and redirect HTTP to HTTPS. Point the domain at the load balancer and set `APP_ORIGIN` to the same origin before testing registration.
6. Allow a health-check grace period while the services start. The readiness endpoint pings MongoDB, so an inaccessible cluster keeps the target unhealthy.

The API deliberately does not trust arbitrary forwarded IP headers. Authentication rate limiting therefore sees the local proxy as one address in this simple topology. Before broader public use, add a trusted-proxy/IP forwarding design and shared limiter store; do not simply enable unrestricted proxy trust.

## Verify and operate

- Confirm HTTPS, a healthy `/api/health`, registration, sign-in, and Secure/HttpOnly/SameSite cookies.
- Run both demo scenarios through proposal approval, then reload and verify persistence.
- Verify live Gemini using a short free-form request before claiming live AI works.
- Try a second account and verify event isolation.
- Inspect CloudWatch logs for startup, MongoDB connectivity, and provider failures without printing secrets or conversation text.
- Enable database backups and deployment rollback. Use image tags/task-definition revisions to return to a previous build.
- When rotating a secret, deploy new tasks so they receive the new value. Rotating the JWT secret invalidates existing sessions. AWS documents that injected secret values are not automatically refreshed inside already-running containers in its [secret environment-variable guidance](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html).

This setup is an assessment deployment guide. Password reset, email verification, distributed rate limiting, long-term audit storage, and background notifications remain outside the local MVP.
