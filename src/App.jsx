import React, { useState, useEffect, useRef, useCallback } from "react";

// ---------- helpers ----------

const POSITION_ORDER_FRONT = [4, 3, 2]; // front row, left to right (net at top)
const POSITION_ORDER_BACK = [5, 6, 1]; // back row, left to right

function emptyPositions() {
  return { 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" };
}

function rotate(pos) {
  return {
    1: pos[2],
    2: pos[3],
    3: pos[4],
    4: pos[5],
    5: pos[6],
    6: pos[1],
  };
}

function setterPosition(pos, setterName) {
  for (const key of Object.keys(pos)) {
    if (pos[key] && pos[key] === setterName) return Number(key);
  }
  return null;
}

function newSet(setNumber, prevPlayers) {
  return {
    setNumber,
    players: prevPlayers ? { ...prevPlayers } : emptyPositions(),
    setter: "",
    initialServer: "us",
    positions: emptyPositions(),
    serving: "us",
    score: { us: 0, opponent: 0 },
    history: [],
    completed: false,
    winner: null,
  };
}

function isSetPoint(score, isDecider) {
  const target = isDecider ? 15 : 25;
  const { us, opponent } = score;
  if ((us >= target || opponent >= target) && Math.abs(us - opponent) >= 2) {
    return us > opponent ? "us" : "opponent";
  }
  return null;
}

const STORAGE_KEY = "volleybal-wedstrijd";
const appStorage = {
  async get(key) { return { value: window.localStorage.getItem(key) }; },
  async set(key, value) { window.localStorage.setItem(key, value); },
  async delete(key) { window.localStorage.removeItem(key); },
};

// ---------- main component ----------

export default function App() {
  const [teamName, setTeamName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [phase, setPhase] = useState("teamSetup"); // teamSetup | setSetup | live | setOver | matchOver
  const [sets, setSets] = useState([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  // ---- load persisted match on mount ----
  useEffect(() => {
    (async () => {
      try {
        const result = await appStorage.get(STORAGE_KEY);
        if (result && result.value) {
          const data = JSON.parse(result.value);
          setTeamName(data.teamName || "");
          setOpponentName(data.opponentName || "");
          setPhase(data.phase || "teamSetup");
          setSets(data.sets || []);
          setCurrentSetIndex(data.currentSetIndex || 0);
        }
      } catch (e) {
        // niets opgeslagen, gewoon starten
      }
      setLoaded(true);
    })();
  }, []);

  // ---- persist on change (debounced) ----
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await appStorage.set(STORAGE_KEY, JSON.stringify({ teamName, opponentName, phase, sets, currentSetIndex }));
      } catch (e) {
        // opslaan mislukt, negeren
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [teamName, opponentName, phase, sets, currentSetIndex, loaded]);

  const currentSet = sets[currentSetIndex];

  const setsWonUs = sets.filter((s) => s.completed && s.winner === "us").length;
  const setsWonOpp = sets.filter((s) => s.completed && s.winner === "opponent").length;

  // ---- actions ----

  function startMatch() {
    if (!teamName.trim() || !opponentName.trim()) return;
    setSets([newSet(1)]);
    setCurrentSetIndex(0);
    setPhase("setSetup");
  }

  function updateCurrentSetField(field, value) {
    setSets((prev) => {
      const copy = [...prev];
      copy[currentSetIndex] = { ...copy[currentSetIndex], [field]: value };
      return copy;
    });
  }

  function updatePlayerName(posNum, value) {
    setSets((prev) => {
      const copy = [...prev];
      const set = { ...copy[currentSetIndex] };
      set.players = { ...set.players, [posNum]: value };
      copy[currentSetIndex] = set;
      return copy;
    });
  }

  function confirmLineup() {
    const set = currentSet;
    const names = Object.values(set.players).map((n) => n.trim());
    if (names.some((n) => !n)) return;
    setSets((prev) => {
      const copy = [...prev];
      copy[currentSetIndex] = {
        ...copy[currentSetIndex],
        positions: { ...set.players },
        serving: set.initialServer,
        score: { us: 0, opponent: 0 },
        history: [],
      };
      return copy;
    });
    setPhase("live");
  }

  const awardPoint = useCallback(
    (winner) => {
      setSets((prev) => {
        const copy = [...prev];
        const set = { ...copy[currentSetIndex] };
        const newScore = { ...set.score, [winner]: set.score[winner] + 1 };
        let newPositions = set.positions;
        let newServing = set.serving;
        const serviceChanged = winner !== set.serving;
        const rotated = serviceChanged && winner === "us";
        if (serviceChanged) {
          newServing = winner;
          if (winner === "us") newPositions = rotate(set.positions);
        }
        const snapshot = {
          positions: { ...set.positions }, score: { ...set.score }, serving: set.serving,
          point: { number: set.history.length + 1, winner, scoreAfter: newScore,
            servingBefore: set.serving, servingAfter: newServing, serviceChanged, rotated,
            timestamp: new Date().toISOString() }
        };
        set.history = [...set.history, snapshot];

        set.score = newScore;
        set.positions = newPositions;
        set.serving = newServing;

        const isDecider = setsWonUs === 2 && setsWonOpp === 2;
        const winnerOfSet = isSetPoint(newScore, isDecider);
        if (winnerOfSet) {
          set.completed = true;
          set.winner = winnerOfSet;
        }

        copy[currentSetIndex] = set;
        return copy;
      });
    },
    [currentSetIndex, setsWonUs, setsWonOpp]
  );

  function undoPoint() {
    setSets((prev) => {
      const copy = [...prev];
      const set = { ...copy[currentSetIndex] };
      if (set.history.length === 0) return prev;
      const last = set.history[set.history.length - 1];
      set.positions = last.positions;
      set.score = last.score;
      set.serving = last.serving;
      set.history = set.history.slice(0, -1);
      set.completed = false;
      set.winner = null;
      copy[currentSetIndex] = set;
      return copy;
    });
  }

  function goToNextSet() {
    const newSetsWonUs = sets.filter((s) => s.completed && s.winner === "us").length;
    const newSetsWonOpp = sets.filter((s) => s.completed && s.winner === "opponent").length;
    if (newSetsWonUs >= 3 || newSetsWonOpp >= 3) {
      setPhase("matchOver");
      return;
    }
    const nextNumber = currentSet.setNumber + 1;
    setSets((prev) => [...prev, newSet(nextNumber, currentSet.players)]);
    setCurrentSetIndex((i) => i + 1);
    setPhase("setSetup");
  }

  async function resetMatch() {
    setTeamName("");
    setOpponentName("");
    setSets([]);
    setCurrentSetIndex(0);
    setPhase("teamSetup");
    try {
      await appStorage.delete(STORAGE_KEY);
    } catch (e) {
      // negeren
    }
  }

  // watch for set completion to change phase
  useEffect(() => {
    if (currentSet && currentSet.completed && phase === "live") {
      setPhase("setOver");
    }
  }, [currentSet, phase]);

  if (!loaded) {
    return (
      <div style={styles.loadingScreen}>
        <style>{globalCss}</style>
        <div style={styles.loadingText}>Wedstrijd laden…</div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>

      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <div style={styles.eyebrowless}>Volleybal · 5-1 systeem</div>
            <h1 style={styles.title}>
              {teamName || "Ons team"} <span style={styles.vs}>tegen</span>{" "}
              {opponentName || "Tegenstander"}
            </h1>
          </div>
          {sets.length > 0 && (
            <div style={styles.setTally}>
              <div style={styles.setTallyNum}>{setsWonUs}</div>
              <div style={styles.setTallyDash}>–</div>
              <div style={styles.setTallyNumOpp}>{setsWonOpp}</div>
            </div>
          )}
        </div>
      </header>

      <main style={styles.main}>
        {phase === "teamSetup" && (
          <TeamSetup
            teamName={teamName}
            opponentName={opponentName}
            setTeamName={setTeamName}
            setOpponentName={setOpponentName}
            onStart={startMatch}
          />
        )}

        {phase === "setSetup" && currentSet && (
          <SetSetup
            set={currentSet}
            teamName={teamName}
            opponentName={opponentName}
            updatePlayerName={updatePlayerName}
            updateField={updateCurrentSetField}
            onConfirm={confirmLineup}
          />
        )}

        {phase === "live" && currentSet && (
          <LiveMatch
            set={currentSet}
            teamName={teamName}
            opponentName={opponentName}
            onPoint={awardPoint}
            onUndo={undoPoint}
            isDecider={setsWonUs === 2 && setsWonOpp === 2}
          />
        )}

        {phase === "setOver" && currentSet && (
          <SetOver
            set={currentSet}
            teamName={teamName}
            opponentName={opponentName}
            setsWonUs={setsWonUs}
            setsWonOpp={setsWonOpp}
            onNext={goToNextSet}
          />
        )}

        {phase === "matchOver" && (
          <MatchOver
            sets={sets}
            teamName={teamName}
            opponentName={opponentName}
            setsWonUs={setsWonUs}
            setsWonOpp={setsWonOpp}
            onReset={resetMatch}
          />
        )}
      </main>

      {sets.length > 0 && phase !== "teamSetup" && (
        <footer style={styles.footer}>
          <SetHistoryStrip sets={sets} currentSetIndex={currentSetIndex} />
          <button style={styles.resetLink} onClick={resetMatch}>
            Nieuwe wedstrijd starten
          </button>
        </footer>
      )}
    </div>
  );
}

// ---------- subcomponents ----------

function TeamSetup({ teamName, opponentName, setTeamName, setOpponentName, onStart }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Nieuwe wedstrijd</h2>
      <p style={styles.cardSubtitle}>
        Vul de naam van je team en de tegenstander in om te beginnen.
      </p>
      <label style={styles.label}>Jouw team</label>
      <input
        style={styles.input}
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="bijv. VC Dijkzicht"
      />
      <label style={styles.label}>Tegenstander</label>
      <input
        style={styles.input}
        value={opponentName}
        onChange={(e) => setOpponentName(e.target.value)}
        placeholder="bijv. Smash '72"
      />
      <button
        style={{
          ...styles.primaryButton,
          opacity: teamName.trim() && opponentName.trim() ? 1 : 0.45,
        }}
        onClick={onStart}
        disabled={!teamName.trim() || !opponentName.trim()}
      >
        Wedstrijd starten
      </button>
    </div>
  );
}

function SetSetup({ set, teamName, opponentName, updatePlayerName, updateField, onConfirm }) {
  const allFilled = Object.values(set.players).every((n) => n.trim());
  const names = Object.values(set.players).map((n) => n.trim()).filter(Boolean);

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Opstelling — set {set.setNumber}</h2>
      <p style={styles.cardSubtitle}>
        Vul de startopstelling in. Positie 1 is de service-positie (rechtsachter).
      </p>

      <div style={styles.courtGridSetup}>
        <div style={styles.netLabelRow}>
          <div style={styles.netLine} />
          <span style={styles.netLabel}>net</span>
        </div>
        <div style={styles.courtRow}>
          {POSITION_ORDER_FRONT.map((pos) => (
            <PositionInput
              key={pos}
              pos={pos}
              value={set.players[pos]}
              onChange={(v) => updatePlayerName(pos, v)}
            />
          ))}
        </div>
        <div style={styles.courtRow}>
          {POSITION_ORDER_BACK.map((pos) => (
            <PositionInput
              key={pos}
              pos={pos}
              value={set.players[pos]}
              onChange={(v) => updatePlayerName(pos, v)}
              isServe={pos === 1}
            />
          ))}
        </div>
      </div>

      <label style={styles.label}>Wie is de spelverdeler?</label>
      <select
        style={styles.input}
        value={set.setter}
        onChange={(e) => updateField("setter", e.target.value)}
      >
        <option value="">Kies speler…</option>
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <label style={styles.label}>Wie serveert eerst deze set?</label>
      <div style={styles.toggleRow}>
        <ToggleButton
          active={set.initialServer === "us"}
          onClick={() => updateField("initialServer", "us")}
        >
          {teamName}
        </ToggleButton>
        <ToggleButton
          active={set.initialServer === "opponent"}
          onClick={() => updateField("initialServer", "opponent")}
        >
          {opponentName}
        </ToggleButton>
      </div>

      <button
        style={{ ...styles.primaryButton, opacity: allFilled ? 1 : 0.45 }}
        onClick={onConfirm}
        disabled={!allFilled}
      >
        Set beginnen
      </button>
    </div>
  );
}

function PositionInput({ pos, value, onChange, isServe }) {
  return (
    <div style={styles.posCell}>
      <div style={styles.posNumBadge}>{pos}</div>
      <input
        style={styles.posInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Naam"
      />
      {isServe && <div style={styles.serveHint}>service</div>}
    </div>
  );
}

function ToggleButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.toggleButton,
        ...(active ? styles.toggleButtonActive : {}),
      }}
    >
      {children}
    </button>
  );
}

function LiveMatch({ set, teamName, opponentName, onPoint, onUndo, isDecider }) {
  const setterPos = setterPosition(set.positions, set.setter);
  const target = isDecider ? 15 : 25;

  return (
    <div style={styles.liveWrap}>
      <div style={styles.scoreboard}>
        <div style={styles.scoreBlock}>
          <div style={styles.scoreName}>{teamName}</div>
          <div style={{ ...styles.scoreNum, color: "var(--ball-orange)" }}>{set.score.us}</div>
        </div>
        <div style={styles.scoreMid}>
          <div style={styles.setLabel}>set {set.setNumber}</div>
          <div style={styles.targetLabel}>tot {target}</div>
        </div>
        <div style={styles.scoreBlock}>
          <div style={styles.scoreName}>{opponentName}</div>
          <div style={{ ...styles.scoreNum, color: "var(--opp-red)" }}>{set.score.opponent}</div>
        </div>
      </div>

      <div style={styles.servingIndicator}>
        {set.serving === "us"
          ? `${teamName} heeft de service`
          : `${opponentName} heeft de service`}
      </div>

      <div style={styles.courtGrid}>
        <div style={styles.netLabelRow}>
          <div style={styles.netLine} />
          <span style={styles.netLabel}>net</span>
        </div>
        <div style={styles.courtRow}>
          {POSITION_ORDER_FRONT.map((pos) => (
            <CourtCell
              key={pos}
              pos={pos}
              name={set.positions[pos]}
              isServer={pos === 1 && set.serving === "us"}
              isSetter={pos === setterPos}
            />
          ))}
        </div>
        <div style={styles.courtRow}>
          {POSITION_ORDER_BACK.map((pos) => (
            <CourtCell
              key={pos}
              pos={pos}
              name={set.positions[pos]}
              isServer={pos === 1 && set.serving === "us"}
              isSetter={pos === setterPos}
            />
          ))}
        </div>
      </div>

      <div style={styles.pointButtons}>
        <button
          style={{ ...styles.pointButton, background: "var(--ball-orange)" }}
          onClick={() => onPoint("us")}
        >
          Punt voor {teamName}
        </button>
        <button
          style={{ ...styles.pointButton, background: "var(--opp-red)" }}
          onClick={() => onPoint("opponent")}
        >
          Punt voor {opponentName}
        </button>
      </div>

      <button
        style={styles.undoButton}
        onClick={onUndo}
        disabled={set.history.length === 0}
      >
        Laatste punt ongedaan maken
      </button>
      <PointHistory set={set} teamName={teamName} opponentName={opponentName} />
    </div>
  );
}

function CourtCell({ pos, name, isServer, isSetter }) {
  return (
    <div
      style={{
        ...styles.courtCell,
        ...(isServer ? styles.courtCellServing : {}),
      }}
    >
      <div style={styles.courtCellPos}>{pos}</div>
      <div style={styles.courtCellName}>{name || "—"}</div>
      {isSetter && <div style={styles.setterTag}>S</div>}
      {isServer && <div style={styles.serverBall}>●</div>}
    </div>
  );
}

function SetOver({ set, teamName, opponentName, setsWonUs, setsWonOpp, onNext }) {
  const winnerName = set.winner === "us" ? teamName : opponentName;
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Set {set.setNumber} gewonnen door {winnerName}</h2>
      <p style={styles.cardSubtitle}>
        Eindstand: {set.score.us} – {set.score.opponent}. Stand in sets: {setsWonUs} – {setsWonOpp}.
      </p>
      <PointHistory set={set} teamName={teamName} opponentName={opponentName} />
      <button style={styles.primaryButton} onClick={onNext}>
        Volgende set voorbereiden
      </button>
    </div>
  );
}

function MatchOver({ sets, teamName, opponentName, setsWonUs, setsWonOpp, onReset }) {
  const matchWinner = setsWonUs > setsWonOpp ? teamName : opponentName;
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>{matchWinner} wint de wedstrijd</h2>
      <p style={styles.cardSubtitle}>
        Eindstand in sets: {setsWonUs} – {setsWonOpp}
      </p>
      <div style={styles.setSummaryList}>
        {sets.map((s) => (
          <div key={s.setNumber} style={styles.setSummaryRow}>
            <span>Set {s.setNumber}</span>
            <span>
              {s.score.us} – {s.score.opponent}
            </span>
          </div>
        ))}
      </div>
      <div style={styles.matchHistoryWrap}>{sets.map((set) => (
        <PointHistory key={set.setNumber} set={set} teamName={teamName} opponentName={opponentName} />
      ))}</div>
      <button style={styles.primaryButton} onClick={onReset}>
        Nieuwe wedstrijd starten
      </button>
    </div>
  );
}

function SetHistoryStrip({ sets, currentSetIndex }) {
  return (
    <div style={styles.historyStrip}>
      {sets.map((s, i) => (
        <div
          key={s.setNumber}
          style={{
            ...styles.historyChip,
            ...(i === currentSetIndex ? styles.historyChipActive : {}),
          }}
        >
          <span>Set {s.setNumber}</span>
          <span style={styles.historyChipScore}>
            {s.score.us}–{s.score.opponent}
          </span>
        </div>
      ))}
    </div>
  );
}

function PointHistory({ set, teamName, opponentName }) {
  const [open, setOpen] = useState(false);
  const entries = set.history || [];
  return (
    <section style={styles.pointHistory}>
      <button type="button" style={styles.historyToggle} onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span>Puntenhistorie set {set.setNumber}</span><span>{entries.length} punten {open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={styles.pointHistoryList}>
        {entries.length === 0 && <div style={styles.emptyHistory}>Er zijn nog geen punten geregistreerd.</div>}
        {[...entries].reverse().map((entry, ri) => {
          const i = entries.length - 1 - ri;
          const event = entry.point;
          const winnerName = event?.winner === "us" ? teamName : event?.winner === "opponent" ? opponentName : "Onbekend";
          const scoreAfter = event?.scoreAfter || entries[i + 1]?.score || set.score;
          const time = event?.timestamp ? new Date(event.timestamp).toLocaleTimeString("nl-NL", {hour:"2-digit",minute:"2-digit",second:"2-digit"}) : null;
          return <div key={`${set.setNumber}-${i}`} style={styles.pointHistoryRow}>
            <div style={styles.pointHistoryMain}><strong>Punt {i + 1}: {winnerName}</strong>
              <span style={styles.pointHistoryMeta}>{event?.rotated ? "Service overgenomen, team roteert" : event?.serviceChanged ? "Servicewissel" : "Service behouden"}{time ? ` · ${time}` : ""}</span>
            </div><div style={styles.pointHistoryScore}>{scoreAfter.us}–{scoreAfter.opponent}</div>
          </div>;
        })}
      </div>}
    </section>
  );
}

// ---------- styles ----------

const globalCss = `

:root {
  --court-navy: #142138;
  --panel: #1c2c49;
  --panel-light: #24365a;
  --line: #cfd6e4;
  --line-dim: #8c97ae;
  --ball-orange: #e2933c;
  --opp-red: #c15646;
  --setter-gold: #e9c46a;
}

* { box-sizing: border-box; }

button { font-family: Inter, Arial, sans-serif; cursor: pointer; border: none; }
input, select { font-family: Inter, Arial, sans-serif; }
button:disabled { cursor: not-allowed; }
`;

const styles = {
  loadingScreen: {
    minHeight: "100vh",
    background: "var(--court-navy)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, Arial, sans-serif",
  },
  loadingText: { color: "var(--line-dim)", fontSize: 15 },

  app: {
    minHeight: "100vh",
    background:
      "radial-gradient(ellipse 900px 500px at 50% -10%, #1e304f 0%, var(--court-navy) 60%)",
    color: "var(--line)",
    fontFamily: "Inter, Arial, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    padding: "20px 20px 16px",
  },
  headerInner: {
    maxWidth: 480,
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  eyebrowless: {
    fontSize: 12.5,
    color: "var(--line-dim)",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Arial Narrow, Arial, sans-serif",
    fontWeight: 600,
    fontSize: 21,
    margin: 0,
    lineHeight: 1.25,
  },
  vs: { color: "var(--line-dim)", fontWeight: 400, fontSize: 16 },
  setTally: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    fontFamily: "Arial Narrow, Arial, sans-serif",
    fontSize: 26,
    fontWeight: 600,
    flexShrink: 0,
  },
  setTallyNum: { color: "var(--ball-orange)" },
  setTallyNumOpp: { color: "var(--opp-red)" },
  setTallyDash: { color: "var(--line-dim)", fontSize: 18 },

  main: {
    flex: 1,
    maxWidth: 480,
    width: "100%",
    margin: "0 auto",
    padding: "20px 16px 12px",
  },

  card: {
    background: "var(--panel)",
    borderRadius: 14,
    padding: 22,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  cardTitle: {
    fontFamily: "Arial Narrow, Arial, sans-serif",
    fontWeight: 600,
    fontSize: 19,
    margin: "0 0 6px",
  },
  cardSubtitle: {
    fontSize: 13.5,
    color: "var(--line-dim)",
    margin: "0 0 18px",
    lineHeight: 1.5,
  },
  label: {
    display: "block",
    fontSize: 12.5,
    color: "var(--line-dim)",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    width: "100%",
    background: "var(--panel-light)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "var(--line)",
    fontSize: 14.5,
    outline: "none",
  },
  primaryButton: {
    width: "100%",
    marginTop: 22,
    background: "var(--ball-orange)",
    color: "#1a1206",
    fontWeight: 600,
    fontSize: 15,
    padding: "12px 16px",
    borderRadius: 9,
  },

  courtGridSetup: { marginTop: 4 },
  courtGrid: { margin: "18px 0" },
  netLabelRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  netLine: {
    flex: 1,
    height: 2,
    background:
      "repeating-linear-gradient(90deg, var(--line-dim) 0 6px, transparent 6px 12px)",
  },
  netLabel: { fontSize: 11.5, color: "var(--line-dim)" },
  courtRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
    marginBottom: 8,
  },
  posCell: {
    background: "var(--panel-light)",
    borderRadius: 8,
    padding: "8px 8px 10px",
    position: "relative",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  posNumBadge: {
    fontFamily: "Arial Narrow, Arial, sans-serif",
    fontSize: 11,
    color: "var(--line-dim)",
    marginBottom: 4,
  },
  posInput: {
    width: "100%",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
    color: "var(--line)",
    fontSize: 13.5,
    padding: "3px 0",
    outline: "none",
  },
  serveHint: {
    position: "absolute",
    top: 8,
    right: 8,
    fontSize: 9.5,
    color: "var(--ball-orange)",
  },

  toggleRow: { display: "flex", gap: 8, marginTop: 6 },
  toggleButton: {
    flex: 1,
    background: "var(--panel-light)",
    color: "var(--line-dim)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "10px 8px",
    fontSize: 13.5,
    fontWeight: 500,
  },
  toggleButtonActive: {
    background: "var(--ball-orange)",
    color: "#1a1206",
    borderColor: "var(--ball-orange)",
    fontWeight: 600,
  },

  liveWrap: {},
  scoreboard: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    background: "var(--panel)",
    borderRadius: 14,
    padding: "18px 14px",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  scoreBlock: { textAlign: "center" },
  scoreName: {
    fontSize: 12.5,
    color: "var(--line-dim)",
    marginBottom: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  scoreNum: {
    fontFamily: "Arial Narrow, Arial, sans-serif",
    fontWeight: 700,
    fontSize: 44,
    lineHeight: 1,
  },
  scoreMid: { textAlign: "center", padding: "0 10px" },
  setLabel: {
    fontFamily: "Arial Narrow, Arial, sans-serif",
    fontSize: 13,
    color: "var(--line-dim)",
  },
  targetLabel: { fontSize: 10.5, color: "var(--line-dim)", marginTop: 2 },

  servingIndicator: {
    textAlign: "center",
    fontSize: 12.5,
    color: "var(--line-dim)",
    margin: "10px 0 4px",
  },

  courtCell: {
    background: "var(--panel-light)",
    borderRadius: 8,
    padding: "10px 8px",
    textAlign: "center",
    position: "relative",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  courtCellServing: {
    borderColor: "var(--ball-orange)",
    boxShadow: "0 0 0 1px var(--ball-orange)",
  },
  courtCellPos: {
    fontFamily: "Arial Narrow, Arial, sans-serif",
    fontSize: 11,
    color: "var(--line-dim)",
  },
  courtCellName: {
    fontSize: 13.5,
    marginTop: 3,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  setterTag: {
    position: "absolute",
    top: 6,
    right: 6,
    fontSize: 10,
    fontWeight: 700,
    color: "#1a1206",
    background: "var(--setter-gold)",
    borderRadius: 4,
    width: 15,
    height: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  serverBall: {
    position: "absolute",
    bottom: 4,
    left: 6,
    fontSize: 8,
    color: "var(--ball-orange)",
  },

  pointButtons: { display: "flex", flexDirection: "column", gap: 10, marginTop: 6 },
  pointButton: {
    padding: "16px 14px",
    borderRadius: 10,
    color: "#fff",
    fontWeight: 600,
    fontSize: 15,
  },
  undoButton: {
    width: "100%",
    marginTop: 12,
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "var(--line-dim)",
    borderRadius: 9,
    padding: "10px 14px",
    fontSize: 13,
  },

  setSummaryList: { margin: "6px 0 4px" },
  setSummaryRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: 14,
  },

  footer: {
    maxWidth: 480,
    width: "100%",
    margin: "0 auto",
    padding: "6px 16px 26px",
  },
  historyStrip: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 },
  historyChip: {
    flexShrink: 0,
    background: "var(--panel)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 11.5,
    color: "var(--line-dim)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  historyChipActive: { borderColor: "var(--ball-orange)", color: "var(--line)" },
  historyChipScore: { fontFamily: "Arial Narrow, Arial, sans-serif", fontSize: 13, color: "var(--line)" },
  resetLink: {
    display: "block",
    margin: "14px auto 0",
    background: "transparent",
    color: "var(--line-dim)",
    fontSize: 12.5,
    textDecoration: "underline",
  },
  pointHistory: { marginTop: 16, background: "var(--panel)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" },
  historyToggle: { width: "100%", display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "var(--panel-light)", color: "var(--line)", fontSize: 12.5, fontWeight: 600, textAlign: "left" },
  pointHistoryList: { maxHeight: 320, overflowY: "auto" },
  pointHistoryRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)" },
  pointHistoryMain: { display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5 },
  pointHistoryMeta: { color: "var(--line-dim)", fontSize: 10.5 },
  pointHistoryScore: { fontFamily: "Arial Narrow, Arial, sans-serif", color: "var(--ball-orange)", fontWeight: 700, fontSize: 17, flexShrink: 0 },
  emptyHistory: { padding: 14, color: "var(--line-dim)", fontSize: 12.5 },
  matchHistoryWrap: { marginTop: 18 },
};
