import alchemy from "alchemy";
import { TanStackStart } from "alchemy/cloudflare";
import { Worker } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const stage = process.env.ALCHEMY_STAGE || "dev";

if (stage !== "dev") {
  config({ path: `../../apps/web/.env.${stage}` });
  config({ path: `../../apps/server/.env.${stage}` });
  config({ path: `./.env.${stage}` });
}

const app = await alchemy("my-stack", { stage });

const isProd = app.stage === "prod";
const workersSubdomain = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;

if (isProd && !workersSubdomain) {
  throw new Error(
    "CLOUDFLARE_WORKERS_SUBDOMAIN must be set for production deployments. " +
      "Find it in your Cloudflare Dashboard under Workers & Pages.",
  );
}

const webName = `${app.name}-${app.stage}-web`;
const serverName = `${app.name}-${app.stage}-server`;

function workersUrl(name: string): string | undefined {
  return workersSubdomain ? `https://${name}.${workersSubdomain}.workers.dev` : undefined;
}

export const server = await Worker("server", {
  name: serverName,
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  url: true,
  bindings: {
    DATABASE_URL: alchemy.secret.env.DATABASE_URL!,
    CORS_ORIGIN: workersUrl(webName) ?? alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: workersUrl(serverName) ?? alchemy.env.BETTER_AUTH_URL!,
    GOOGLE_GENERATIVE_AI_API_KEY: alchemy.secret.env.GOOGLE_GENERATIVE_AI_API_KEY!,
    COOKIE_DOMAIN: workersSubdomain ? `.${workersSubdomain}.workers.dev` : "",
  },
  dev: {
    port: 3000,
  },
});

export const web = await TanStackStart("web", {
  name: webName,
  cwd: "../../apps/web",
  bindings: {
    VITE_SERVER_URL: server.url!,
    DATABASE_URL: alchemy.secret.env.DATABASE_URL!,
    CORS_ORIGIN: workersUrl(webName) ?? alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: server.url!,
    GOOGLE_GENERATIVE_AI_API_KEY: alchemy.secret.env.GOOGLE_GENERATIVE_AI_API_KEY!,
    COOKIE_DOMAIN: workersSubdomain ? `.${workersSubdomain}.workers.dev` : "",
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
