# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

This is a React/TypeScript application built with Vite, using TanStack Query for data fetching, React Router for routing, and Tailwind CSS for styling. The application uses a modern React 19 setup with Vite as the build tool.

## Development Commands

- `bun run dev` - Start the development server on http://localhost:5173
- `bun run build` - Build for production
- `bun run build:dev` - Build for development
- `bun run preview` - Preview the production build locally
- `bun run lint` - Run ESLint
- `bun run format` - Run Prettier formatting

## Project Structure

The application follows a standard React component architecture:

- `src/main.tsx` - Application entry point
- `src/App.tsx` - Main application component with routing
- `src/routes/` - Route components for different pages
- `src/components/` - UI components, separated into:
  - `src/components/ui/` - Reusable UI primitives (buttons, cards, etc.)
  - `src/components/site/` - Site-specific components (layout, sections, etc.)
- `src/hooks/` - Custom React hooks
- `src/lib/` - Utility functions and shared logic

## Key Dependencies

- React 19 with React Router v7
- TanStack Query v5 for data fetching
- Tailwind CSS v4 for styling
- Radix UI components
- Lucide React for icons
- Framer Motion for animations
- React Hook Form for form handling
- Zod for validation

## Architecture

The application follows a site structure with the following key patterns:

1. **Routing**: Uses React Router v7 with a root layout component and specific page components
2. **Component Organization**:
   - Site components in `src/components/site/` handle page-level layouts
   - UI components in `src/components/ui/` are reusable primitives
3. **Data Management**: Uses TanStack Query for server state management
4. **Styling**: Uses Tailwind CSS with custom components
5. **Animation**: Uses Framer Motion for page transitions and animations

## Common Development Tasks

### Running the Application

```bash
bun run dev
```

### Building

```bash
bun run build
```

### Linting and Formatting

```bash
bun run lint
bun run format
```

## Testing

Tests should be run with:

```bash
# Currently, there is no test setup in this project
```

## Key Implementation Details

- All components use the `@/` path alias for imports
- The site follows a component library pattern with:
  - Reusable UI components in `src/components/ui/`
  - Site-specific components in `src/components/site/`
- The application is fully typed with TypeScript
- Styling uses Tailwind CSS with a custom configuration
- The project uses modern React patterns with hooks
- Routing is handled by React Router v7 with file-based routing patterns

## Configuration Files

- `vite.config.ts` - Vite configuration
- `tsconfig.json` - TypeScript configuration
- `package.json` - Dependencies and scripts
- `tailwind.config.js` - Tailwind configuration (if present)
- `eslint.config.js` - ESLint configuration

## Common Patterns

### Component Structure

```tsx
// Example component pattern
import { ComponentName } from "@/components/ui/component-name";

export function MyComponent() {
  return (
    <div className="container-class">
      <ComponentName />
    </div>
  );
}
```

### Route Structure

Routes are organized in `src/routes/` with:

- `__root.tsx` - Root layout component
- `index.tsx` - Home page
- Other page components for each route

### Styling

The application uses Tailwind CSS with custom classes and components. All styling is done through className attributes rather than CSS files.

### Data Fetching

Uses TanStack Query for data fetching with:

```tsx
import { QueryClient } from "@tanstack/react-query";
const queryClient = new QueryClient();
```

## Environment Setup

1. Install dependencies: `bun install`
2. Start development server: `bun run dev`
3. Build for production: `bun run build`

## Deployment

The application builds to static files that can be deployed to any static hosting service.
