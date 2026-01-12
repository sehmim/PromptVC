import Link from 'next/link';
import Image from 'next/image';

const features = [
  {
    title: 'Session timelines',
    description: 'Track every prompt, diff, and file touched with a clean session timeline.',
    icon: '/window.svg',
  },
  {
    title: 'Readable diffs',
    description: 'Review unified or split diffs with syntax highlighting and per-file stats.',
    icon: '/file.svg',
  },
  {
    title: 'Local first',
    description: 'Your sessions stay on disk. Upload only the JSON you choose.',
    icon: '/globe.svg',
  },
];

const steps = [
  {
    title: 'Capture sessions',
    description: 'Run the CLI or VS Code extension to log prompts and diffs.',
  },
  {
    title: 'Drop sessions.json',
    description: 'Drag the file into the viewer and it loads instantly.',
  },
  {
    title: 'Review the trail',
    description: 'Jump to any prompt and inspect changes like a PR.',
  },
];

const vscodeMarketplaceUrl =
  'https://marketplace.visualstudio.com/items?itemName=SehmimHaque.promptvc-vscode';

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-[#f7f4ef] text-gray-900 font-sans">
      <div className="relative overflow-hidden">
        <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-[#ffd6a5] opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 left-10 h-96 w-96 rounded-full bg-[#bde0fe] opacity-40 blur-3xl" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="PromptVC logo"
              width={32}
              height={32}
              className="rounded-md"
            />
            <span className="text-sm font-semibold tracking-wide">PromptVC</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/session"
              className="rounded-full border border-gray-900/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-900 hover:border-gray-900/40"
            >
              Open viewer
            </Link>
          </div>
        </header>

        <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 pt-10">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
                Prompt version control
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight text-gray-900 md:text-6xl">
                Every prompt.
                <br />
                Every diff.
                <br />
                One clean timeline.
              </h1>
              <p className="mt-5 max-w-xl text-base text-gray-600 md:text-lg">
                Switch between Claude, Codex, and Gemini freely.<br></br>
                One unified timeline with per-prompt diffs.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={vscodeMarketplaceUrl}
                  className="rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-gray-900/20 hover:bg-gray-800"
                >
                  
                  Get the VS Code extension
                </a>
                <Link
                  href={"/session"}
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-lg shadow-gray-900/10 hover:bg-gray-100"
                >
                  Launch the viewer
                </Link>
                {/* <Link
                  href="#how"
                  className="rounded-full border border-gray-900/20 px-6 py-3 text-sm font-semibold text-gray-800 hover:border-gray-900/40"
                >
                  See how it works
                </Link> */}
              </div>
              <div className="mt-8 flex items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Local-only sessions
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 shadow-sm">
                  <img src="/codex.svg" alt="Codex provider" className="h-3 w-3 p-0.5" />
                  Codex
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 shadow-sm">
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg"
                    alt="Claude provider"
                    className="h-3 w-3"
                  />
                  Claude Code
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 shadow-sm">
                  <img
                    src="https://static.vecteezy.com/system/resources/previews/055/687/065/non_2x/gemini-google-icon-symbol-logo-free-png.png"
                    alt="Gemini provider"
                    className="h-3 w-3"
                  />
                  Gemini CLI
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-3xl border border-white/70 bg-white/80 p-3 shadow-2xl shadow-gray-900/10 backdrop-blur">
                <Image
                  src="/extension-demo.png"
                  alt="PromptVC diff viewer preview"
                  width={880}
                  height={560}
                  className="h-auto w-full rounded-2xl"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-white/70 bg-white/80 p-4 text-xs text-gray-600 shadow-lg backdrop-blur lg:block">
                Upload sessions.json to explore diffs fast.
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="rounded-3xl border border-gray-200 bg-white/90 p-8 shadow-sm">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Core pillars
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-gray-900">
                Built around the VS Code extension
              </h2>
              <p className="mt-3 max-w-xl text-sm text-gray-600">
                PromptVC shines inside VS Code, where you can review diffs, navigate
                prompts, and keep your workflow tight. The CLI complements it by
                logging sessions from any terminal.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/session"
                  className="rounded-full bg-gray-900 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white"
                >
                  Open the viewer
                </Link>
                <a
                  href={vscodeMarketplaceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-900 shadow-sm"
                >
                  Install the extension
                </a>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-900/5 p-4 text-xs text-gray-600">
              Log prompts, review diffs, and keep history visible on every run.
            </div>
          </div>
        </div>
      </section>

      <section id="tools" className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-gray-200 bg-white/95 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                  VS Code extension
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-gray-900">
                  The main way to inspect every prompt
                </h3>
              </div>
              <div className="hidden items-center gap-2 rounded-full bg-gray-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white md:flex">
                Primary
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Browse sessions in the sidebar, open rich webviews, and drill into diffs
              without leaving VS Code.
            </p>
            <div className="mt-4">
              <a
                href={vscodeMarketplaceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
              >
                Install VS Code extension
              </a>
            </div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200">
              <Image
                src="/extension-demo.png"
                alt="PromptVC VS Code extension"
                width={900}
                height={560}
                className="h-auto w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-gray-200 bg-white/95 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                CLI
              </p>
              <h3 className="mt-2 text-xl font-semibold text-gray-900">
                Capture prompts anywhere
              </h3>
              <p className="mt-3 text-sm text-gray-600">
                The CLI records prompts and diffs from any terminal workflow, so
                sessions are always tracked even outside VS Code.
              </p>
              <p className="mt-4 text-xs text-gray-500">
                Run{' '}
                <code className="rounded bg-gray-900/5 px-1 py-0.5 font-medium text-gray-700">
                  promptvc config
                </code>{' '}
                to wire the notify hook. PromptVC checks Codex 0.80.0 and npm 11.5.1
                (override with{' '}
                <code className="rounded bg-gray-900/5 px-1 py-0.5 font-medium text-gray-700">
                  PROMPTVC_EXPECTED_CODEX_VERSION
                </code>
                ,{' '}
                <code className="rounded bg-gray-900/5 px-1 py-0.5 font-medium text-gray-700">
                  PROMPTVC_EXPECTED_NPM_VERSION
                </code>{' '}
                or{' '}
                <code className="rounded bg-gray-900/5 px-1 py-0.5 font-medium text-gray-700">
                  PROMPTVC_ALLOW_VERSION_MISMATCH=1
                </code>
                ).
              </p>
            </div>
            <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white/95 shadow-sm">
              <Image
                src="/cli-demo.png"
                alt="PromptVC CLI capture"
                width={640}
                height={420}
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900/5">
                  <img src={feature.icon} alt="" className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-gray-900">{feature.title}</h3>
              </div>
              <p className="mt-3 text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="rounded-3xl border border-gray-200 bg-white/90 p-8 shadow-sm">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                Workflow
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-gray-900">
                A lightweight loop from prompt to review
              </h2>
              <p className="mt-3 max-w-xl text-sm text-gray-600">
                Capture a coding session, drag the JSON into the viewer, and browse
                diffs as if every prompt were a commit.
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-4">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white px-5 py-4"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="flex flex-col items-center justify-between gap-6 rounded-3xl border border-gray-200 bg-gray-900 px-8 py-10 text-white md:flex-row">
          <div>
            <h2 className="text-2xl font-semibold">Ready to track your prompts?</h2>
            <p className="mt-2 text-sm text-white/70">
              Open the viewer and keep every diff in one place.
            </p>
          </div>
          <Link
            href="/session"
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-gray-900"
          >
            Go to sessions
          </Link>
        </div>
      </section>
    </div>
  );
}
