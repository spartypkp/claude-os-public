'use client';

import { useEffect, useState, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface MermaidRendererProps {
  code: string;
  className?: string;
}

// Theme configurations for Mermaid
const darkThemeConfig = {
  darkMode: true,
  background: '#0a0a0a',
  primaryColor: '#C15F3C',
  secondaryColor: '#8B4332',
  tertiaryColor: '#1a1a1a',
  primaryTextColor: '#e0e0e0',
  secondaryTextColor: '#a0a0a0',
  lineColor: '#4b5563',
  textColor: '#e0e0e0',
  mainBkg: '#1a1a1a',
  nodeBorder: '#C15F3C',
  clusterBkg: '#1a1a1a',
  clusterBorder: '#2a2a2a',
  titleColor: '#e0e0e0',
  edgeLabelBackground: '#1a1a1a',
};

const lightThemeConfig = {
  darkMode: false,
  background: '#F4F3EE',
  primaryColor: '#C15F3C',
  secondaryColor: '#8B4332',
  tertiaryColor: '#E8E6E1',
  primaryTextColor: '#1a1a18',
  secondaryTextColor: '#3d3929',
  lineColor: '#9a9893',
  textColor: '#1a1a18',
  mainBkg: '#FFFFFF',
  nodeBorder: '#C15F3C',
  clusterBkg: '#F4F3EE',
  clusterBorder: '#E0DED6',
  titleColor: '#1a1a18',
  edgeLabelBackground: '#FFFFFF',
};

export function MermaidRenderer({ code, className = '' }: MermaidRendererProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { resolvedTheme } = useTheme();

  // Use React's useId for stable, unique IDs
  const reactId = useId();
  const mermaidId = `mermaid-${reactId.replace(/:/g, '-')}`;

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!code.trim()) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Dynamically import mermaid to avoid SSR issues
        const mermaid = (await import('mermaid')).default;

        // Select theme config based on resolved theme
        const themeVariables = resolvedTheme === 'light' ? lightThemeConfig : darkThemeConfig;

        // Initialize mermaid with appropriate theme
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === 'light' ? 'base' : 'dark',
          themeVariables,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          flowchart: {
            htmlLabels: true,
            curve: 'basis',
          },
          sequence: {
            diagramMarginX: 50,
            diagramMarginY: 10,
            actorMargin: 50,
            width: 150,
            height: 65,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35,
          },
        });

        // Render the diagram
        const { svg } = await mermaid.render(mermaidId, code.trim());

        if (!cancelled) {
          setSvgContent(svg);
          setError(null);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Mermaid rendering error:', err);
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setSvgContent(null);
          setIsLoading(false);
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, mermaidId, resolvedTheme]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 bg-[var(--surface-raised)] rounded-lg border border-[var(--color-error)]/30 ${className}`}>
        <AlertCircle className="w-8 h-8 text-[var(--color-error)] mb-3" />
        <p className="text-sm text-[var(--color-error)] font-medium mb-2">
          Failed to render diagram
        </p>
        <p className="text-xs text-[var(--text-tertiary)] text-center max-w-md">
          {error}
        </p>
        <details className="mt-4 text-xs text-[var(--text-muted)] max-w-full">
          <summary className="cursor-pointer hover:text-[var(--text-secondary)]">
            Show source code
          </summary>
          <pre className="mt-2 p-3 bg-[var(--surface-base)] rounded overflow-x-auto text-left">
            <code>{code}</code>
          </pre>
        </details>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center min-h-[200px] ${className}`}>
        <div className="text-sm text-[var(--text-muted)]">
          Loading diagram...
        </div>
      </div>
    );
  }

  // Use dangerouslySetInnerHTML so React tracks DOM changes
  // This prevents hydration errors when parent components re-render
  return (
    <div
      className={`mermaid-container flex items-center justify-center min-h-[200px] ${className}`}
      dangerouslySetInnerHTML={svgContent ? { __html: svgContent } : undefined}
    />
  );
}

export default MermaidRenderer;
