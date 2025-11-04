'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

type ServerAction = (prevState: string, formData: FormData) => Promise<string>;

function ActionButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? `${label}…` : label}</button>;
}

function DiscoButton({ label, active, cooldown }: { label: string; active: boolean; cooldown: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || cooldown;
  return (
    <button
      className="btn"
      type="submit"
      disabled={disabled}
      style={{
        background: !disabled && active ? 'var(--accent-2)' : undefined,
        color: !disabled && active ? 'black' : undefined,
      }}
      title={disabled ? 'Please wait…' : active ? 'Disco is ON' : 'Disco is OFF'}
    >
      {pending ? `${label}…` : label}
    </button>
  );
}

export function ControlsClient({ seed, refresh, scan, disco }: { seed: ServerAction; refresh: ServerAction; scan: ServerAction; disco: ServerAction }) {
  const [seedMsg, seedAction] = useFormState(seed, '');
  const [refreshMsg, refreshAction] = useFormState(refresh, '');
  const [scanMsg, scanAction] = useFormState(scan, '');
  const [discoMsg, discoAction] = useFormState(disco, '');

  const [logs, setLogs] = useState<Array<{ t: number; msg: string }>>([]);
  const [discoOn, setDiscoOn] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [heartbeatId, setHeartbeatId] = useState<number | null>(null);

  useEffect(() => {
    if (seedMsg) setLogs((prev) => [{ t: Date.now(), msg: seedMsg }, ...prev].slice(0, 8));
  }, [seedMsg]);
  useEffect(() => {
    if (refreshMsg) setLogs((prev) => [{ t: Date.now(), msg: refreshMsg }, ...prev].slice(0, 8));
  }, [refreshMsg]);
  useEffect(() => {
    if (scanMsg) setLogs((prev) => [{ t: Date.now(), msg: scanMsg }, ...prev].slice(0, 8));
  }, [scanMsg]);
  useEffect(() => {
    if (discoMsg) setLogs((prev) => [{ t: Date.now(), msg: discoMsg }, ...prev].slice(0, 8));
    if (!discoMsg) return;
    const lower = discoMsg.toLowerCase();
    if (lower.includes('started')) setDiscoOn(true);
    if (lower.includes('stopped')) setDiscoOn(false);
    // short cooldown to prevent spamming
    setCooldown(true);
    const id = window.setTimeout(() => setCooldown(false), 1500);
    return () => window.clearTimeout(id);
  }, [discoMsg]);

  // heartbeat management
  useEffect(() => {
    if (discoOn && !heartbeatId) {
      const id = window.setInterval(async () => {
        try {
          await fetch('/api/disco/step', { method: 'POST', cache: 'no-store' });
        } catch {}
      }, 1000);
      setHeartbeatId(id);
    }
    if (!discoOn && heartbeatId) {
      window.clearInterval(heartbeatId);
      setHeartbeatId(null);
    }
    return () => {
      if (heartbeatId) window.clearInterval(heartbeatId);
    };
  }, [discoOn, heartbeatId]);

  // initialize disco state on mount
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const resp = await fetch('/api/disco/state', { cache: 'no-store' });
        if (!resp.ok) return;
        const json = await resp.json();
        if (active && json?.enabled) setDiscoOn(true);
      } catch {}
    };
    run();
    return () => { active = false; };
  }, []);

  const timeFmt = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }), []);

  return (
    <div className="card" style={{ gridColumn: 'span 6' }}>
      <h2>Controls</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <form action={seedAction}><ActionButton label="Seed Games" /></form>
        <form action={refreshAction}><ActionButton label="Refresh Games" /></form>
        <form action={scanAction}><ActionButton label="Scan Games" /></form>
        <form action={discoAction}><DiscoButton label="Disco" active={discoOn} cooldown={cooldown} /></form>
      </div>
      <div className="stack">
        <div className="muted">Log</div>
        <div className="code" style={{ maxHeight: 160, overflow: 'auto' }}>
          {logs.length === 0 ? <div className="muted">No actions yet</div> : (
            <ul className="list stack">
              {logs.map((l) => (
                <li key={l.t} style={{ background: 'transparent', border: 'none', padding: 0 }}>
                  [{timeFmt.format(new Date(l.t))}] {l.msg}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}


