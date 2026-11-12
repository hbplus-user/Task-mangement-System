// Bundles the server functions into single files for Supabase Edge Functions.
//   server/hb-tick.js  → supabase/functions/hb-tick/index.ts   (system jobs, every 5 min)
//   server/hb-slack.js → supabase/functions/hb-slack/index.ts  (Slack DMs, buttons, /task, SOW in Slack)
//   server/hb-kpi.js   → supabase/functions/hb-kpi/index.ts    (KPI auto-pull from Meta Ads / Zoho CRM, daily)
// Each output can be pasted into the Supabase dashboard or deployed with the CLI.
import { build } from 'esbuild';

for (const name of ['hb-tick', 'hb-slack', 'hb-kpi']) {
  await build({
    entryPoints: [`server/${name}.js`],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile: `supabase/functions/${name}/index.ts`,
    banner: { js: `// @ts-nocheck\n// Built from server/${name}.js with \`npm run build:function\`. Do not edit by hand.` },
    define: { 'import.meta.env': 'undefined' },
    plugins: [
      {
        name: 'supabase-from-npm',
        setup(b) {
          b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'npm:@supabase/supabase-js@2.45.4', external: true }));
        },
      },
    ],
  });
  console.log(`Built supabase/functions/${name}/index.ts`);
}
