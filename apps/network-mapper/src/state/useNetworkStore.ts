import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { networkReducer, type NetworkAction } from "../model/network";
import { sampleNetwork } from "../model/sample";
import { DEFAULT_SETTINGS, type NetworkData, type Positions, type Settings } from "../model/types";
import { openBestStorage, type NetworkStorage } from "../storage/db";

const HISTORY_LIMIT = 100;

interface History {
  past: NetworkData[];
  present: NetworkData;
  future: NetworkData[];
}

type HistoryAction =
  | { type: "do"; action: NetworkAction }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; data: NetworkData };

function historyReducer(h: History, a: HistoryAction): History {
  switch (a.type) {
    case "do": {
      const next = networkReducer(h.present, a.action);
      if (next === h.present) return h;
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
    }
    case "undo": {
      const prev = h.past[h.past.length - 1];
      if (!prev) return h;
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    }
    case "redo": {
      const next = h.future[0];
      if (!next) return h;
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    }
    case "load":
      return { past: [], present: a.data, future: [] };
  }
}

export type SaveStatus = "loading" | "saved" | "saving" | "error";

export interface NetworkStore {
  ready: boolean;
  data: NetworkData;
  positions: Positions;
  settings: Settings;
  saveStatus: SaveStatus;
  storageKind: NetworkStorage["kind"] | null;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: (action: NetworkAction) => void;
  undo: () => void;
  redo: () => void;
  /** Replace the whole network (import / sample / clear). Undoable. */
  replace: (data: NetworkData, positions: Positions) => void;
  updatePositions: (updates: Positions, replaceAll?: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

export function useNetworkStore(): NetworkStore {
  const [initial] = useState(() => sampleNetwork());
  const [history, send] = useReducer(historyReducer, {
    past: [],
    present: initial.data,
    future: [],
  });
  const [positions, setPositions] = useState<Positions>(initial.positions);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const storageRef = useRef<NetworkStorage | null>(null);
  const savedRef = useRef<NetworkData | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const positionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `positions` for the debounced writer; updated wherever positions are set.
  const positionsRef = useRef(positions);
  const [storageKind, setStorageKind] = useState<NetworkStorage["kind"] | null>(null);

  /** Serialises writes so they land in order and status reflects the queue. */
  const enqueue = useCallback((job: (s: NetworkStorage) => Promise<void>) => {
    const s = storageRef.current;
    if (!s) return;
    pendingRef.current++;
    setSaveStatus("saving");
    queueRef.current = queueRef.current
      .then(() => job(s))
      .then(
        () => {
          pendingRef.current--;
          if (pendingRef.current === 0) setSaveStatus((st) => (st === "error" ? st : "saved"));
        },
        (err: unknown) => {
          pendingRef.current--;
          console.error("Saving failed", err);
          setSaveStatus("error");
        },
      );
  }, []);

  // Load once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const storage = await openBestStorage();
      let loaded = null;
      try {
        loaded = await storage.load();
      } catch (err) {
        console.error("Loading saved network failed", err);
      }
      if (cancelled) return;
      storageRef.current = storage;
      setStorageKind(storage.kind);
      if (loaded) {
        send({ type: "load", data: loaded.data });
        positionsRef.current = loaded.positions;
        setPositions(loaded.positions);
        if (loaded.settings) setSettings({ ...DEFAULT_SETTINGS, ...loaded.settings });
        savedRef.current = loaded.data;
        setSaveStatus("saved");
      } else {
        // First run: persist the sample so a refresh keeps whatever the user does next.
        savedRef.current = null;
        setSaveStatus("saved");
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-save the network after every change.
  const present = history.present;
  useEffect(() => {
    if (!ready || savedRef.current === present) return;
    const prev = savedRef.current;
    savedRef.current = present;
    enqueue((s) => s.saveNetwork(prev, present));
  }, [ready, present, enqueue]);

  useEffect(() => {
    if (!ready) return;
    enqueue((s) => s.saveSettings(settings));
  }, [ready, settings, enqueue]);

  const flushPositions = useCallback(() => {
    if (positionsTimer.current) clearTimeout(positionsTimer.current);
    positionsTimer.current = null;
    const snapshot = positionsRef.current;
    enqueue((s) => s.savePositions(snapshot));
  }, [enqueue]);

  useEffect(() => {
    const onHide = () => {
      if (positionsTimer.current) flushPositions();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flushPositions]);

  const updatePositions = useCallback(
    (updates: Positions, replaceAll = false) => {
      const next = replaceAll ? { ...updates } : { ...positionsRef.current, ...updates };
      positionsRef.current = next;
      setPositions(next);
      if (positionsTimer.current) clearTimeout(positionsTimer.current);
      positionsTimer.current = setTimeout(flushPositions, 400);
    },
    [flushPositions],
  );

  const dispatch = useCallback((action: NetworkAction) => {
    send({ type: "do", action });
  }, []);

  const replace = useCallback(
    (data: NetworkData, nextPositions: Positions) => {
      send({ type: "do", action: { type: "replace", data } });
      updatePositions(nextPositions, true);
    },
    [updatePositions],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const undo = useCallback(() => send({ type: "undo" }), []);
  const redo = useCallback(() => send({ type: "redo" }), []);

  return {
    ready,
    data: present,
    positions,
    settings,
    saveStatus,
    storageKind,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    dispatch,
    undo,
    redo,
    replace,
    updatePositions,
    updateSettings,
  };
}
