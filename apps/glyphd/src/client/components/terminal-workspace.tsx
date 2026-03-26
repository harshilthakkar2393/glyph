import { useState, useCallback, useEffect } from "react";
import { useWs } from "@/contexts/ws-context";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { SettingsPanel } from "./settings-panel";
import { TerminalTab } from "./terminal-tab";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Plus, Settings01Icon } from "@hugeicons/core-free-icons";

interface Tab {
  id: string;
  title: string;
}

function makeTab(): Tab {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { id, title: "shell" };
}

export function TerminalWorkspace() {
  const { connected } = useWs();
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [fontSize, setFontSize] = useState(14);

  const addTab = useCallback(() => {
    const tab = makeTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((active) => {
        if (active !== id) return active;
        const idx = prev.findIndex((t) => t.id === id);
        return (next[idx - 1] ?? next[0]).id;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        addTab();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "W") {
        e.preventDefault();
        closeTab(activeTabId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addTab, closeTab, activeTabId]);

  return (
    <Tabs
      value={activeTabId}
      onValueChange={setActiveTabId}
      className="flex flex-col w-screen h-screen bg-background overflow-hidden"
    >
      {/* Tab bar */}
      <div className="flex items-center justify-between h-10 border-b border-border shrink-0 overflow-hidden">
        <TabsList variant="line" className="">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="">
              {tab.title}
              {tabs.length > 1 && (
                <span
                  role="button"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="flex items-center justify-center w-4 h-4 rounded text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  ✕
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Right side actions */}
        <div className="flex items-center gap-1 px-1.5 shrink-0">
          <Button
            onClick={addTab}
            title="New tab (Ctrl+Shift+T)"
            variant="ghost"
            size="icon-lg"
          >
            <HugeiconsIcon icon={Plus} strokeWidth={2} />
          </Button>

          <div
            title={connected ? "connected" : "disconnected"}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors",
              connected ? "bg-green-500" : "bg-red-500"
            )}
          />

          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-lg" title="Settings">
                  <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
                </Button>
              }
            />
            <PopoverContent side="bottom" align="end" sideOffset={8} className="w-52">
              <SettingsPanel fontSize={fontSize} onFontSizeChange={setFontSize} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Terminal panels — keepMounted keeps PTY sessions alive when switching tabs */}
      {tabs.map((tab) => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          keepMounted
          className="flex-1 overflow-hidden mt-0"
        >
          <TerminalTab
            tabId={tab.id}
            active={tab.id === activeTabId}
            fontSize={fontSize}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
