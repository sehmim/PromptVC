# PromptVC Web Viewer

A lightweight, client-side web application for visualizing and managing PromptVC sessions. Upload your `sessions.json` file and explore your AI coding sessions with rich diff visualization, search, filtering, and comparison features.

## Features

- **📤 Easy Upload**: Drag-and-drop your `sessions.json` file from `.promptvc` directory
- **🔍 Search & Filter**: Find sessions by prompt text, files, tags, provider, or mode
- **👁️ Rich Diff Visualization**: View git diffs in unified or split mode with syntax highlighting
- **🔄 Session Comparison**: Compare two sessions side-by-side
- **💾 Local Storage**: All data is stored locally in your browser
- **📊 Export/Import**: Export your sessions or merge multiple session files
- **🌓 Dark Mode**: Toggle between light and dark themes
- **📱 Responsive**: Works on desktop, tablet, and mobile devices

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### 1. Upload Sessions

- **Drag and Drop**: Drop your `sessions.json` file into the upload area in the left sidebar
- **Click to Upload**: Click the upload area to select a file from your system
- **Multiple Uploads**: You can upload multiple session files, and they will be merged

#### Can't find the .promptvc folder?

The `.promptvc` folder is hidden by default. Here are three ways to access it:

**Option 1: Use VS Code (Easiest)**
1. Open your project in VS Code
2. Navigate to the `.promptvc` folder in the sidebar (it will be visible)
3. Right-click `sessions.json` and select "Reveal in Finder" (macOS) or "Reveal in File Explorer" (Windows)
4. Drag the file from Finder/Explorer to the web viewer

**Option 2: Show Hidden Files**
- **macOS**: Press `⌘ Cmd + Shift + .` in Finder to toggle hidden files
- **Windows**: In File Explorer, go to View → Show → Hidden items
- **Linux**: Press `Ctrl + H` in your file manager

**Option 3: Copy to Desktop via Terminal**
```bash
# Navigate to your project directory, then:
cp .promptvc/sessions.json ~/Desktop/
```

**Option 4: Use the Helper Script**
```bash
# From the web-viewer directory:
cd /path/to/your/project
curl -O https://your-deployed-url/copy-sessions.sh
chmod +x copy-sessions.sh
./copy-sessions.sh
```

Or manually copy from `web-viewer/public/copy-sessions.sh` to your project root and run it.

### 2. Browse Sessions

- Sessions appear in the sidebar with metadata (provider, date, files count, prompts)
- Click on a session to view its details
- Use the search bar to find specific sessions

### 3. View Session Details

- See the full prompt and response
- Browse git diffs with syntax highlighting
- Toggle between unified and split diff views
- Mark files as "viewed" to track your progress
- For interactive sessions, view per-prompt changes

### 4. Compare Sessions

- Navigate to the "Compare" tab
- Select two sessions from the dropdowns
- View side-by-side comparison of changes
- See which files are common, unique to each session

### 5. Export/Import

- **Export**: Download all sessions as a JSON file for backup
- **Import**: Sessions are automatically merged when you upload
- **Clear All**: Remove all sessions from local storage

## Technology Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Zustand** - State management
- **highlight.js** - Syntax highlighting
- **date-fns** - Date formatting
- **react-dropzone** - File upload

## Project Structure

```
web-viewer/
├── app/
│   ├── layout.tsx           # Root layout with sidebar
│   ├── page.tsx            # Home page
│   ├── providers.tsx       # Client-side providers
│   ├── globals.css         # Global styles
│   ├── session/[id]/
│   │   └── page.tsx        # Session detail page
│   └── compare/
│       └── page.tsx        # Session comparison page
├── components/
│   ├── DiffViewer.tsx      # Diff visualization component
│   ├── SessionList.tsx     # Session list with upload
│   ├── SessionFilters.tsx  # Search and filter UI
│   ├── ExportImport.tsx    # Export/import controls
│   ├── ThemeToggle.tsx     # Dark mode toggle
│   └── Sidebar.tsx         # Main sidebar layout
├── lib/
│   ├── types.ts            # TypeScript interfaces
│   ├── diffParser.ts       # Git diff parsing logic
│   ├── storage.ts          # LocalStorage manager
│   └── store.ts            # Zustand state management
└── public/                 # Static assets
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in Vercel
3. Set the root directory to `apps/web-viewer`
4. Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### Other Platforms

The app is a standard Next.js application and can be deployed to:
- Netlify
- AWS Amplify
- Cloudflare Pages
- Any platform supporting Node.js

## Data Privacy

- **All data stays local**: Your sessions are stored in browser localStorage only
- **No server uploads**: Files are processed entirely in your browser
- **No tracking**: No analytics or tracking scripts

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Any modern browser with localStorage support

## Development

```bash
# Run development server with hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build for production
npm run build
```

## License

Part of the PromptVC project. See the main repository for license information.

## Contributing

Issues and pull requests are welcome! Please check the main PromptVC repository.

## Support

For issues, feature requests, or questions, please open an issue in the main PromptVC repository.
