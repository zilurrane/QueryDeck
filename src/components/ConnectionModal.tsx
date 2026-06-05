import { useState } from "react";
import { useStore } from "../lib/store";
import * as api from "../lib/api";
import { ENGINES, engineDef, type ConnConfig, type Engine, type Env } from "../lib/types";

export function ConnectionModal() {
  const setModalOpen = useStore((s) => s.setModalOpen);
  const doConnect = useStore((s) => s.doConnect);

  const [cfg, setCfg] = useState<ConnConfig>({
    engine: "mssql",
    host: "localhost",
    port: 1433,
    username: "sa",
    password: "",
    database: "master",
    encrypt: true,
    trust_cert: true,
  });
  const [name, setName] = useState("Local SQL Server");

  // Switching engine swaps in that engine's conventional port/user/database.
  const setEngine = (engine: Engine) => {
    const d = engineDef(engine);
    setCfg((c) => ({ ...c, engine, port: d.defaultPort, username: d.defaultUser, database: d.defaultDatabase }));
    setName(`Local ${d.name}`);
  };
  const [env, setEnv] = useState<Env>("dev");
  const [save, setSave] = useState(true);
  const [savePassword, setSavePassword] = useState(true);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const upd = (patch: Partial<ConnConfig>) => setCfg((c) => ({ ...c, ...patch }));

  const runTest = async () => {
    setBusy(true);
    setTest(null);
    try {
      const ms = await api.testConnection(cfg);
      setTest({ ok: true, msg: `Connection test passed · ${ms} ms` });
    } catch (e) {
      setTest({ ok: false, msg: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setTest(null);
    try {
      await doConnect(cfg, { name, env, save, savePassword });
    } catch (e) {
      setTest({ ok: false, msg: String(e) });
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
      <div className="modal">
        <h3>🔌 New {engineDef(cfg.engine).name} connection</h3>
        <div className="form">
          <div className="field">
            <label>Database engine</label>
            <select
              className="select"
              value={cfg.engine}
              onChange={(e) => setEngine(e.target.value as Engine)}
            >
              {ENGINES.map((en) => (
                <option key={en.id} value={en.id}>{en.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Connection name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Host / server</label>
            <input value={cfg.host} onChange={(e) => upd({ host: e.target.value })} />
          </div>
          <div className="field">
            <label>Port</label>
            <input
              value={cfg.port}
              onChange={(e) => upd({ port: Number(e.target.value) || 1433 })}
            />
          </div>
          <div className="field">
            <label>Login</label>
            <input value={cfg.username} onChange={(e) => upd({ username: e.target.value })} />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={cfg.password}
              onChange={(e) => upd({ password: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Database</label>
            <input value={cfg.database} onChange={(e) => upd({ database: e.target.value })} />
          </div>
          <div className="field">
            <label>Environment</label>
            <select className="select" value={env} onChange={(e) => setEnv(e.target.value as Env)}>
              <option value="dev">dev</option>
              <option value="staging">staging</option>
              <option value="prod">prod</option>
            </select>
          </div>
          <div className="toggles">
            <div className="tog" onClick={() => upd({ encrypt: !cfg.encrypt })}>
              <span className={`sw ${cfg.encrypt ? "on" : ""}`} /> Encrypt
            </div>
            <div className="tog" onClick={() => upd({ trust_cert: !cfg.trust_cert })}>
              <span className={`sw ${cfg.trust_cert ? "on" : ""}`} /> Trust certificate
            </div>
          </div>
          <div className="toggles">
            <div className="tog" onClick={() => setSave(!save)}>
              <span className={`sw ${save ? "on" : ""}`} /> Save connection
            </div>
            <div className="tog" onClick={() => setSavePassword(!savePassword)}>
              <span className={`sw ${savePassword ? "on" : ""}`} /> Save password (Credential Manager)
            </div>
          </div>
        </div>
        <div className="foot">
          {test && (
            <span className={`test ${test.ok ? "ok" : "fail"}`}>
              {test.ok ? "✓" : "✕"} {test.msg}
            </span>
          )}
          <button className="btn ghost" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button className="btn" disabled={busy} onClick={runTest}>
            Test
          </button>
          <button className="btn primary" disabled={busy} onClick={connect}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
